import SwiftUI

/// Decides what the app is showing at all: a launch state, a sign-in screen,
/// or the main tabs.
struct RootView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var callManager = IncomingCallManager.shared
    @State private var liveMonitor = LiveClassMonitor.shared

    var body: some View {
        #if DEBUG
        // A debug-only way to look at the call screen without a live class.
        // See ``CallScreenGallery``.
        if UserDefaults.standard.bool(forKey: "dev.callGallery") {
            return AnyView(CallScreenGallery())
        }
        return AnyView(main)
        #else
        return main
        #endif
    }

    private var main: some View {
        ZStack {
            switch session.phase {
            case .restoring:
                LaunchView()
            case .signedOut:
                PublicHomeScreenView()
            case .signedIn(let user):
                HomeTabView(user: user)
            }

            // Incoming Call Fullscreen Overlay
            if let activeCall = callManager.activeCall {
                IncomingCallOverlayView(
                    call: activeCall,
                    onAccept: {
                        Task { await callManager.accept() }
                    },
                    onDecline: {
                        Task { await callManager.decline() }
                    }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                .zIndex(999)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: callManager.activeCall != nil)
        .fullScreenCover(item: Binding(
            get: { callManager.activeCallSession },
            set: { _ in callManager.dismissActiveCallSession() }
        )) { session in
            CallScreen(classSession: session)
        }
        .onChange(of: session.user != nil) { _, isSignedIn in
            if isSignedIn {
                callManager.startPolling()
                liveMonitor.start()
            } else {
                callManager.stopPolling()
                liveMonitor.reset()
            }
        }
        .onAppear {
            if session.user != nil {
                callManager.startPolling()
                liveMonitor.start()
            }
        }
        // Nothing polls while the app is in the background, so the first thing
        // it knows on the way back is out of date — and a class that ended in
        // the meantime would be advertised on the first frame.
        //
        // Both pollers stop. The call poll used to be left running here, and
        // because this app declares the `audio` background mode it is not
        // promptly suspended — so a phone in a pocket kept asking "is anyone
        // calling me?" every 2.5 seconds with the screen off. `.inactive` is
        // deliberately not treated as backgrounding: that is a Control Centre
        // swipe or an incoming banner, and the app is about to be on screen
        // again.
        .onChange(of: scenePhase) { _, phase in
            guard session.user != nil else { return }
            switch phase {
            case .active:
                liveMonitor.start()
                callManager.startPolling()
                liveMonitor.wake(force: true)
            case .background:
                liveMonitor.stop()
                callManager.suspendPolling()
            default:
                break
            }
        }
    }
}

/// Held while the stored cookie is checked.
private struct LaunchView: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            
            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(Theme.accentGradient)
                        .frame(width: 72, height: 72)
                        .shadow(color: Theme.accent.opacity(0.35), radius: 16, y: 6)

                    Image(systemName: "book.pages.fill")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(.white)
                }

                ProgressView()
                    .controlSize(.regular)
                    .tint(Theme.accent)
            }
        }
    }
}

/// The signed-in app tab view with dedicated Home Screen, Schedule, and Account.
struct HomeTabView: View {
    let user: CurrentUser
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeScreenView(user: user, onNavigateToSchedule: {
                selectedTab = 1
            })
            .tabItem {
                Label("Home", systemImage: "house.fill")
            }
            .tag(0)

            ScheduleView(user: user)
                .tabItem {
                    Label("Classes", systemImage: "calendar.badge.clock")
                }
                .tag(1)

            AccountView(user: user)
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle.fill")
                }
                .tag(2)
        }
        .tint(Theme.accent)
    }
}
