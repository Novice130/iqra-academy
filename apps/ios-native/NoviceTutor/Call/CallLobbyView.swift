import SwiftUI

/// The class is real, it just has not opened yet.
///
/// The server, not the app, decides when a class opens, and it answers a
/// too-early join with a description of what the person is waiting for. Making
/// that a proper screen matters more than it looks: outside the join window
/// this is the whole app as far as the person in front of it is concerned.
struct CallLobbyView: View {
    let waiting: JoinWaiting
    let onRetry: () async -> Void
    let onClose: () -> Void

    @State private var now = Date.now

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "clock")
                .font(.system(size: 44))
                .foregroundStyle(Theme.accent)

            Text(waiting.sessionTitle ?? "Your class")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            if let teacher = waiting.teacherName {
                Text("with \(teacher)")
                    .foregroundStyle(.white.opacity(0.7))
            }

            if let start = waiting.scheduledStart {
                VStack(spacing: 6) {
                    Text(start, format: .dateTime.weekday(.wide).hour().minute())
                        .font(.headline)
                        .foregroundStyle(.white)
                    if start > now {
                        Text("Starts in \(countdown(to: start))")
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.7))
                            .monospacedDigit()
                    }
                }
                .padding(.top, 4)
            }

            Text("The room opens shortly before the class starts.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            HStack(spacing: 12) {
                Button("Try again") { Task { await onRetry() } }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                Button("Close", action: onClose)
                    .buttonStyle(.bordered)
                    .tint(.white)
            }
            .padding(.top, 6)
        }
        .padding(28)
        .onReceive(tick) { instant in
            let wasBefore = waiting.scheduledStart.map { now < $0 } ?? false
            now = instant
            // The moment the class time passes, ask once without being asked —
            // the person is already staring at the screen waiting for exactly
            // this, and making them tap is making them guess.
            if let start = waiting.scheduledStart, wasBefore, instant >= start {
                Task { await onRetry() }
            }
        }
    }

    private func countdown(to start: Date) -> String {
        let seconds = max(0, Int(start.timeIntervalSince(now)))
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let remainder = seconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remainder)
        }
        return String(format: "%d:%02d", minutes, remainder)
    }
}
