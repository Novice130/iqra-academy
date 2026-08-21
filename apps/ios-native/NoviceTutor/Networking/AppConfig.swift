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

    /// `https://novicetutor.com/api/...`, optionally with a query string.
    ///
    /// The query cannot be appended to `path`: `appendingPathComponent`
    /// percent-encodes `?` into `%3F`, so `"/api/x?connecting=1"` would ask for
    /// a path that does not exist and come back 404 with nothing to explain it.
    static func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let base = origin.appendingPathComponent(trimmed)
        guard !query.isEmpty else { return base }
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.queryItems = query
        return components?.url ?? base
    }
}
