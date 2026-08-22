import AVFoundation
import LiveKit
import SwiftUI

/// What the device check decided. Carried into the room so someone who joined
/// with their camera off is not published the moment they connect.
struct PreJoinChoices: Equatable {
    let micOn: Bool
    let cameraOn: Bool
}

/// The device check, between "the server said yes" and being in the room.
///
/// The app used to go from a spinner straight into the class: the first time
/// anyone saw themselves was in front of their teacher, with no chance to
/// notice the camera was pointing at the ceiling or that they were about to
/// join from a room they would rather not show. The web app has had this step
/// for months; this is the same screen, laid out the same way — preview first,
/// every control sitting on the picture, one green tile to go in.
///
/// The preview runs on its own `LocalVideoTrack`, not the room's: there is no
/// room yet. It is stopped before the room connects, so the camera is never
/// held open twice.
struct PreJoinView: View {
    let userName: String
    let teacherName: String?
    let grants: MediaPermissions.Grants
    /// Handed the choices made here. The camera is already stopped by then.
    let onJoin: (_ micOn: Bool, _ cameraOn: Bool) -> Void
    let onCancel: () -> Void

    @State private var micOn: Bool
    @State private var cameraOn: Bool
    @State private var previewTrack: LocalVideoTrack?
    @State private var joining = false

    init(
        userName: String,
        teacherName: String?,
        grants: MediaPermissions.Grants,
        onJoin: @escaping (_ micOn: Bool, _ cameraOn: Bool) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.userName = userName
        self.teacherName = teacherName
        self.grants = grants
        self.onJoin = onJoin
        self.onCancel = onCancel
        // A refusal is not a toggle. Someone who declined the camera starts
        // with it off and the control disabled, rather than being offered a
        // switch that cannot do anything.
        _micOn = State(initialValue: grants.microphone)
        _cameraOn = State(initialValue: grants.camera)
    }

    var body: some View {
        VStack(spacing: 16) {
            header

            stage
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.55), radius: 24, y: 12)

            joinButton

            Button("Not now", action: onCancel)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.white.opacity(0.45))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ink.ignoresSafeArea())
        .task { await startPreview() }
        .onDisappear { stopPreview() }
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(spacing: 4) {
            Text("Ready to join?")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
            Text(teacherName.map { "\($0) is expecting you." } ?? "Check your camera and microphone.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.5))
        }
    }

    private var stage: some View {
        ZStack {
            Color.black

            if cameraOn, let previewTrack {
                SwiftUIVideoView(previewTrack, layoutMode: .fill, mirrorMode: .mirror)
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "video.slash.fill")
                        .font(.system(size: 30, weight: .medium))
                    Text(grants.camera ? "CAMERA IS OFF" : "CAMERA NOT ALLOWED")
                        .font(.caption2.weight(.bold))
                        .kerning(1.2)
                }
                .foregroundStyle(.white.opacity(0.35))
            }

            VStack {
                HStack {
                    Text(userName)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Spacer()
                }
                Spacer()
                controlTiles
            }
            .padding(14)
        }
    }

    private var controlTiles: some View {
        HStack(spacing: 14) {
            tile(
                systemName: micOn ? "mic.fill" : "mic.slash.fill",
                on: micOn,
                disabled: !grants.microphone,
                label: micOn ? "Turn off microphone" : "Turn on microphone"
            ) {
                micOn.toggle()
            }

            tile(
                systemName: cameraOn ? "video.fill" : "video.slash.fill",
                on: cameraOn,
                disabled: !grants.camera,
                label: cameraOn ? "Turn off camera" : "Turn on camera"
            ) {
                cameraOn.toggle()
                Task { await syncPreview() }
            }
        }
    }

    /// Translucent, lit along the top edge, casting a shadow onto the picture
    /// behind it — the same recipe as the in-call control bar, so the two
    /// screens read as one app.
    private func tile(
        systemName: String,
        on: Bool,
        disabled: Bool,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Theme.haptic(.light)
            action()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .overlay {
                            Circle().fill(
                                on
                                    ? AnyShapeStyle(Color.white.opacity(0.16))
                                    : AnyShapeStyle(
                                        LinearGradient(
                                            colors: [Color(red: 0.95, green: 0.34, blue: 0.29), Color(red: 0.77, green: 0.20, blue: 0.16)],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )
                            )
                        }
                        .overlay {
                            Circle().stroke(Color.white.opacity(0.28), lineWidth: 1)
                        }
                        .shadow(color: .black.opacity(0.45), radius: 10, y: 5)
                }
        }
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
        .environment(\.colorScheme, .dark)
    }

    private var joinButton: some View {
        Button {
            guard !joining else { return }
            joining = true
            Theme.haptic(.medium)
            Task {
                // The room opens its own camera; leaving this one running
                // would be two capture sessions on the same device.
                stopPreview()
                onJoin(micOn, cameraOn)
            }
        } label: {
            Text(joining ? "Joining…" : "Join Class")
                .font(.headline.weight(.bold))
                .foregroundStyle(Color(red: 0.03, green: 0.20, blue: 0.12))
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Theme.liveGradient)
                        .overlay {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(Color.white.opacity(0.34), lineWidth: 1)
                        }
                        .shadow(color: Theme.live.opacity(0.42), radius: 14, y: 6)
                }
        }
        .buttonStyle(.plain)
        .disabled(joining)
    }

    // MARK: - Preview camera

    private func startPreview() async {
        guard grants.camera, previewTrack == nil else { return }
        let track = LocalVideoTrack.createCameraTrack(
            options: CameraCaptureOptions(position: .front, dimensions: .h720_169, fps: 24)
        )
        do {
            try await track.start()
            previewTrack = track
        } catch {
            // No preview is survivable; the class is not blocked on it.
            cameraOn = false
        }
    }

    private func syncPreview() async {
        if cameraOn {
            await startPreview()
        } else {
            stopPreview()
        }
    }

    private func stopPreview() {
        guard let track = previewTrack else { return }
        previewTrack = nil
        Task { try? await track.stop() }
    }
}
