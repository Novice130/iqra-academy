import Foundation

/// Every call the app makes to novicetutor.com.
///
/// ── Why cookies and not a bearer token ──────────────────────────────────────
/// The server is Better Auth with database-backed sessions and a signed
/// cookie; there is no token endpoint to call and inventing one would mean a
/// second auth path to keep correct. `URLSession` already persists cookies to
/// disk per app, so a session survives a relaunch with no keychain code and no
/// refresh logic. The trade is that sign-out has to be a real request — the
/// server row is the session, so dropping the cookie locally would leave it
/// alive on the server.
///
/// ── The Origin header ───────────────────────────────────────────────────────
/// Better Auth rejects a request whose `Origin` is not in its trusted list
/// with `INVALID_ORIGIN`, and an app has no origin of its own to send. Every
/// request therefore states the one it is talking to. Getting this wrong
/// surfaces as a 403 on sign-in that reads like a rejected password, which is
/// why it is set centrally here rather than per call site.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var authToken: String?

    init() {
        authToken = UserDefaults.standard.string(forKey: "auth.session_token")
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.waitsForConnectivity = false
        // Nothing this client asks for is worth a stale answer: the endpoints
        // are all "what is true right now". Left on the default policy, a
        // response with no cache headers can be served from URLSession's disk
        // cache — which is one of the ways a class the teacher had already
        // ended kept being offered on the home screen.
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 15
        session = URLSession(configuration: configuration)

        decoder = JSONDecoder()
        // The API sends instants as ISO-8601 with milliseconds
        // ("2026-08-20T20:00:00.000Z"), which `.iso8601` alone does not accept.
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.withMilliseconds.date(from: raw) {
                return date
            }
            if let date = ISO8601DateFormatter.plain.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Not an ISO-8601 instant: \(raw)"
            )
        }

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601DateFormatter.withMilliseconds.string(from: date))
        }
    }

    func setAuthToken(_ token: String?) {
        self.authToken = token
        if let token {
            UserDefaults.standard.set(token, forKey: "auth.session_token")
        } else {
            UserDefaults.standard.removeObject(forKey: "auth.session_token")
        }
    }

    // MARK: - Requests

    func get<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        as: Response.Type = Response.self
    ) async throws -> Response {
        try await send(request(path, method: "GET", query: query))
    }

    /// For callers that only care whether the request worked.
    func get(_ path: String, query: [URLQueryItem] = []) async throws {
        _ = try await sendRaw(request(path, method: "GET", query: query))
    }

    func post<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body,
        as: Response.Type = Response.self
    ) async throws -> Response {
        var request = request(path, method: "POST")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    /// For the handful of endpoints that answer with a body nothing reads.
    @discardableResult
    func post<Body: Encodable>(_ path: String, body: Body) async throws -> Data {
        var request = request(path, method: "POST")
        request.httpBody = try encoder.encode(body)
        return try await sendRaw(request)
    }

    /// For a DELETE that says what it is deleting in the query string.
    @discardableResult
    func delete(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
        try await sendRaw(request(path, method: "DELETE", query: query))
    }

    @discardableResult
    func delete<Body: Encodable>(_ path: String, body: Body) async throws -> Data {
        var request = request(path, method: "DELETE")
        request.httpBody = try encoder.encode(body)
        return try await sendRaw(request)
    }

    private func request(_ path: String, method: String, query: [URLQueryItem] = []) -> URLRequest {
        var request = URLRequest(url: AppConfig.url(path, query: query))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(AppConfig.origin.absoluteString, forHTTPHeaderField: "Origin")
        return request
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data = try await sendRaw(request)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func sendRaw(_ request: URLRequest) async throws -> Data {
        #if DEBUG
        print("[APIClient] Sending \(request.httpMethod ?? "GET") \(request.url?.absoluteString ?? "")")
        if let body = request.httpBody, let str = String(data: body, encoding: .utf8) {
            print("[APIClient] Body: \(str)")
        }
        #endif
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            #if DEBUG
            print("[APIClient] Error: \(error)")
            #endif
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(URLError(.badServerResponse))
        }

        #if DEBUG
        print("[APIClient] Status \(http.statusCode) for \(request.url?.path ?? "")")
        #endif

        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw APIError.unauthorized }
            let failure = try? decoder.decode(APIFailure.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                // `message` is the sentence written for a person; `error` is
                // the short label. Prefer the sentence, fall back to the label.
                message: failure?.message ?? failure?.error ?? "Something went wrong.",
                code: failure?.code
            )
        }

        return data
    }

    /// Drops the local cookie after the server has ended the session. Only
    /// safe to call once `/api/auth/sign-out` has answered — doing it first
    /// leaves the row alive with nothing able to end it.
    func clearCookies() {
        guard let store = session.configuration.httpCookieStorage else { return }
        store.cookies?.forEach(store.deleteCookie)
    }
}

/// `{ "error": "Forbidden", "message": "...", "code": "FORBIDDEN" }`
private struct APIFailure: Decodable {
    let error: String?
    let message: String?
    let code: String?
}

private extension ISO8601DateFormatter {
    static let withMilliseconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let plain = ISO8601DateFormatter()
}
