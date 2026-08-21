import FirebaseMessaging
import SwiftUI
import UIKit

@main
struct NoviceTutorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
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
                .task {
                    await session.restore()
                }
        }
    }
}

/// Only here for the APNs token.
///
/// SwiftUI has no hook for `didRegisterForRemoteNotificationsWithDeviceToken`,
/// and Firebase needs that token handed to it to exchange for an FCM one.
/// Method swizzling would do it, but an explicit delegate is one less thing
/// that silently stops working after an SDK update.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _: UIApplication,
        didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        MainActor.assumeIsolated { PushService.shared.configureIfPossible() }
        return true
    }

    func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        guard PushService.isAvailable else { return }
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(
        _: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError _: Error
    ) {
        // Nothing to do and nothing to say: the app works without push, and a
        // simulator fails this every single launch.
    }
}
