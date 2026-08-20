import SwiftUI

@main
struct NoviceTutorApp: App {
    @State private var session = AppSession()

    init() {
        #if DEBUG
        // A UI test has to begin signed out, and the session cookie outlives
        // an app relaunch by design. Without this the second test in a run
        // would open straight into somebody's schedule and never see the
        // screen it is there to check.
        if UserDefaults.standard.bool(forKey: "uitest-fresh") {
            HTTPCookieStorage.shared.cookies?.forEach(HTTPCookieStorage.shared.deleteCookie)
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.restore() }
        }
    }
}
