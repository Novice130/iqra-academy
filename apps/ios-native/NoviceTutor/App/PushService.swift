import FirebaseCore
import FirebaseMessaging
import Foundation
import Observation
import UIKit
import UserNotifications

/// Notifications, and what tapping one opens.
///
/// ── Why Firebase and not APNs directly ──────────────────────────────────────
/// The server already sends through FCM (`lib/fcm.ts`) and branches on
/// `device_tokens.platform`, giving iOS a loud `time-sensitive` alert and
/// Android a data-only wake-up. Registering a raw APNs token instead would
/// mean a second sending path on the server, and the credential for it would
/// have to live in a Worker secret. The SDK's only job here is turning an APNs
/// token into an FCM one.
///
/// ── Degrades rather than crashes ────────────────────────────────────────────
/// `FirebaseApp.configure()` traps if `GoogleService-Info.plist` is missing,
/// and that file is gitignored — a fresh checkout has no push credentials. So
/// the plist's presence is checked first and the whole service quietly does
/// nothing without it. The app is entirely usable that way; it simply does not
/// ring.
///
/// ── This is a notification, not a ring ──────────────────────────────────────
/// A full-screen incoming call needs a PushKit VoIP push into CallKit, and FCM
/// cannot send those at all. What arrives is a notification that opens the
/// class when tapped. Changing that later is a change of transport, not of
/// this file's shape.
@Observable
@MainActor
final class PushService: NSObject {
    static let shared = PushService()

    /// The class a tapped notification asked for, read and cleared by the
    /// classes screen. Held rather than acted on: a tap can arrive before
    /// there is any UI to route it to, or before the person is signed in.
    private(set) var pendingSessionId: String?

    private var configured = false
    /// The most recent token the SDK has handed over, whether or not anybody
    /// is signed in yet. The delegate fires on its own schedule — often before
    /// sign-in — and the token is useless to the server until there is a
    /// session to attach it to, so it is kept and sent when there is one.
    private var latestToken: String?
    private var registeredToken: String?
    private var wantsRegistration = false

    private override init() { super.init() }

    /// True when the app was built with Firebase credentials.
    static var isAvailable: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    /// Called once at launch, before anyone signs in. Does not ask for
    /// permission — that waits until there is a reason.
    func configureIfPossible() {
        guard !configured, Self.isAvailable else { return }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        configured = true
    }

    /// Asked for after a successful sign-in, never at launch: on the sign-in
    /// screen there is nothing to notify anybody about yet, and a permission
    /// alert over a blank app is the one people decline.
    func requestAuthorizationAndRegister() async {
        guard configured else { return }

        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return }

        wantsRegistration = true
        UIApplication.shared.registerForRemoteNotifications()

        // A token from a previous launch is already in hand and the delegate
        // will not fire again for it.
        if let token = latestToken {
            await register(token: token)
        }
    }

    /// Called on sign-out so a shared phone does not keep ringing for somebody
    /// who has left. The server scopes the delete to the caller.
    func unregister() async {
        wantsRegistration = false
        guard let token = registeredToken else { return }
        try? await APIClient.shared.unregisterDevice(token: token)
        registeredToken = nil
    }

    /// True once this handset has a token the server can actually reach it on.
    ///
    /// Read by the pollers: when push works, the fast poll is a safety net
    /// rather than the mechanism, and it is allowed to run far slower. Not the
    /// same as `isAvailable` — that only says the app was built with Firebase
    /// credentials, not that anybody granted permission or that the token ever
    /// reached the server.
    var canReceivePush: Bool { registeredToken != nil }

    func takePendingSessionId() -> String? {
        defer { pendingSessionId = nil }
        return pendingSessionId
    }

    fileprivate func tokenArrived(_ token: String) async {
        latestToken = token
        guard wantsRegistration else { return }
        await register(token: token)
    }

    private func register(token: String) async {
        guard token != registeredToken else { return }
        do {
            try await APIClient.shared.registerDevice(token: token)
            registeredToken = token
        } catch {
            // Not worth surfacing: the person did not ask for this, and the
            // next launch tries again.
        }
    }

    /// The server puts the class in `sessionId`, and a path as a fallback for
    /// clients that only know how to open a URL.
    fileprivate nonisolated static func sessionId(in userInfo: [AnyHashable: Any]) -> String? {
        if let sessionId = userInfo["sessionId"] as? String, !sessionId.isEmpty {
            return sessionId
        }
        guard let path = userInfo["path"] as? String,
              let range = path.range(of: "/dashboard/session/") else { return nil }
        let rest = path[range.upperBound...]
        let id = rest.prefix { $0 != "/" && $0 != "?" }
        return id.isEmpty ? nil : String(id)
    }
}

extension PushService: MessagingDelegate {
    nonisolated func messaging(_: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor in await tokenArrived(fcmToken) }
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    /// A class starting while the app is open still deserves to be seen.
    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Read on this side of the hop: `[AnyHashable: Any]` is not Sendable,
        // and a String is.
        let tapped = Self.sessionId(in: response.notification.request.content.userInfo)
        await MainActor.run {
            pendingSessionId = tapped
        }
    }
}
