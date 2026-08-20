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
    /// Ten minutes early matches `lib/class-room.ts`.
    func isJoinable(now: Date = .now) -> Bool {
        guard status == .scheduled || status == .inProgress else { return false }
        let opens = scheduledStart.addingTimeInterval(-10 * 60)
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

/// The join endpoint answers 200 with one of two different bodies: a grant,
/// or — when the class was merged into another — only the id of the class to
/// ask for instead. Decoding straight into ``JoinGrant`` would fail on the
/// second, so the two cases are separated before either is read.
enum JoinOutcome: Decodable, Sendable {
    case grant(JoinGrant)
    case redirect(sessionId: String)

    private struct Redirect: Decodable { let redirectSessionId: String }

    init(from decoder: Decoder) throws {
        if let redirect = try? Redirect(from: decoder) {
            self = .redirect(sessionId: redirect.redirectSessionId)
            return
        }
        self = .grant(try JoinGrant(from: decoder))
    }
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
    func join(sessionId: String) async throws -> (grant: JoinGrant, sessionId: String) {
        switch try await joinOutcome(sessionId: sessionId) {
        case .grant(let grant):
            return (grant, sessionId)
        case .redirect(let next):
            switch try await joinOutcome(sessionId: next) {
            case .grant(let grant):
                return (grant, next)
            case .redirect:
                throw APIError.server(
                    status: 200,
                    message: "This class has moved more than once. Open it from your schedule again.",
                    code: nil
                )
            }
        }
    }

    private func joinOutcome(sessionId: String) async throws -> JoinOutcome {
        try await get("/api/sessions/\(sessionId)/join", as: JoinOutcome.self)
    }
}
