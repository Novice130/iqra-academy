import Foundation

/// Where the app talks to, and the one setting a developer changes.
///
/// The origin is not only the URL requests go to — Better Auth checks the
/// `Origin` header against its trusted list and answers `INVALID_ORIGIN` if it
/// disagrees, so the two must always be the same string. Keeping one source
/// for both is what stops a half-changed base URL from failing at sign-in
/// with an error that looks like a wrong password.
enum AppConfig {
    /// Production. Overridden in debug builds by ``devOriginOverride``.
    static let productionOrigin = URL(string: "https://novicetutor.com")!

    /// Set from the debug settings screen to point a simulator at a laptop.
    /// A device on the same network needs the Mac's LAN address, not
    /// `localhost` — `localhost` on an iPhone is the iPhone.
    private static let overrideKey = "dev.originOverride"

    static var devOriginOverride: URL? {
        get {
            guard let raw = UserDefaults.standard.string(forKey: overrideKey) else { return nil }
            return URL(string: raw)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: overrideKey)
        }
    }

    static var origin: URL {
        #if DEBUG
        return devOriginOverride ?? productionOrigin
        #else
        return productionOrigin
        #endif
    }

    #if DEBUG
    /// The standing test account's password, if this machine has been told it.
    ///
    /// Never a literal in the repository. It used to be one, in nine places
    /// across the sign-in screen, the public home screen and `AppSession` —
    /// which published a real account's credentials to anyone with a checkout,
    /// exactly what the comment at the top of `SignInFlowUITests` says was
    /// fixed there. `#if DEBUG` kept it out of shipped builds; it did not keep
    /// it out of git.
    ///
    /// Supply it either way:
    ///   - `NT_PASSWORD` in the environment (Xcode scheme, or
    ///     `XCUIApplication.launchEnvironment` from a UI test), or
    ///   - `xcrun simctl launch booted com.novicetutor.app -dev.testPassword <pw>`
    ///
    /// `nil` hides every quick sign-in shortcut rather than offering a button
    /// that silently fails.
    static var devTestPassword: String? {
        if let env = ProcessInfo.processInfo.environment["NT_PASSWORD"], !env.isEmpty {
            return env
        }
        guard let stored = UserDefaults.standard.string(forKey: "dev.testPassword"),
              !stored.isEmpty else { return nil }
        return stored
    }

    /// The accounts those shortcuts sign in as. Emails are not secrets.
    static let devStudentEmail = "teststudent1@test.com"
    static let devTeacherEmail = "testteacher@test.com"
    #endif

    /// `https://novicetutor.com/api/...`, optionally with a query string.
    static func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let originStr = origin.absoluteString.hasSuffix("/")
            ? String(origin.absoluteString.dropLast())
            : origin.absoluteString
        let fullUrlStr = "\(originStr)/\(trimmed)"
        guard var components = URLComponents(string: fullUrlStr) else {
            return URL(string: fullUrlStr) ?? origin
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        return components.url ?? (URL(string: fullUrlStr) ?? origin)
    }
}
