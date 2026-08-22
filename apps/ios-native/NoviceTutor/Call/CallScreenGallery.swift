#if DEBUG
import SwiftUI

/// A call screen with nobody in it, for looking at.
///
/// The call UI is the one screen that cannot be checked by building: it needs
/// a live class, a second participant and a teacher on the other side, and by
/// the time all three exist a layout bug has already been shipped. This draws
/// the same views the real screen draws — the stage, the floating tile, the
/// bar, the prompts — from made-up people, so a phone-width regression shows
/// up in a screenshot instead of in a lesson.
///
/// Debug builds only, and reachable only on purpose:
///
/// ```
/// xcrun simctl launch booted com.novicetutor.app -dev.callGallery 1
/// ```
///
/// It never connects to LiveKit and never calls the API. Every tile is
/// camera-off, because a made-up person has no video track — which also makes
/// it the honest test of the initials fallback.
struct CallScreenGallery: View {
    /// `-dev.callGalleryLayout grid` to open on the grid instead. The More
    /// button toggles it too, for anyone driving this by hand.
    @State private var layout: CallController.Layout =
        UserDefaults.standard.string(forKey: "dev.callGalleryLayout") == "grid" ? .grid : .speaker
    @State private var showRequest = true
    @State private var showKnock = true
    @State private var chromeVisible = true


    private static func person(
        _ name: String,
        host: Bool = false,
        local: Bool = false,
        speaking: Bool = false,
        micOn: Bool = true,
        volume: Double = 1
    ) -> CallController.Person {
        CallController.Person(
            id: "\(name.lowercased())@test.com#abc",
            base: "\(name.lowercased())@test.com",
            name: name,
            isLocal: local,
            isHost: host,
            isSpeaking: speaking,
            micOn: micOn,
            cameraOn: false,
            isSharingScreen: false,
            volume: volume,
            micTrackSid: "TR_fake"
        )
    }

    private var people: [CallController.Person] {
        [
            Self.person("Ustadh Bilal", host: true, speaking: true),
            Self.person("You", local: true),
            Self.person("Aisha", micOn: false),
            Self.person("Yusuf", volume: 0.4),
        ]
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                CallStageView(
                    stage: .waitingForOthers,
                    people: people,
                    selfTrack: nil,
                    selfPerson: people.first { $0.isLocal },
                    layout: layout,
                    waitingFor: "Ustadh Bilal",
                    isReconnecting: false,
                    bottomInset: 96 + proxy.safeAreaInsets.bottom,
                    trackFor: { _ in nil }
                )

                VStack(spacing: 8) {
                    if showRequest {
                        HostRequestPrompt(
                            request: .microphone,
                            teacherName: "Ustadh Bilal",
                            onAccept: { showRequest = false },
                            onDismiss: { showRequest = false }
                        )
                    }
                    if showKnock {
                        GuestKnockBanner(
                            guest: GuestKnock(id: "1", name: "Fatima's mother", askedAt: .now),
                            waiting: 2,
                            onAdmit: { showKnock = false },
                            onDeny: { showKnock = false }
                        )
                    }
                }
                .padding(.top, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                // What the gallery is actually being laid out in, so a
                // screenshot says whether the app rotated or only the device
                // did.
                // The size it was actually laid out in. A landscape
                // screenshot of a simulator draws the app rotated whether or
                // not it rotated, so the number is what settles it.
                Text("\(Int(proxy.size.width))×\(Int(proxy.size.height))")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.yellow)
                    .padding(6)
                    .background(.black.opacity(0.6), in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.leading, 8)

                CallControlBar(
                    micOn: true,
                    cameraOn: false,
                    canFlipCamera: true,
                    micDenied: false,
                    cameraDenied: false,
                    isHost: false,
                    unread: 3,
                    onToggleMic: {},
                    onToggleCamera: {},
                    onFlipCamera: {},
                    onMore: { layout = layout == .speaker ? .grid : .speaker },
                    onExit: { layout = .speaker }
                )
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            }
        }
        .background(Theme.ink)
        .ignoresSafeArea(.container, edges: .bottom)
        // The real call screen opens this gate; the gallery has to as well, or
        // it can only ever be photographed upright.
        .onAppear { OrientationGate.set(true) }
        .onDisappear { OrientationGate.set(false) }
    }
}
#endif
