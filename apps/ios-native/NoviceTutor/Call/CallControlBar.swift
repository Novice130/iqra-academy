import SwiftUI

/// Mic, camera, flip, and the way out.
///
/// The red button is the only difference between a teacher and everyone else:
/// the owning teacher ends the class for the room, anybody else — including an
/// admin observing — only leaves. One tap, no confirmation sheet; the web
/// client removed its own sheet because a teacher trying to end a class at the
/// end of a lesson does not want to be asked twice.
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
                action: onToggleMic
            )
            circle(
                systemName: cameraOn ? "video.fill" : "video.slash.fill",
                on: cameraOn,
                disabled: cameraDenied,
                label: cameraOn ? "Turn camera off" : "Turn camera on",
                action: onToggleCamera
            )
            if canFlipCamera {
                circle(
                    systemName: "arrow.triangle.2.circlepath.camera",
                    on: true,
                    disabled: !cameraOn,
                    label: "Switch camera",
                    action: onFlipCamera
                )
            }

            Button(action: onExit) {
                Label(isHost ? "End class" : "Leave", systemImage: "phone.down.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 56)
                    .background(Color.red, in: Capsule())
            }
            .accessibilityLabel(isHost ? "End class for everyone" : "Leave class")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
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
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.white)
                // 56pt: the web control bar's own floor, and comfortably past
                // Apple's 44pt minimum with a glove or a child's hand.
                .frame(width: 56, height: 56)
                .background(on ? Color.white.opacity(0.16) : Color.red.opacity(0.85), in: Circle())
        }
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}
