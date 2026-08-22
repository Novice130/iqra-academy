import SwiftUI

/// The class is real, it just has not opened yet.
struct CallLobbyView: View {
    let waiting: JoinWaiting
    let onRetry: () async -> Void
    let onClose: () -> Void

    @State private var now = Date.now
    @State private var isPulsing = false

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 24) {
            // Radar pulsing clock icon
            ZStack {
                Circle()
                    .stroke(Theme.accent.opacity(isPulsing ? 0 : 0.4), lineWidth: 8)
                    .scaleEffect(isPulsing ? 1.5 : 1.0)
                    .frame(width: 80, height: 80)

                Circle()
                    .fill(Theme.accentGradient)
                    .frame(width: 80, height: 80)
                    .shadow(color: Theme.accent.opacity(0.4), radius: 16, y: 6)

                Image(systemName: "clock.badge.checkmark.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .padding(.bottom, 4)

            VStack(spacing: 8) {
                Text(waiting.sessionTitle ?? "Your Quran Class")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                if let teacher = waiting.teacherName {
                    HStack(spacing: 6) {
                        Image(systemName: "person.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Theme.accentSecondary)

                        Text("with \(teacher)")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }
            }

            if let start = waiting.scheduledStart {
                VStack(spacing: 8) {
                    Text(start, format: .dateTime.weekday(.wide).hour().minute())
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)

                    if start > now {
                        HStack(spacing: 6) {
                            Image(systemName: "hourglass.bottomhalf.filled")
                                .font(.caption)
                            Text("Starts in \(countdown(to: start))")
                                .font(.footnote.weight(.semibold))
                                .monospacedDigit()
                        }
                        .foregroundStyle(Theme.accentSecondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.08), in: Capsule())
                    }
                }
                .padding(.vertical, 8)
            }

            Text("The classroom opens shortly before class time. Please stay on this screen.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            HStack(spacing: 14) {
                Button {
                    Theme.haptic(.medium)
                    Task { await onRetry() }
                } label: {
                    Label("Check Room", systemImage: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(height: 48)
                        .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                Button(action: {
                    Theme.haptic(.light)
                    onClose()
                }) {
                    Text("Close")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.horizontal, 20)
                        .frame(height: 48)
                        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
            .padding(.top, 8)
        }
        .padding(32)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                }
                .shadow(color: Color.black.opacity(0.3), radius: 24, y: 12)
        }
        .padding(.horizontal, 20)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) {
                isPulsing = true
            }
        }
        .onReceive(tick) { instant in
            let wasBefore = waiting.scheduledStart.map { now < $0 } ?? false
            now = instant
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
