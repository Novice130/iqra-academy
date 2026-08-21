import Foundation

// MARK: - Identity

enum UserRole: String, Codable, Sendable {
    case student = "STUDENT"
    case teacher = "TEACHER"
    case orgAdmin = "ORG_ADMIN"
    case superAdmin = "SUPER_ADMIN"

    /// Staff open a roster; a family opens their own schedule.
    var isStaff: Bool { self != .student }
}

struct CurrentUser: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let email: String
    let role: UserRole
    let orgId: String
    /// The IANA zone the person set. Class times are instants and are
    /// rendered in whichever zone the phone is in, so this is only read where
    /// the app has to agree with the server about a *day* boundary.
    let timezone: String?
    let image: String?
}

private struct MeResponse: Decodable { let user: CurrentUser }

// MARK: - Classes

enum SessionStatus: String, Codable, Sendable {
    case scheduled = "SCHEDULED"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case cancelled = "CANCELLED"
    case noShow = "NO_SHOW"
}

/// One class, as the schedule needs it.
struct ClassSession: Codable, Identifiable, Sendable {
    let id: String
    let title: String?
    let type: String
    let status: SessionStatus
    let scheduledStart: Date
    let scheduledEnd: Date
    let teacher: Teacher?

    struct Teacher: Codable, Sendable { let name: String? }

    var displayTitle: String {
        title ?? "Quran class"
    }

    /// The window the join button is live in. The server decides for real —
    /// this only keeps the app from offering a button that will be refused.
    /// An hour early matches `EARLY_JOIN_MS` in `lib/class-room.ts`; a tighter
    /// number here hides the button for fifty minutes the server would have
    /// allowed, and the person has no way to tell that from a broken app.
    func isJoinable(now: Date = .now) -> Bool {
        guard status == .scheduled || status == .inProgress else { return false }
        let opens = scheduledStart.addingTimeInterval(-60 * 60)
        let closes = scheduledEnd.addingTimeInterval(30 * 60)
        return now >= opens && now <= closes
    }
}

struct Booking: Codable, Identifiable, Sendable {
    let id: String
    let status: String
    let session: ClassSession
}

struct QuotaStatus: Codable, Sendable {
    let allowed: Int?
    let used: Int?
    let remaining: Int?
}

struct BookingsResponse: Decodable, Sendable {
    let bookings: [Booking]
    let quota: QuotaStatus?
}

/// What `/api/students/live-class` answers when a teacher is in a room now.
struct LiveClass: Codable, Sendable {
    let sessionId: String
    let teacherName: String
    let title: String?
    let startedAt: Date?
}

struct LiveClassResponse: Decodable, Sendable { let live: LiveClass? }

/// A teacher's own list, from `/api/teachers/sessions`.
struct TeacherSessionsResponse: Decodable, Sendable { let sessions: [ClassSession] }

// MARK: - Joining a room

/// Everything needed to connect to LiveKit, minted per person per class.
struct JoinGrant: Decodable, Sendable {
    let roomName: String
    let token: String
    let serverUrl: String
    let userName: String
    let identity: String
    let isModerator: Bool
    let isHost: Bool
    let teacherIdentity: String?
    let teacherName: String?
}

/// What the server says about a class that has not opened yet.
struct JoinWaiting: Decodable, Sendable {
    let sessionTitle: String?
    let teacherName: String?
    /// Nullable on the server, so optional here.
    let scheduledStart: Date?
}

/// The join endpoint answers 200 with one of *three* different bodies: a
/// grant, the id of the class to ask for instead (when this one was merged
/// into another), or a note that the class is not open yet. Decoding straight
/// into ``JoinGrant`` fails on the other two, so each is recognised before any
/// of them is read.
///
/// Probe order matters, and so does the shape of each probe: the
/// discriminating field must be required and non-optional. ``JoinWaiting`` is
/// all-optional, so a grant body would satisfy it — which is why `waiting`
/// itself is checked through a separate one-field struct first.
enum JoinOutcome: Decodable, Sendable {
    case grant(JoinGrant)
    case redirect(sessionId: String)
    case waiting(JoinWaiting)

    private struct Redirect: Decodable { let redirectSessionId: String }
    private struct WaitingFlag: Decodable { let waiting: Bool }

    init(from decoder: Decoder) throws {
        if let redirect = try? Redirect(from: decoder) {
            self = .redirect(sessionId: redirect.redirectSessionId)
            return
        }
        if let flag = try? WaitingFlag(from: decoder), flag.waiting {
            self = .waiting(try JoinWaiting(from: decoder))
            return
        }
        self = .grant(try JoinGrant(from: decoder))
    }
}

