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

    @AppStorage("app_appearance") private var appearance: String = AppAppearance.system.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(AppAppearance(rawValue: appearance)?.colorScheme)
                .task {
                    await session.restore()
                }
        }
    }
}

/// The APNs token, and the silent pushes that arrive on it.
///
/// SwiftUI has no hook for `didRegisterForRemoteNotificationsWithDeviceToken`,
/// and Firebase needs that token handed to it to exchange for an FCM one.
/// Method swizzling would do it, but an explicit delegate is one less thing
/// that silently stops working after an SDK update.
///
/// The silent-push handler below is the other half. A visible notification
/// arrives through `UNUserNotificationCenterDelegate` in `PushService`; a
/// data-only one — "the class you are being offered has ended" — has no UI and
/// lands here instead. It needs `remote-notification` in `UIBackgroundModes`
/// to be delivered at all; see `Config/Info.plist`.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _: UIApplication,
        didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        MainActor.assumeIsolated { PushService.shared.configureIfPossible() }
        return true
    }

    /// Portrait everywhere but the call screen. See ``OrientationGate``.
    ///
    /// `Info.plist` lists the landscape orientations because without them iOS
    /// will not offer rotation at all; this is what keeps the rest of the app
    /// upright anyway. Called on the main thread by UIKit, which is what makes
    /// the isolation assumption safe.
    func application(
        _: UIApplication,
        supportedInterfaceOrientationsFor _: UIWindow?
    ) -> UIInterfaceOrientationMask {
        MainActor.assumeIsolated { OrientationGate.mask }
    }

    func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        guard PushService.isAvailable else { return }
        Messaging.messaging().apnsToken = deviceToken
    }

    /// A push with no alert in it. The payload's `type` says what changed.
    ///
    /// Best-effort by nature: iOS throttles background pushes and drops them
    /// entirely for an app the person force-quit. Everything here is also
    /// discovered by the pollers eventually — this is what makes it feel
    /// immediate when it works, not what makes it correct.
    func application(
        _: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        let type = userInfo["type"] as? String

        MainActor.assumeIsolated {
            switch type {
            case "CLASS_ENDED":
                LiveClassMonitor.shared.classEnded()
            case "CALL_ENDED":
                IncomingCallManager.shared.callEnded()
            default:
                // Something happened and we were not told what. Ask, rather
                // than guess — and force it past the coalescing window, since
                // a push is exactly the evidence that the held answer is old.
                LiveClassMonitor.shared.wake(force: true)
            }
        }

        completionHandler(.newData)
    }

    func application(
        _: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError _: Error
    ) {
        // Nothing to do and nothing to say: the app works without push, and a
        // simulator fails this every single launch.
    }
}
