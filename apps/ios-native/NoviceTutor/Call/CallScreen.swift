import SwiftUI

/// The class itself.
///
/// Joining is two steps and they fail differently, so they are kept apart:
/// asking the server for a room (which can refuse — too early, not your class,
/// merged elsewhere) and connecting to LiveKit with what it gave back (which
/// can fail on the network). A person who is early should be told they are
/// early, not shown a spinner that never resolves.
struct CallScreen: View {
    let classSession: ClassSession

    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session

    @State private var phase: Phase = .requesting

    // Not named `State`: that shadows SwiftUI's own property wrapper and the
    // compiler rejects `@State` in the same type.
    private enum Phase {
        case requesting
        case ready(JoinGrant)
        case failed(String)
    }

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()

            switch phase {
            case .requesting:
                VStack(spacing: 16) {
                    ProgressView().controlSize(.large).tint(.white)
                    Text("Joining \(classSession.displayTitle)…")
                        .foregroundStyle(.white.opacity(0.8))
                }

            case .ready(let grant):
                RoomView(grant: grant, onLeave: { dismiss() })

            case .failed(let message):
                VStack(spacing: 20) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(.orange)
                    Text(message)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 32)
                    Button("Close") { dismiss() }
                        .buttonStyle(.bordered)
                        .tint(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await request() }
    }

    private func request() async {
        do {
            let (grant, _) = try await APIClient.shared.join(sessionId: classSession.id)
            phase = .ready(grant)
        } catch APIError.unauthorized {
            session.sessionExpired()
            dismiss()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
