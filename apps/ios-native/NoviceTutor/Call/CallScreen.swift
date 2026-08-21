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
        case ready(JoinGrant, sessionId: String, grants: MediaPermissions.Grants)
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

            case .ready(let grant, let sessionId, let grants):
                RoomView(
                    grant: grant,
                    sessionId: sessionId,
                    grants: grants,
                    onExit: { reason in
                        switch reason {
                        case .left:
                            dismiss()
                        case .classEnded:
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
        // Asked for before the join, not after: `connecting=1` is what rings
        // every booked student, and a teacher who is still deciding whether to
        // grant the microphone has not started the class yet.
        let grants = await MediaPermissions.request()

        do {
            switch try await APIClient.shared.join(sessionId: classSession.id, connecting: true) {
            case .grant(let grant, let sessionId):
                phase = .ready(grant, sessionId: sessionId, grants: grants)
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
}