/// The outcome of asking to join, once redirects have been followed.
enum JoinResult: Sendable {
    /// The canonical session id travels with the answer: a merge redirect
    /// means the room lives on a different row, and leaving or ending has to
    /// name that row, not the one the person tapped.
    case grant(JoinGrant, sessionId: String)
    case waiting(JoinWaiting, sessionId: String)
}

// MARK: - Auth payloads

struct SignInRequest: Encodable, Sendable {
    let email: String
    let password: String
}

struct SignUpRequest: Encodable, Sendable {
    let email: String
    let password: String
    let name: String
}

// MARK: - Endpoints

extension APIClient {
    func me() async throws -> CurrentUser {
        try await get("/api/me", as: MeResponse.self).user
    }

    func signIn(email: String, password: String) async throws {
        try await post("/api/auth/sign-in/email", body: SignInRequest(email: email, password: password))
    }

    func signUp(name: String, email: String, password: String) async throws {
        try await post("/api/auth/sign-up/email", body: SignUpRequest(email: email, password: password, name: name))
    }

    func signOut() async throws {
        // The session is a database row, so it ends server-side first. Only
        // then is the local cookie worth dropping.
        struct Empty: Encodable {}
        try await post("/api/auth/sign-out", body: Empty())
        clearCookies()
    }

    func studentBookings() async throws -> BookingsResponse {
        try await get("/api/students/bookings")
    }

    func teacherSessions() async throws -> [ClassSession] {
        try await get("/api/teachers/sessions", as: TeacherSessionsResponse.self).sessions
    }

    func liveClass() async throws -> LiveClass? {
        try await get("/api/students/live-class", as: LiveClassResponse.self).live
    }

    /// Asks for a room, following at most one merge redirect.
    ///
    /// One hop and no more: a redirect that points at another merged row
    /// would mean the server holds a cycle, and chasing it would hang the app
    /// instead of showing the person an error.
    ///
    /// `connecting` is not cosmetic. It is what makes the server evict this
    /// person's stale connections, open their attendance row, and — for a
    /// teacher — ring every booked student. Send it only on the request whose
    /// token is actually handed to LiveKit: on a speculative one it would
    /// evict the connection the person is currently sitting in.
    func join(sessionId: String, connecting: Bool) async throws -> JoinResult {
        switch try await joinOutcome(sessionId: sessionId, connecting: connecting) {
        case .grant(let grant):
            return .grant(grant, sessionId: sessionId)
        case .waiting(let waiting):
            return .waiting(waiting, sessionId: sessionId)
        case .redirect(let next):
            switch try await joinOutcome(sessionId: next, connecting: connecting) {
            case .grant(let grant):
                return .grant(grant, sessionId: next)
            case .waiting(let waiting):
                return .waiting(waiting, sessionId: next)
            case .redirect:
                throw APIError.server(
                    status: 200,
                    message: "This class has moved more than once. Open it from your schedule again.",
                    code: nil
                )
            }
        }
    }

    private func joinOutcome(sessionId: String, connecting: Bool) async throws -> JoinOutcome {
        try await get(
            "/api/sessions/\(sessionId)/join",
            query: connecting ? [URLQueryItem(name: "connecting", value: "1")] : [],
            as: JoinOutcome.self
        )
    }

    /// Closes this connection's attendance row.
    ///
    /// The identity names the *connection*, not the person: someone in the
    /// class from a phone and a laptop has two open rows, and leaving on one
    /// must not close the other.
    func leave(sessionId: String, identity: String) async throws {
        struct Body: Encodable { let identity: String }
        try await post("/api/sessions/\(sessionId)/leave", body: Body(identity: identity))
    }

    /// Ends the class for everyone. Only ever from the host's deliberate tap —
    /// never from a disconnect, a backgrounded app, or a dismissed view.
    func endClass(sessionId: String) async throws {
        struct Empty: Encodable {}
        try await post("/api/sessions/\(sessionId)/end", body: Empty())
    }

    // MARK: - Account

    func accountDeletability() async throws -> AccountDeletability {
        try await get("/api/me/account")
    }

    /// Irreversible. Cancels upcoming classes and anonymises the account.
    func deleteAccount() async throws {
        struct Body: Encodable { let confirm = "DELETE" }
        try await delete("/api/me/account", body: Body())
    }

    // MARK: - Push

    func registerDevice(token: String) async throws {
        struct Body: Encodable {
            let token: String
            let platform = "ios"
        }
        try await post("/api/devices", body: Body(token: token))
    }

    func unregisterDevice(token: String) async throws {
        struct Body: Encodable { let token: String }
        try await delete("/api/devices", body: Body(token: token))
    }
}

/// `GET /api/me/account` — whether this account may delete itself.
struct AccountDeletability: Decodable, Sendable {
    let role: String
    let canDelete: Bool
}
