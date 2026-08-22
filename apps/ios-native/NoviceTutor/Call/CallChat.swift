import Foundation
import LiveKit
import Observation

/// In-class chat, on the wire the web client already speaks.
///
/// This is **not** `/api/chat` — that is the durable teacher↔student
/// messaging outside a lesson. Chat during a class is LiveKit's own, and it
/// exists twice on the wire because `@livekit/components-react` sends it
/// twice:
///
///   - a **text stream** on topic `lk.chat` (the current transport), and
///   - a **legacy data packet** on topic `lk-chat-topic` carrying
///     `{ id, timestamp, message, ignoreLegacy }`, kept for clients that
///     predate streams.
///
/// When the server supports streams — LiveKit Cloud does — the web client
/// marks the legacy copy `ignoreLegacy: true` so nobody shows it twice. This
/// reads both and de-duplicates on the message id anyway, because "the same
/// message printed twice" is the failure mode of getting that wrong and it is
/// invisible until somebody is actually chatting mid-lesson.
///
/// Messages are not persisted anywhere: joining late means missing what was
/// said, on web too.
@Observable
@MainActor
final class CallChat {
    static let streamTopic = "lk.chat"
    static let legacyTopic = "lk-chat-topic"

    struct Message: Identifiable, Equatable {
        let id: String
        let body: String
        let senderName: String
        let sentAt: Date
        let isMine: Bool
    }

    private(set) var messages: [Message] = []
    /// Counted only while the chat sheet is closed; the view zeroes it.
    private(set) var unread = 0

    private weak var room: Room?
    private var seen: Set<String> = []

    init(room: Room) {
        self.room = room
    }

    func start() async {
        guard let room else { return }
        try? await room.registerTextStreamHandler(for: Self.streamTopic) { [weak self] reader, identity in
            let text = (try? await reader.readAll()) ?? ""
            let info = reader.info
            await self?.receive(
                id: info.id,
                body: text,
                sentAt: info.timestamp,
                senderIdentity: identity.stringValue
            )
        }
    }

    func stop() async {
        await room?.unregisterTextStreamHandler(for: Self.streamTopic)
    }

    func send(_ text: String) async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let room else { return }

        // The stream is the message. The legacy packet is a courtesy to old
        // clients, and its failure must not lose the message the person typed
        // — so it is sent after, and separately.
        guard let info = try? await room.localParticipant.sendText(body, for: Self.streamTopic) else { return }

        receive(
            id: info.id,
            body: body,
            sentAt: Date(),
            senderIdentity: room.localParticipant.identity?.stringValue
        )

        let legacy = LegacyMessage(id: info.id, timestamp: Int64(Date().timeIntervalSince1970 * 1000), message: body, ignoreLegacy: true)
        if let data = try? JSONEncoder().encode(legacy) {
            try? await room.localParticipant.publish(
                data: data,
                options: DataPublishOptions(topic: Self.legacyTopic, reliable: true)
            )
        }
    }

    /// A legacy packet off the data channel. Dropped when the sender has
    /// already sent the same thing as a stream.
    func receiveLegacy(_ data: Data, from participant: RemoteParticipant?) {
        guard let decoded = try? JSONDecoder().decode(LegacyMessage.self, from: data),
              decoded.ignoreLegacy != true else { return }
        receive(
            id: decoded.id ?? UUID().uuidString,
            body: decoded.message,
            sentAt: decoded.timestamp.map { Date(timeIntervalSince1970: Double($0) / 1000) } ?? Date(),
            senderIdentity: participant?.identity?.stringValue
        )
    }

    func markRead() { unread = 0 }

    // MARK: - Internals

    private func receive(id: String, body: String, sentAt: Date, senderIdentity: String?) {
        guard !seen.contains(id) else { return }
        seen.insert(id)

        let mine = senderIdentity == room?.localParticipant.identity?.stringValue
        let message = Message(
            id: id,
            body: body,
            senderName: name(for: senderIdentity, mine: mine),
            sentAt: sentAt,
            isMine: mine
        )
        messages.append(message)
        if !mine { unread += 1 }
    }

    /// The display name if the sender is still in the room, otherwise the
    /// person behind the identity. A message must never read as being from
    /// nobody just because its sender has since hung up.
    private func name(for identity: String?, mine: Bool) -> String {
        if mine {
            return room?.localParticipant.name?.nilIfEmpty ?? "You"
        }
        guard let identity else { return "Someone" }
        let remote = room?.remoteParticipants.values.first { $0.identity?.stringValue == identity }
        return remote?.name?.nilIfEmpty
            ?? CallController.base(identity)
            ?? "Someone"
    }

    private struct LegacyMessage: Codable {
        let id: String?
        let timestamp: Int64?
        let message: String
        let ignoreLegacy: Bool?
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
