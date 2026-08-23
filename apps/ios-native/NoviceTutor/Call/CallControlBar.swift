import SwiftUI

/// The floating bar: the four things people reach for mid-lesson, and the way
/// out.
///
/// Designed in the modern Apple iOS FaceTime floating glass language: frosted
/// ultra-thin material, subtle specular rim lighting, and fluid tactile response.
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
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 1.0, green: 0.27, blue: 0.23),
                                    Color(red: 0.84, green: 0.08, blue: 0.08)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .overlay {
                            Capsule()
                                .stroke(Color.white.opacity(0.24), lineWidth: 1)
                        }
                        .shadow(color: Color.red.opacity(0.45), radius: 10, y: 4)
                }
            }
            .accessibilityLabel(isHost ? "End class for everyone" : "Leave class")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay {
                    Capsule()
                        .stroke(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(0.28),
                                    Color.white.opacity(0.08)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 1
                        )
                }
                .shadow(color: Color.black.opacity(0.40), radius: 24, y: 10)
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
                        .fill(
                            on
                                ? Color.white.opacity(0.18)
                                : Color(red: 0.88, green: 0.22, blue: 0.20).opacity(0.92)
                        )
                        .overlay {
                            Circle()
                                .stroke(
                                    LinearGradient(
                                        colors: [
                                            Color.white.opacity(on ? 0.22 : 0.35),
                                            Color.white.opacity(0.06)
                                        ],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    ),
                                    lineWidth: 1
                                )
                        }
                }
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(Theme.accent)
                            .frame(width: 12, height: 12)
                            .overlay { Circle().stroke(Color.black.opacity(0.4), lineWidth: 1.5) }
                            .offset(x: 1, y: -1)
                    }
                }
        }
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
        .accessibilityLabel(label)
    }
}

