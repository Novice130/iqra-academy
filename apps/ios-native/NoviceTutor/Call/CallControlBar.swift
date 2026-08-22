import SwiftUI

/// The floating bar: the four things people reach for mid-lesson, and the way
/// out.
///
/// Everything else — people, chat, spotlight, volume, background blur, audio
/// output — is behind **More**, as a sheet. That is not tidiness: at 402pt a
/// row of circular buttons runs out of width at five, and a bar that scrolls
/// sideways during a class is a bar nobody can hit. The bar stays at five and
/// the sheet takes the rest.
///
/// Widths are deliberate: 52pt circles with 10pt gaps and a ~104pt end button
/// leave the whole bar inside 402pt with room either side.
struct CallControlBar: View {
    let micOn: Bool
    let cameraOn: Bool
    let canFlipCamera: Bool
    let micDenied: Bool
    let cameraDenied: Bool
    let isHost: Bool
    /// Drawn as a dot on More, which is where chat lives.
    let unread: Int

    let onToggleMic: () -> Void
    let onToggleCamera: () -> Void
    let onFlipCamera: () -> Void
    let onMore: () -> Void
    let onExit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            circle(
                systemName: micOn ? "mic.fill" : "mic.slash.fill",
                on: micOn,
                disabled: micDenied,
                label: micOn ? "Mute microphone" : "Unmute microphone",
                action: {
                    Theme.haptic(.light)
                    onToggleMic()
                }
            )

            circle(
                systemName: cameraOn ? "video.fill" : "video.slash.fill",
                on: cameraOn,
                disabled: cameraDenied,
                label: cameraOn ? "Turn camera off" : "Turn camera on",
                action: {
                    Theme.haptic(.light)
                    onToggleCamera()
                }
            )

            if canFlipCamera {
                circle(
                    systemName: "arrow.triangle.2.circlepath.camera",
                    on: true,
                    disabled: !cameraOn,
                    label: "Switch camera",
                    action: {
                        Theme.haptic(.light)
                        onFlipCamera()
                    }
                )
            }

            circle(
                systemName: "ellipsis",
                on: true,
                disabled: false,
                label: unread > 0 ? "More, \(unread) unread messages" : "More",
                badge: unread > 0,
                action: {
                    Theme.haptic(.light)
                    onMore()
                }
            )

            Button {
                Theme.haptic(.heavy)
                onExit()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "phone.down.fill")
                        .font(.system(size: 16, weight: .bold))
                    Text(isHost ? "End" : "Leave")
                        .font(.subheadline.weight(.bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 52)
                .background {
                    Capsule()
                        .fill(LinearGradient(colors: [Color.red, Color(red: 0.8, green: 0.1, blue: 0.1)], startPoint: .top, endPoint: .bottom))
                        .shadow(color: Color.red.opacity(0.4), radius: 8, y: 3)
                }
            }
            .accessibilityLabel(isHost ? "End class for everyone" : "Leave class")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay {
                    Capsule()
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                }
                .shadow(color: Color.black.opacity(0.35), radius: 16, y: 6)
        }
        .environment(\.colorScheme, .dark)
    }

    private func circle(
        systemName: String,
        on: Bool,
        disabled: Bool,
        label: String,
        badge: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background {
                    Circle()
                        .fill(on ? Color.white.opacity(0.18) : Color.red.opacity(0.85))
                        .overlay {
                            Circle()
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        }
                }
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(Theme.accent)
                            .frame(width: 12, height: 12)
                            .overlay { Circle().stroke(Color.black.opacity(0.35), lineWidth: 1) }
                            .offset(x: 2, y: -2)
                    }
                }
        }
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}
