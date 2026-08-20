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

    var user: CurrentUser? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    func restore() async {
        do {
            phase = .signedIn(try await APIClient.shared.me())
        } catch APIError.unauthorized {
            phase = .signedOut
        } catch {
            // A network failure at launch is not a signed-out state, but the
            // app cannot show a schedule it could not load either. Signed out
            // is the honest place to land: the sign-in screen reports the
            // real error when the person tries.
            phase = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        try await APIClient.shared.signIn(email: email, password: password)
        phase = .signedIn(try await APIClient.shared.me())
    }

    func signUp(name: String, email: String, password: String) async throws {
        try await APIClient.shared.signUp(name: name, email: email, password: password)
        phase = .signedIn(try await APIClient.shared.me())
    }

    func signOut() async {
        try? await APIClient.shared.signOut()
        phase = .signedOut
    }

    /// Called when any screen sees a 401: the session ended underneath it.
    func sessionExpired() {
        phase = .signedOut
    }
}
