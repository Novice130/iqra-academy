import LiveKit
import SwiftUI

/// The class, once the server has said yes.
///
/// The chrome — the bar, the top row — hides itself after a few seconds and
/// comes back on a tap, the way the iOS in-call screen does. That is not
/// decoration: the thing people are looking at during a Quran lesson is a face
/// and a page, and a permanent bar sits on top of exactly the bottom third
/// where a teacher holds the book up.
///
/// Anything the person must answer — the host asking for a microphone, a guest
/// knocking, the solo prompt — ignores the auto-hide and stays put.
struct RoomView: View {
    let grant: JoinGrant
    let sessionId: String
    let grants: MediaPermissions.Grants
    let choices: PreJoinChoices
    let onExit: (CallController.Ended) -> Void

    @State private var controller: CallController
    /// A dismissal that came from us, so `onDisappear` does not also try.
    @State private var handledExit = false
    @State private var chromeVisible = true
    @State private var hideTask: Task<Void, Never>?
    @State private var sheet: CallMoreSheet.Tab?

    init(
        grant: JoinGrant,
        sessionId: String,
        grants: MediaPermissions.Grants,
        choices: PreJoinChoices,
        onExit: @escaping (CallController.Ended) -> Void
    ) {
        self.grant = grant
        self.sessionId = sessionId
        self.grants = grants
        self.choices = choices
        self.onExit = onExit
        _controller = State(
            initialValue: CallController(
                grant: grant,
                sessionId: sessionId,
                grants: grants,
                choices: choices
            )
        )
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                CallStageView(
                    stage: controller.stage,
                    people: controller.people,
                    selfTrack: controller.selfTrack,
                    selfPerson: controller.people.first { $0.isLocal },
                    layout: controller.layout,
                    waitingFor: grant.teacherName ?? "your teacher",
                    isReconnecting: controller.status == .reconnecting,
                    bottomInset: chromeVisible ? 96 + proxy.safeAreaInsets.bottom : proxy.safeAreaInsets.bottom,
                    trackFor: { controller.videoTrack(for: $0) }
                )
                // A tap anywhere brings the chrome back; a tap while it is up
                // puts it away. `contentShape` because most of this view is
                // video with nothing hit-testable in it.
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeOut(duration: 0.2)) { chromeVisible.toggle() }
                    if chromeVisible { scheduleHide() }
                }

                topOverlay
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                bottomOverlay
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)

                SoloInactivityPrompt(
                    isHost: grant.isHost,
                    isSolo: controller.people.count <= 1,
                    onEnd: {
                        handledExit = true
                        Task { await controller.leave(endClass: true) }
                    }
                )
            }
        }
        .background(Theme.ink)
        .statusBarHidden(!chromeVisible)
        .task {
            // A lesson is one of the few things people hold a phone sideways
            // for: a teacher on a stand, a student holding a page up.
            OrientationGate.set(true)
            await controller.connect()
            scheduleHide()
        }
        .sheet(item: $sheet) { tab in
            CallMoreSheet(controller: controller, tab: tab)
        }
        .onChange(of: controller.status) { _, status in
            if case .ended(let reason) = status {
                handledExit = true
                onExit(reason)
            }
        }
        .onChange(of: controller.hostRequest) { _, request in
            // Being asked for a microphone with the bar hidden is being asked
            // for nothing: the buttons that answer it are the hidden ones.
            if request != nil { reveal() }
        }
        .onDisappear {
            OrientationGate.set(false)
            hideTask?.cancel()
            // A swipe, a background kill, a push elsewhere. Leaves the class
            // running for everybody else — always.
            if !handledExit { controller.tearDown() }
        }
    }

    // MARK: - Overlays

    @ViewBuilder
    private var topOverlay: some View {
        VStack(spacing: 8) {
            if let request = controller.hostRequest {
                HostRequestPrompt(
                    request: request,
                    teacherName: grant.teacherName ?? "Your teacher",
                    onAccept: { Task { await controller.acceptHostRequest() } },
                    onDismiss: { controller.dismissHostRequest() }
                )
            }

            if controller.canModerate, let guest = controller.guests.first {
                GuestKnockBanner(
                    guest: guest,
                    waiting: controller.guests.count,
                    onAdmit: { Task { await controller.answerGuest(guest, admit: true) } },
                    onDeny: { Task { await controller.answerGuest(guest, admit: false) } }
                )
            }

            if chromeVisible, controller.micDenied || controller.cameraDenied {
                permissionBanner
            }
        }
        .padding(.top, 8)
        .animation(.easeOut(duration: 0.22), value: controller.hostRequest)
        .animation(.easeOut(duration: 0.22), value: controller.guests)
    }

    @ViewBuilder
    private var bottomOverlay: some View {
        if chromeVisible {
            CallControlBar(
                micOn: controller.micOn,
                cameraOn: controller.cameraOn,
                canFlipCamera: controller.canFlipCamera,
                micDenied: controller.micDenied,
                cameraDenied: controller.cameraDenied,
                isHost: grant.isHost,
                unread: controller.chat.unread,
                onToggleMic: {
                    scheduleHide()
                    Task { await controller.toggleMicrophone() }
                },
                onToggleCamera: {
                    scheduleHide()
                    Task { await controller.toggleCamera() }
                },
                onFlipCamera: {
                    scheduleHide()
                    Task { await controller.flipCamera() }
                },
                onMore: {
                    hideTask?.cancel()
                    sheet = controller.chat.unread > 0 ? .chat : .people
                },
                onExit: {
                    handledExit = true
                    Task { await controller.leave(endClass: grant.isHost) }
                }
            )
            .padding(.bottom, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
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

    // MARK: - Auto-hide

    private func reveal() {
        withAnimation(.easeOut(duration: 0.2)) { chromeVisible = true }
        scheduleHide()
    }

    /// Four seconds, restarted by every tap on a control. Long enough to hit a
    /// second button, short enough that the bar is gone by the time anybody
    /// settles into watching.
    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.25)) { chromeVisible = false }
            }
        }
    }
}
