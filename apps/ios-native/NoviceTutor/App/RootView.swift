import SwiftUI

/// Decides what the app is showing at all: a launch state, a sign-in screen,
/// or the tabs. Nothing below this needs to handle "signed out" as a case.
struct RootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        switch session.phase {
        case .restoring:
            LaunchView()
        case .signedOut:
            SignInView()
        case .signedIn(let user):
            HomeView(user: user)
        }
    }
}

/// Held while the stored cookie is checked. Matches the launch screen so the
/// transition out of it is not a flash of a different colour.
private struct LaunchView: View {
    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()
            ProgressView()
                .controlSize(.large)
                .tint(.white)
        }
    }
}

/// The signed-in app. A family sees their classes; staff see the ones they
/// teach — the same screen, a different list behind it.
struct HomeView: View {
    let user: CurrentUser

    var body: some View {
        // `.tabItem` rather than iOS 18's `Tab`: the deployment target is 17,
        // which is what keeps the app installable on the older phones a lot of
        // these families are using.
        TabView {
            ScheduleView(user: user)
                .tabItem { Label("Classes", systemImage: "calendar") }

            AccountView(user: user)
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(Theme.accent)
    }
}
