import SwiftUI

/// The class itself.
///
/// Joining is two steps and they fail differently, so they are kept apart:
/// asking the server for a room (which can refuse — too early, not your class,
/// merged elsewhere) and connecting to LiveKit with what it gave back (which
/// can fail on the network). A person who is early is told they are early,
/// not shown a spinner that never resolves.
struct CallScreen: View {
    let classSession: ClassSession

    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session

    @State private var phase: Phase = .preparing

    // Not named `State`: that shadows SwiftUI's own property wrapper and the
    // compiler rejects `@State` in the same type.
    private enum Phase {
        case preparing
        case waiting(JoinWaiting, sessionId: String)
        /// The server said yes; the person has not looked at themselves yet.
        case deviceCheck(JoinGrant, sessionId: String, grants: MediaPermissions.Grants)
        case ready(JoinGrant, sessionId: String, grants: MediaPermissions.Grants, choices: PreJoinChoices)
        case failed(String)
        case ended(String)
    }

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()

            switch phase {
            case .preparing:
                VStack(spacing: 16) {
                    ProgressView().controlSize(.large).tint(.white)
                    Text("Joining \(classSession.displayTitle)…")
                        .foregroundStyle(.white.opacity(0.8))
                }

            case .waiting(let waiting, _):
                CallLobbyView(
                    waiting: waiting,
                    onRetry: { await request() },
                    onClose: { dismiss() }
                )

            case .deviceCheck(let grant, let sessionId, let grants):
                PreJoinView(
                    userName: grant.userName,
                    teacherName: grant.isHost ? nil : grant.teacherName,
                    grants: grants,
                    onJoin: { micOn, cameraOn in
                        Task {
                            await connect(
                                sessionId: sessionId,
                                grants: grants,
                                choices: PreJoinChoices(micOn: micOn, cameraOn: cameraOn)
                            )
                        }
                    },
                    onCancel: { dismiss() }
                )

            case .ready(let grant, let sessionId, let grants, let choices):
                RoomView(
                    grant: grant,
                    sessionId: sessionId,
                    grants: grants,
                    choices: choices,
                    onExit: { reason in
                        switch reason {
                        case .left:
                            dismiss()
                        case .classEnded:
                            // Whoever ended it, the card offering to join is
                            // now wrong. Waiting up to 15s for the poller to
                            // agree would show it again on the way out.
                            LiveClassMonitor.shared.classEnded()
                            // The host who just ended it does not need telling.
                            if grant.isHost {
                                dismiss()
                            } else {
                                phase = .ended("Your teacher ended the class.")
                            }
                        case .joinedElsewhere:
                            phase = .ended("You joined this class on another device.")
                        case .connectionLost:
                            phase = .failed("The connection dropped.")
                        }
                    }
                )

            case .failed(let text):
                notice(text, icon: "exclamationmark.triangle", tint: .orange, retry: true)

            case .ended(let text):
                notice(text, icon: "checkmark.circle", tint: .white, retry: false)
            }
        }
        .preferredColorScheme(.dark)
        .task { await request() }
        // Nothing polls while a class is on screen. The ribbon that says "a
        // class is live" is pointless when you are looking at the class, a
        // second ring while you are in one is unwanted, and the radio is
        // already fully occupied by WebRTC.
        .onAppear {
            LiveClassMonitor.shared.stop()
            IncomingCallManager.shared.suspendPolling()
        }
        .onDisappear {
            LiveClassMonitor.shared.start()
            IncomingCallManager.shared.startPolling()
            // Forced: the answer held from before the call is exactly the one
            // that is now wrong, and the coalescing window would keep it.
            LiveClassMonitor.shared.wake(force: true)
        }
    }

    private func notice(
        _ text: String,
        icon: String,
        tint: Color,
        retry: Bool
    ) -> some View {
        VStack(spacing: 20) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(tint)
            Text(text)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 32)
            HStack(spacing: 12) {
                if retry {
                    Button("Try again") {
                        phase = .preparing
                        Task { await request() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                }
                Button("Close") { dismiss() }
                    .buttonStyle(.bordered)
                    .tint(.white)
            }
        }
    }

    private func request() async {
        // Asked for before the join, not after: the device check is useless
        // without a camera, and a person who declines it should be told what
        // they will get rather than shown a black rectangle.
        let grants = await MediaPermissions.request()

        do {
            // `connecting: false`. This first call only asks whether the class
            // is open and mints nothing that counts: `connecting=1` is what
            // rings every booked student and writes the attendance row, and
            // someone sitting on the device check has not joined anything.
            // The web client splits the same call the same way.
            switch try await APIClient.shared.join(sessionId: classSession.id, connecting: false) {
            case .grant(let grant, let sessionId):
                phase = .deviceCheck(grant, sessionId: sessionId, grants: grants)
            case .waiting(let waiting, let sessionId):
                phase = .waiting(waiting, sessionId: sessionId)
            }
        } catch APIError.unauthorized {
            session.sessionExpired()
            dismiss()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// The second half of joining, once the device check is done: re-ask with
    /// `connecting=1`, which is the call that rings the class and records
    /// attendance, and hand the fresh grant to the room.
    private func connect(
        sessionId: String,
        grants: MediaPermissions.Grants,
        choices: PreJoinChoices
    ) async {
        phase = .preparing
        do {
            switch try await APIClient.shared.join(sessionId: sessionId, connecting: true) {
            case .grant(let grant, let confirmedId):
                phase = .ready(grant, sessionId: confirmedId, grants: grants, choices: choices)
            case .waiting(let waiting, let waitingId):
                // The class closed between the device check and the tap.
                phase = .waiting(waiting, sessionId: waitingId)
            }
        } catch APIError.unauthorized {
            session.sessionExpired()
            dismiss()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
