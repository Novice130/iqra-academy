import Foundation
import Observation
import SwiftUI

/// Whether one of your teachers is in a classroom right now.
///
/// This exists because the "Join classroom now" card used to outlive the class
/// it advertised. Two screens each fetched the answer once, when they appeared,
/// and neither ever asked again: a teacher could end the lesson and the phone
/// would keep offering to join it until the app was killed. Worse, both
/// screens loaded this alongside their bookings with `async let` and read the
/// pair with one `try await`, so a failure in the *bookings* call skipped the
/// live assignment entirely and pinned whatever was on screen.
///
/// So: one poller, owned by nobody, read by both screens — the same shape as
/// `IncomingCallManager`.
///
/// **The cadence is the server's to choose.** This used to tick every 15
/// seconds for as long as the app was open, which is the right rate for the
/// ten minutes either side of a lesson and absurd at three in the morning with
/// nothing booked until Thursday. The server knows the schedule, so it answers
/// every poll with how long to wait before the next one — see
/// `apps/web/src/lib/poll-cadence.ts`. The phone sleeps that long and no
/// longer, waking early only for the things that genuinely change the answer:
/// coming back to the foreground, leaving a call, or a push saying the class
/// is over.
@Observable
@MainActor
final class LiveClassMonitor {
    static let shared = LiveClassMonitor()

    private(set) var live: LiveClass?

    /// What the ring poll should be using, handed down from the same response.
    /// `IncomingCallManager` reads this at the top of each of its own cycles —
    /// it polls often enough that a new value lands within seconds, and that
    /// is cheaper than any observation plumbing between the two.
    private(set) var ringInterval: Duration = .seconds(2.5)

    /// Used until the server has answered once, and by an older server that
    /// sends no hint at all. The interval this class used to hardcode.
    private static let defaultInterval: Duration = .seconds(15)

    /// Bounds on anything the server asks for. The floor stops a bad answer
    /// turning the phone into a tight loop; the ceiling is how stale the
    /// schedule itself is allowed to get, since a class can be booked or
    /// started ad-hoc while the phone is asleep.
    private static let minInterval: Duration = .seconds(10)
    private static let maxInterval: Duration = .seconds(1800)

    /// A dropped request should not flap the card off and back on, but it must
    /// not hold it up forever either. Two misses is ~30s of silence.
    private static let failuresBeforeClearing = 2

    /// Three screens can each ask for a refresh in the same instant — a
    /// foreground, plus both tabs' `.task`. Without this that is four requests
    /// in a second and three of them are the same answer.
    private static let coalesceWindow: TimeInterval = 2

    private var pending: Task<Void, Never>?
    private var consecutiveFailures = 0
    private var serverInterval = LiveClassMonitor.defaultInterval
    private var lastPolledAt: Date?

    private init() {}

    func start() {
        guard pending == nil else { return }
        schedule(after: .zero)
    }

    func stop() {
        pending?.cancel()
        pending = nil
    }

    /// Signed out: forget the answer as well as stopping, or the next person to
    /// sign in on this phone is offered someone else's class.
    func reset() {
        stop()
        live = nil
        consecutiveFailures = 0
        serverInterval = LiveClassMonitor.defaultInterval
        ringInterval = .seconds(2.5)
        lastPolledAt = nil
    }

    /// Ask now, and re-time everything from now.
    ///
    /// The old version fired a second request *alongside* the sleeping loop
    /// instead of interrupting it, so a refresh cost an extra round trip and
    /// left the schedule where it was. This cancels the pending sleep, which is
    /// what makes waking up cheap enough to do on every foreground.
    ///
    /// `force` is for the moments where a stale answer is visible on screen —
    /// coming back from a call, or a push — and the coalescing window must not
    /// swallow the request.
    func wake(force: Bool = false) {
        guard shouldPoll(force: force) else { return }
        pending?.cancel()
        schedule(after: .zero)
    }

    /// The same thing, but the caller waits for the answer.
    ///
    /// Pull-to-refresh and a screen's first `.task` both want the ribbon
    /// settled before they stop showing a spinner, and `wake()` returns before
    /// the request has even been sent.
    func refreshNow() async {
        guard shouldPoll(force: false) else { return }
        pending?.cancel()
        await poll()
        schedule(after: nextInterval)
    }

    private func shouldPoll(force: Bool) -> Bool {
        if force { return true }
        guard let last = lastPolledAt else { return true }
        return Date.now.timeIntervalSince(last) >= LiveClassMonitor.coalesceWindow
    }

    /// The class just ended under us — LiveKit deleted the room, or a push
    /// said so. Waiting for the next poll to be told what we already know
    /// would show the card again on the way out.
    func classEnded() {
        live = nil
        consecutiveFailures = 0
        // The schedule has changed shape underneath us: whatever interval the
        // server picked for "a class is running" is now the wrong one.
        wake(force: true)
    }

    /// The next request, and every one after it.
    ///
    /// Deliberately one self-rescheduling task rather than a `while` loop with
    /// a sleep in it: cancelling a sleep is the whole mechanism, and a loop
    /// that owns its own sleep has no handle to cancel.
    private func schedule(after delay: Duration) {
        pending = Task { [weak self] in
            if delay > .zero {
                try? await Task.sleep(for: delay)
            }
            guard !Task.isCancelled, let self else { return }
            await self.poll()
            guard !Task.isCancelled else { return }
            let next = self.nextInterval
            #if DEBUG
            print("[poll] live-class -> live=\(self.live != nil) next=\(next) ring=\(self.ringInterval)")
            #endif
            self.schedule(after: next)
        }
    }

    /// What the server asked for, slowed down on a phone that is trying to
    /// survive the afternoon. Low Power Mode is the person telling you they
    /// care more about the battery than about a fifteen-second ribbon.
    private var nextInterval: Duration {
        guard ProcessInfo.processInfo.isLowPowerModeEnabled else { return serverInterval }
        return min(max(serverInterval * 3, LiveClassMonitor.defaultInterval), LiveClassMonitor.maxInterval)
    }

    private func poll() async {
        do {
            let response = try await APIClient.shared.liveClass()
            consecutiveFailures = 0
            lastPolledAt = .now
            apply(cadence: response.poll)
            // Assigns on `nil` too — not doing that is the whole bug. Guarded
            // only so an unchanged answer does not redraw two screens.
            if live?.sessionId != response.live?.sessionId {
                live = response.live
            }
        } catch {
            consecutiveFailures += 1
            lastPolledAt = .now
            if consecutiveFailures >= LiveClassMonitor.failuresBeforeClearing {
                live = nil
            }
            // Back off while the server or the network is unreachable, rather
            // than hammering it at the in-class rate. Doubling, capped.
            serverInterval = min(serverInterval * 2, LiveClassMonitor.maxInterval)
        }
    }

    private func apply(cadence: PollCadence?) {
        guard let cadence else {
            serverInterval = LiveClassMonitor.defaultInterval
            return
        }
        if let live = cadence.liveSeconds {
            serverInterval = LiveClassMonitor.clamp(
                .seconds(live),
                min: LiveClassMonitor.minInterval,
                max: LiveClassMonitor.maxInterval
            )
        }
        if let ring = cadence.ringSeconds {
            ringInterval = LiveClassMonitor.clamp(
                .seconds(ring),
                min: .seconds(2.5),
                max: .seconds(60)
            )
        }
    }

    private static func clamp(_ value: Duration, min lower: Duration, max upper: Duration) -> Duration {
        Swift.min(Swift.max(value, lower), upper)
    }
}
