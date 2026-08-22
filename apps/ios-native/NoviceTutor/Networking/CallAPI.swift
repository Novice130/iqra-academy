import Foundation

/// The host-only half of the call API, plus the room's shared state.
///
/// Everything here already exists for the web client and is deliberately
/// *not* re-specified: the same routes, the same bodies, the same rules about
/// who may call them. Where the two clients disagree the web one is right,
/// because it is the one people have been using.
extension APIClient {
    // MARK: - Host controls

    /// Force-mutes one published track. Muting is a server call; unmuting is
    /// not, and cannot be — LiveKit refuses server-forced unmute so that a
    /// server can never switch somebody's microphone on silently. Asking is
    /// the only honest option, and that goes over the data channel.
    func muteParticipant(sessionId: String, identity: String, trackSid: String) async throws {
        struct Body: Encodable {
            let identity: String
            let trackSid: String
            let muted: Bool
        }
        try await post(
            "/api/sessions/\(sessionId)/mute-participant",
            body: Body(identity: identity, trackSid: trackSid, muted: true)
        )
    }

    /// Drops one connection from the room. Per-connection, like muting: the
    /// phone somebody joined on twice goes, their laptop stays. Nothing stops
    /// them rejoining from their dashboard — this is "leave now", not a ban.
    func removeParticipant(sessionId: String, identity: String) async throws {
        try await delete(
            "/api/sessions/\(sessionId)/participant",
            query: [URLQueryItem(name: "identity", value: identity)]
        )
    }

    /// Who fills everyone's screen. `nil` clears it. Named by *person* (a bare
    /// email), never by connection — see ``CallController/base(_:)``.
    func setSpotlight(sessionId: String, identity: String?) async throws {
        struct Body: Encodable { let identity: String? }
        try await post("/api/sessions/\(sessionId)/spotlight", body: Body(identity: identity))
    }

    /// Room-wide, not per-listener: the teacher drags it and the whole class
    /// hears the change, because the value lives in the room's metadata.
    /// `volume` is slider travel in 0…1, not amplitude — clients map it
    /// through ``CallAudio/gain(forSlider:)`` on the way to the audio.
    func setParticipantVolume(sessionId: String, identity: String, volume: Double) async throws {
        struct Body: Encodable {
            let identity: String
            let volume: Double
        }
        try await post(
            "/api/sessions/\(sessionId)/volume",
            body: Body(identity: identity, volume: volume)
        )
    }

    // MARK: - Guests waiting to be let in

    func pendingGuests(sessionId: String) async throws -> [GuestKnock] {
        try await get("/api/sessions/\(sessionId)/guests", as: GuestKnockList.self).guests
    }

    func answerGuest(sessionId: String, requestId: String, admit: Bool) async throws {
        struct Body: Encodable {
            let requestId: String
            let action: String
        }
        try await post(
            "/api/sessions/\(sessionId)/guests",
            body: Body(requestId: requestId, action: admit ? "admit" : "deny")
        )
    }
}

/// Somebody on a guest link, standing outside the room.
struct GuestKnock: Decodable, Identifiable, Sendable, Equatable {
    let id: String
    let name: String
    let askedAt: Date
}

private struct GuestKnockList: Decodable {
    let guests: [GuestKnock]
}

/// Slider travel → amplitude.
///
/// A mirror of `apps/web/src/lib/audio-gain.ts`, and it has to stay one: the
/// teacher's drag is stored once in room metadata and applied independently by
/// every client, so a phone with a different curve would hear a different
/// class from the laptop next to it.
enum CallAudio {
    private static let silenceBelow = 0.02
    private static let minDb = -40.0

    static func gain(forSlider fraction: Double) -> Double {
        // A garbled metadata value must not mute the class, and NaN would
        // sail through the clamp below and reach the audio as silence.
        guard fraction.isFinite else { return 1 }
        let f = min(1, max(0, fraction))
        if f <= silenceBelow { return 0 }
        if f >= 1 { return 1 }
        return pow(10, (minDb * (1 - f)) / 20)
    }
}
