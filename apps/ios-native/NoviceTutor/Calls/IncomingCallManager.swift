import AudioToolbox
import Foundation
import Observation
import SwiftUI
import UIKit

/// Manages incoming call polling, audio ringtones, haptic alerts, and call state.
///
/// The poll used to run flat out at 2.5s for as long as the app was signed in,
/// and — because `RootView` only ever stopped the *live class* monitor on
/// backgrounding, while the app declares the `audio` background mode — it kept
/// running with the screen off. That is roughly 24 requests a minute from a
/// phone in somebody's pocket.
///
/// It now runs at whatever pace `LiveClassMonitor` was told to use (the cadence
/// rides on the live-class response; see `lib/poll-cadence.ts`): 2.5s in and
/// around a booked slot, slower when a ring is not plausible, and slower again
/// once push is registered, at which point this is a safety net rather than the
/// mechanism. It is not allowed to stop entirely while idle, because a
/// teacher's ad-hoc "Call Now" is not tied to any booked slot.
@Observable
@MainActor
final class IncomingCallManager {
    static let shared = IncomingCallManager()

    private(set) var activeCall: IncomingCall?
    private(set) var activeCallSession: ClassSession?
    private(set) var isRinging = false
    private(set) var isResponding = false

    private var pollingTask: Task<Void, Never>?
    private var ringTask: Task<Void, Never>?
    private var isPolling = false

    /// The cadence used before the server has said anything, and the floor for
    /// everything below. `/api/calls/incoming` only surfaces invites from the
    /// last 60 seconds, so this governs how fast the phone rings, never whether
    /// it rings at all.
    private static let fastInterval: Duration = .seconds(2.5)

    /// What idle costs once push is working. Push is then the interrupt and
    /// this exists only for the case where it was throttled or dropped.
    private static let pushBackedIdleInterval: Duration = .seconds(30)

    private init() {}

    /// Start polling for incoming calls when user is signed in
    func startPolling() {
        guard !isPolling else { return }
        isPolling = true

        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                guard let interval = self?.currentInterval else { return }
                try? await Task.sleep(for: interval)
            }
        }
    }

    /// Re-read every cycle rather than cached: the live-class poll is what
    /// updates it, and reacting on the next tick is soon enough for a value
    /// that only moves between 2.5s and a minute.
    private var currentInterval: Duration {
        // A ring is on screen. Accept, decline and the teacher hanging up all
        // resolve through this poll, so stay fast regardless of the hint.
        if activeCall != nil { return IncomingCallManager.fastInterval }

        var interval = max(LiveClassMonitor.shared.ringInterval, IncomingCallManager.fastInterval)

        // Idle and reachable by push: let it be genuinely idle.
        if interval > IncomingCallManager.fastInterval, PushService.shared.canReceivePush {
            interval = max(interval, IncomingCallManager.pushBackedIdleInterval)
        }

        if ProcessInfo.processInfo.isLowPowerModeEnabled {
            interval = interval * 2
        }

        return interval
    }

    /// A push said the ring is over. Clears without waiting for the poll to
    /// agree, so the phone stops making noise the moment the teacher hangs up.
    func callEnded() {
        guard activeCall != nil else { return }
        stopRinging()
        activeCall = nil
    }

    /// Stop polling and forget everything — sign-out, and nothing else. A
    /// shared handset must not keep the previous person's call on screen.
    func stopPolling() {
        suspendPolling()
        activeCall = nil
    }

    /// Stop asking, but remember what was on screen.
    ///
    /// For backgrounding and for being inside a call. The ringtone stops
    /// because a phone that keeps chiming after you have walked away from the
    /// app is a bug, but `activeCall` survives: coming back to the foreground
    /// shows the ring again, and the first poll a second later either confirms
    /// it or clears it because the 60s invite window has passed.
    func suspendPolling() {
        isPolling = false
        pollingTask?.cancel()
        pollingTask = nil
        stopRinging()
    }

    private func poll() async {
        guard !isResponding else { return }
        do {
            let incoming = try await APIClient.shared.incomingCall()
            if let incoming {
                if activeCall != incoming {
                    activeCall = incoming
                    startRinging()
                }
            } else {
                if activeCall != nil {
                    // Call was cancelled by teacher or answered elsewhere
                    stopRinging()
                    activeCall = nil
                }
            }
        } catch {
            // Best effort poll
        }
    }

    private func startRinging() {
        guard !isRinging else { return }
        isRinging = true

        ringTask?.cancel()
        ringTask = Task { [weak self] in
            let generator = UIImpactFeedbackGenerator(style: .heavy)
            generator.prepare()

            while self?.isRinging == true && !Task.isCancelled {
                // Play standard incoming call ringtone sound ID 1005 (SMS/Ringtone chime)
                AudioServicesPlaySystemSound(1005)
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                generator.impactOccurred()

                try? await Task.sleep(nanoseconds: 1_800_000_000) // 1.8s loop
            }
        }
    }

    private func stopRinging() {
        isRinging = false
        ringTask?.cancel()
        ringTask = nil
    }

    func accept() async {
        guard let call = activeCall, !isResponding else { return }
        isResponding = true
        stopRinging()

        do {
            let sessionId = try await APIClient.shared.acceptCall(id: call.id)
            let actualSessionId = sessionId.isEmpty ? call.sessionId : sessionId

            let session = ClassSession(
                id: actualSessionId,
                title: "Quran Class",
                type: "INDIVIDUAL",
                status: .inProgress,
                scheduledStart: Date.now,
                scheduledEnd: Date.now.addingTimeInterval(3600),
                teacher: ClassSession.Teacher(name: call.callerName)
            )

            activeCall = nil
            isResponding = false
            activeCallSession = session
        } catch {
            activeCall = nil
            isResponding = false
        }
    }

    func decline() async {
        guard let call = activeCall, !isResponding else { return }
        isResponding = true
        stopRinging()

        await APIClient.shared.declineCall(id: call.id)
        activeCall = nil
        isResponding = false
    }

    func dismissActiveCallSession() {
        activeCallSession = nil
    }
}
