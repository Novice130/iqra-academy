import SwiftUI

/// The host asked this device for something only its owner can give.
///
/// LiveKit refuses server-forced unmute by design, so "unmute them" does not
/// exist on any client — the teacher asks, and this is the ask. It sits over
/// the video rather than in a sheet because it is worth interrupting for and
/// worthless once the moment has passed.
struct HostRequestPrompt: View {
    let request: CallController.HostRequest
    let teacherName: String
    let onAccept: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        // Text above, buttons below. Side by side they wrapped a teacher's
        // name onto three lines at 402pt and pushed the banner half a screen
        // tall — over the very video it is asking about.
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: request == .microphone ? "mic.fill" : "video.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Theme.accentGradient))

                VStack(alignment: .leading, spacing: 2) {
                    Text(request == .microphone
                        ? "\(teacherName) asked you to unmute"
                        : "\(teacherName) asked for your camera")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white)
                    Text("Only you can turn it on.")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Spacer(minLength: 0)

                Button("Not now") { onDismiss() }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(.horizontal, 6)

                Button(request == .microphone ? "Unmute" : "Turn on") { onAccept() }
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 34)
                    .background(Capsule().fill(Theme.accent))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.15), lineWidth: 1)
                }
        }
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 12)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Somebody on a guest link, standing outside the room. Host only — nobody
/// else can answer, and the route that lists them refuses everybody else.
struct GuestKnockBanner: View {
    let guest: GuestKnock
    let waiting: Int
    let onAdmit: () -> Void
    let onDeny: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "hand.wave.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.live))

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(guest.name) wants to join")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white)
                    if waiting > 1 {
                        Text("\(waiting - 1) more waiting")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Spacer(minLength: 0)

                Button("Deny") { onDeny() }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(.horizontal, 6)

                Button("Admit") { onAdmit() }
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 34)
                    .background(Capsule().fill(Theme.live))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.15), lineWidth: 1)
                }
        }
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 12)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// A teacher alone in a room, for half an hour.
///
/// The case this exists for is a class nobody came to and a laptop left open:
/// the room stays `IN_PROGRESS`, the ribbon keeps advertising a live class,
/// and the attendance report keeps counting. Asking first matters — a teacher
/// waiting for a late student has not finished either, so silence for a minute
/// is what ends it, not the timer alone.
///
/// The numbers match the web client (`SoloInactivityPrompt.tsx`): 30 minutes
/// alone, one extension to 45, one minute to answer.
struct SoloInactivityPrompt: View {
    let isHost: Bool
    let isSolo: Bool
    let onEnd: () -> Void

    private static let initialTimeout: TimeInterval = 30 * 60
    private static let extendedTimeout: TimeInterval = 45 * 60
    private static let warningWindow = 60

    @State private var showing = false
    @State private var remaining = SoloInactivityPrompt.warningWindow
    @State private var hasExtended = false
    @State private var countdown: Task<Void, Never>?
    @State private var timer: Task<Void, Never>?

    var body: some View {
        Group {
            if showing {
                VStack(spacing: 14) {
                    Text("Still teaching?")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("You've been alone in this class for a while. It will end in \(remaining)s.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.8))

                    HStack(spacing: 10) {
                        Button("End class") {
                            stop()
                            onEnd()
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(height: 42)
                        .background(Capsule().fill(Color.red.opacity(0.9)))

                        Button("I'm still here") {
                            hasExtended = true
                            showing = false
                            countdown?.cancel()
                            restart()
                        }
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(height: 42)
                        .background(Capsule().fill(Theme.accent))
                    }
                }
                .padding(20)
                .background {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(.white.opacity(0.15), lineWidth: 1)
                        }
                }
                .environment(\.colorScheme, .dark)
                .padding(.horizontal, 28)
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .onChange(of: isSolo, initial: true) { _, solo in
            guard isHost else { return }
            if solo {
                restart()
            } else {
                // Somebody arrived. The clock is about being alone, not about
                // how long the class has run.
                stop()
                hasExtended = false
            }
        }
        .onDisappear { stop() }
    }

    private func restart() {
        timer?.cancel()
        let delay = hasExtended ? Self.extendedTimeout : Self.initialTimeout
        timer = Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                remaining = Self.warningWindow
                withAnimation { showing = true }
                Theme.hapticNotification(.warning)
                startCountdown()
            }
        }
    }

    private func startCountdown() {
        countdown?.cancel()
        countdown = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    remaining -= 1
                    if remaining <= 0 {
                        stop()
                        onEnd()
                    }
                }
            }
        }
    }

    private func stop() {
        timer?.cancel()
        countdown?.cancel()
        showing = false
    }
}
