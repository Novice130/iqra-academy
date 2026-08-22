import SwiftUI

/// Mic, camera, flip, and the way out.
struct CallControlBar: View {
    let micOn: Bool
    let cameraOn: Bool
    let canFlipCamera: Bool
    let micDenied: Bool
    let cameraDenied: Bool
    let isHost: Bool

    let onToggleMic: () -> Void
    let onToggleCamera: () -> Void
    let onFlipCamera: () -> Void
    let onExit: () -> Void

    var body: some View {
        HStack(spacing: 14) {
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
                .padding(.horizontal, 20)
                .frame(height: 56)
                .background {
                    Capsule()
                        .fill(LinearGradient(colors: [Color.red, Color(red: 0.8, green: 0.1, blue: 0.1)], startPoint: .top, endPoint: .bottom))
                        .shadow(color: Color.red.opacity(0.4), radius: 8, y: 3)
                }
            }
            .accessibilityLabel(isHost ? "End class for everyone" : "Leave class")
        }
        .padding(.horizontal, 16)
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
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background {
                    Circle()
                        .fill(on ? Color.white.opacity(0.18) : Color.red.opacity(0.85))
                        .overlay {
                            Circle()
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        }
                }
        }
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}
