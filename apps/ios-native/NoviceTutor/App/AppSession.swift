import Foundation
import Observation

/// Who is signed in, for the whole app.
///
/// Launch always begins by *asking* rather than assuming: the cookie survives
/// a relaunch, but a cookie is not a session — the row behind it can have
/// expired or been signed out on another device. So the app starts in
/// ``Phase/restoring`` and the first `/api/me` decides. Rendering the signed-in
/// UI first and falling back on the first 401 would flash a schedule at
/// somebody who is not signed in.
@Observable
@MainActor
final class AppSession {
    enum Phase {
        /// Checking a stored cookie. The launch screen stays up.
        case restoring
        case signedOut
        case signedIn(CurrentUser)
    }

    private(set) var phase: Phase = .restoring

    /// Set when the *last* restore failed on the network rather than on
    /// authorisation. The sign-in screen shows it, because "you are signed
    /// out" and "your phone has no signal" look identical otherwise and only
    /// one of them is worth typing a password over.
    private(set) var restoreError: String?

    var user: CurrentUser? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    func restore() async {
        do {
            restoreError = nil
            phase = .signedIn(try await APIClient.shared.me())
            await PushService.shared.requestAuthorizationAndRegister()
        } catch APIError.unauthorized {
            restoreError = nil
            phase = .signedOut
        } catch {
            // A network failure at launch is not a signed-out state, but the
            // app cannot show a schedule it could not load either. Signed out
            // is where it has to land — with the reason carried across, so the
            // screen can say "couldn't reach Novice Tutor" instead of silently
            // implying the session ended.
            restoreError = error.localizedDescription
            phase = .signedOut
        }
    }


    func signIn(email: String, password: String) async throws {
        restoreError = nil
        try await APIClient.shared.signIn(email: email, password: password)
        phase = .signedIn(try await APIClient.shared.me())
        // Asked for now rather than at launch: there is a schedule behind the
        // alert to explain what would be worth notifying about.
        await PushService.shared.requestAuthorizationAndRegister()
    }

    func signUp(name: String, email: String, password: String) async throws {
        restoreError = nil
        try await APIClient.shared.signUp(name: name, email: email, password: password)
        phase = .signedIn(try await APIClient.shared.me())
        await PushService.shared.requestAuthorizationAndRegister()
    }

    func signOut() async {
        // Before the session ends: the delete is authorised by the cookie, and
        // a phone left registered would keep ringing for somebody who signed
        // out of it.
        await PushService.shared.unregister()
        try? await APIClient.shared.signOut()
        restoreError = nil
        phase = .signedOut
    }

    /// Called when any screen sees a 401: the session ended underneath it.
    func sessionExpired() {
        phase = .signedOut
    }
}
