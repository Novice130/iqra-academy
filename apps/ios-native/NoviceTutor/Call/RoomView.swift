import LiveKit
import SwiftUI

/// The class, once the server has said yes.
struct RoomView: View {
    let grant: JoinGrant
    let sessionId: String
    let grants: MediaPermissions.Grants
    let onExit: (CallController.Ended) -> Void

    @State private var controller: CallController
    /// A dismissal that came from us, so `onDisappear` does not also try.
    @State private var handledExit = false

    init(
        grant: JoinGrant,
        sessionId: String,
        grants: MediaPermissions.Grants,
        onExit: @escaping (CallController.Ended) -> Void
    ) {
        self.grant = grant
        self.sessionId = sessionId
        self.grants = grants
        self.onExit = onExit
        _controller = State(
            initialValue: CallController(grant: grant, sessionId: sessionId, grants: grants)
        )
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            CallStageView(
                stage: controller.stage,
                selfTrack: controller.selfTrack,
                selfName: grant.userName,
                waitingFor: grant.teacherName ?? "your teacher",
                isReconnecting: controller.status == .reconnecting
            )

            VStack(spacing: 12) {
                if controller.micDenied || controller.cameraDenied {
                    permissionBanner
                }
                CallControlBar(
                    micOn: controller.micOn,
                    cameraOn: controller.cameraOn,
                    canFlipCamera: controller.canFlipCamera,
                    micDenied: controller.micDenied,
                    cameraDenied: controller.cameraDenied,
                    isHost: grant.isHost,
                    onToggleMic: { Task { await controller.toggleMicrophone() } },
                    onToggleCamera: { Task { await controller.toggleCamera() } },
                    onFlipCamera: { Task { await controller.flipCamera() } },
                    onExit: {
                        handledExit = true
                        Task { await controller.leave(endClass: grant.isHost) }
                    }
                )
            }
            .padding(.bottom, 12)
        }
        .task { await controller.connect() }
        .onChange(of: controller.status) { _, status in
            if case .ended(let reason) = status {
                handledExit = true
                onExit(reason)
            }
        }
        .onDisappear {
            // A swipe, a background kill, a push elsewhere. Leaves the class
            // running for everybody else — always.
            if !handledExit { controller.tearDown() }
        }
    }

    private var permissionBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.orange)
            Text(bannerText)
                .font(.footnote)
                .foregroundStyle(.white)
            Spacer(minLength: 8)
            Button("Settings") { MediaPermissions.openSettings() }
                .font(.footnote.weight(.semibold))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
    }

    private var bannerText: String {
        if controller.micDenied && controller.cameraDenied {
            return "Camera and microphone are off. Your class can't see or hear you."
        }
        if controller.micDenied {
            return "Your microphone is off, so your teacher can't hear you."
        }
        return "Your camera is off, so your class can't see you."
    }
}
