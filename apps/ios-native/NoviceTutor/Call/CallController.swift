import Foundation
import LiveKit
import Observation
import UIKit

/// The live class: one LiveKit room, and everything the call screen shows.
///
/// ── Identities are per connection, people are not ───────────────────────────
/// The server mints `email#random` for every connection (`lib/livekit.ts`), so
/// the same teacher on a phone and a laptop is two identities. Everything that
/// asks "is this the teacher?" — the grant's `teacherIdentity`, the spotlight
/// in room metadata — names the *person*, a bare email. Comparing whole
/// identities therefore never matches, and never matching is silent: the
/// student simply watches whoever happens to be first in the dictionary.
/// Every comparison here goes through ``base(_:)``.
///
/// ── Ending a class is a decision, not an event ──────────────────────────────
/// `/end` is called from exactly one place: the host's tap on End class. Not
/// from a disconnect, not from `onDisappear`, not from backgrounding. A
/// teacher whose train goes into a tunnel has not finished the lesson, and the
/// web client carries the same scar (`LiveKitRoom.tsx`).
@Observable
@MainActor
final class CallController {
    /// What fills the main view.
    enum Stage {
        case waitingForOthers
        case remote(VideoTrack, name: String)
    }

    /// Why the call is over. Each one reads differently to the person.
    enum Ended: Equatable {
        /// The host ended it, or this connection was told the room is gone.
        case classEnded
        /// The server evicted this connection because the same person joined
        /// again elsewhere. Not an error, and not the class ending.
        case joinedElsewhere
        case connectionLost
        case left
    }

    enum Status: Equatable {
        case connecting
        case live
        case reconnecting
        case ended(Ended)
    }

    let grant: JoinGrant
    let sessionId: String
    let room: Room

    private(set) var stage: Stage = .waitingForOthers
    private(set) var selfTrack: VideoTrack?
    private(set) var micOn = false
    private(set) var cameraOn = false
    private(set) var status: Status = .connecting
    private(set) var canFlipCamera = false

    /// Set by the one deliberate exit. It also suppresses the disconnect that
    /// our own `/end` causes: a host who just ended the class should not then
    /// be told the class ended.
    private var isLeaving = false
    private let grants: MediaPermissions.Grants
    /// What the device check chose. A permission is what you *may* publish;
    /// this is what you asked to publish.
    private let choices: PreJoinChoices
    private var shim: DelegateShim?
    private var spotlightBase: String?

    var micDenied: Bool { !grants.microphone }
    var cameraDenied: Bool { !grants.camera }

    init(
        grant: JoinGrant,
        sessionId: String,
        grants: MediaPermissions.Grants,
        choices: PreJoinChoices
    ) {
        self.grant = grant
        self.sessionId = sessionId
        self.grants = grants
        self.choices = choices

        let shim = DelegateShim()
        self.shim = shim
        // `adaptiveStream` and `dynacast` both default to false. On a phone on
        // mobile data that is the difference between a class that works and
        // one that stutters: without them the client pulls every layer of
        // every track regardless of how large it is actually being drawn.
        room = Room(
            delegate: shim,
            connectOptions: ConnectOptions(enableMicrophone: grants.microphone && choices.micOn),
            roomOptions: RoomOptions(
                defaultCameraCaptureOptions: CameraCaptureOptions(
                    position: .front,
                    dimensions: .h720_169,
                    fps: 24
                ),
                adaptiveStream: true,
                dynacast: true
            )
        )
        shim.owner = self
    }

    // MARK: - Lifecycle

    func connect() async {
        // The default mute mode plays an iOS sound effect on every mute and
        // unmute. In a class where the teacher mutes students constantly that
        // is an irritant with no upside; the input mixer is silent. The trade
        // is that the orange mic indicator stays lit while muted.
        try? AudioManager.shared.set(microphoneMuteMode: .inputMixer)

        // Nobody taps the screen while they are being taught.
        UIApplication.shared.isIdleTimerDisabled = true

        do {
            try await room.connect(url: grant.serverUrl, token: grant.token)
        } catch {
            status = .ended(.connectionLost)
            return
        }

        status = .live
        spotlightBase = Self.spotlight(in: room.metadata)

        if grants.camera, choices.cameraOn {
            _ = try? await room.localParticipant.setCamera(enabled: true)
        }
        canFlipCamera = (try? await CameraCapturer.canSwitchPosition()) ?? false

        refresh()
    }

    /// The one deliberate way out. `endClass` is true only for a host's tap.
    func leave(endClass: Bool) async {
        guard !isLeaving else { return }
        isLeaving = true
        UIApplication.shared.isIdleTimerDisabled = false

        if endClass {
            // Before disconnecting: once we are gone the server still needs to
            // hear this, and `/end` closes everyone's attendance itself, so no
            // `/leave` follows it.
            try? await APIClient.shared.endClass(sessionId: sessionId)
            await room.disconnect()
        } else {
            await room.disconnect()
            try? await APIClient.shared.leave(sessionId: sessionId, identity: grant.identity)
        }

        status = .ended(endClass ? .classEnded : .left)
    }

    /// For a view going away without anyone having tapped anything — a swipe
    /// down, a push, the app being killed. Never ends the class.
    nonisolated func tearDown() {
        Task { @MainActor in await leave(endClass: false) }
    }

    // MARK: - Controls

    func toggleMicrophone() async {
        _ = try? await room.localParticipant.setMicrophone(enabled: !micOn)
        refresh()
    }

    func toggleCamera() async {
        _ = try? await room.localParticipant.setCamera(enabled: !cameraOn)
        refresh()
    }

    func flipCamera() async {
        guard let track = room.localParticipant.firstCameraVideoTrack as? LocalVideoTrack,
              let capturer = track.capturer as? CameraCapturer else { return }
        _ = try? await capturer.switchCameraPosition()
    }

    // MARK: - State

    /// Recomputed wholesale from the room on every delegate callback. Cheaper
    /// to write once than to keep a dozen incremental updates agreeing.
    func refresh() {
        let people = room.remoteParticipants.values.filter { participant in
            // A screen-share publisher is a capture device wearing a
            // participant's clothes. It is not somebody in the class.
            guard let identity = participant.identity?.stringValue else { return false }
            return !identity.contains("#screen-")
        }

        let focus = spotlightBase ?? grant.teacherIdentity
        let chosen = people.first { Self.base($0.identity?.stringValue) == focus } ?? people.first

        if let chosen, let track = chosen.firstCameraVideoTrack {
            let name = chosen.name?.isEmpty == false
                ? chosen.name!
                : (Self.base(chosen.identity?.stringValue) ?? "Someone")
            stage = .remote(track, name: name)
        } else {
            stage = .waitingForOthers
        }

        selfTrack = room.localParticipant.firstCameraVideoTrack
        micOn = room.localParticipant.isMicrophoneEnabled()
        cameraOn = room.localParticipant.isCameraEnabled()
    }

    fileprivate func metadataChanged(_ raw: String?) {
        spotlightBase = Self.spotlight(in: raw)
        refresh()
    }

    fileprivate func reconnecting() {
        guard case .live = status else { return }
        status = .reconnecting
    }

    fileprivate func reconnected() {
        guard case .reconnecting = status else { return }
        status = .live
        refresh()
    }

    fileprivate func disconnected(_ error: LiveKitError?) {
        // Our own leave already said what happened.
        guard !isLeaving else { return }

        switch error?.type {
        case .participantRemoved, .duplicateIdentity:
            // The join route's own stale-connection sweep landing on us. The
            // class is fine; this device is simply no longer the one in it.
            status = .ended(.joinedElsewhere)
        case .roomDeleted:
            status = .ended(.classEnded)
        default:
            // The SDK has already retried with backoff by this point.
            status = .ended(.connectionLost)
        }

        UIApplication.shared.isIdleTimerDisabled = false
        // The row still needs closing; the webhook would eventually do it, but
        // not before the teacher's attendance report looks wrong.
        let sessionId = sessionId
        let identity = grant.identity
        Task { try? await APIClient.shared.leave(sessionId: sessionId, identity: identity) }
    }

    // MARK: - Helpers

    /// The person, not the connection.
    static func base(_ identity: String?) -> String? {
        guard let identity else { return nil }
        return identity.split(separator: "#", maxSplits: 1).first.map(String.init)
    }

    /// Read-only. Writing room metadata from here would replace the whole
    /// string and wipe the teacher's per-student volumes.
    private static func spotlight(in raw: String?) -> String? {
        guard let raw, let data = raw.data(using: .utf8) else { return nil }
        struct Metadata: Decodable { let spotlightIdentity: String? }
        return (try? JSONDecoder().decode(Metadata.self, from: data))?.spotlightIdentity
    }
}

/// `RoomDelegate` is an `@objc` protocol, so the conformer has to be an
/// `NSObject` — which an `@Observable` class cannot also be. This shim exists
/// only to cross onto the main actor: the SDK documents that delegate methods
/// arrive on no guaranteed thread.
private final class DelegateShim: NSObject, RoomDelegate, @unchecked Sendable {
    weak var owner: CallController?

    private func onMain(_ body: @escaping @MainActor (CallController) -> Void) {
        Task { @MainActor [weak owner] in
            guard let owner else { return }
            body(owner)
        }
    }

    func roomDidConnect(_: Room) { onMain { $0.refresh() } }
    func roomIsReconnecting(_: Room) { onMain { $0.reconnecting() } }
    func roomDidReconnect(_: Room) { onMain { $0.reconnected() } }

    func room(_: Room, didUpdateMetadata metadata: String?) {
        onMain { $0.metadataChanged(metadata) }
    }

    func room(_: Room, didFailToConnectWithError _: LiveKitError?) {
        onMain { $0.disconnected(nil) }
    }

    func room(_: Room, didDisconnectWithError error: LiveKitError?) {
        onMain { $0.disconnected(error) }
    }

    func room(_: Room, participantDidConnect _: RemoteParticipant) { onMain { $0.refresh() } }
    func room(_: Room, participantDidDisconnect _: RemoteParticipant) { onMain { $0.refresh() } }

    func room(_: Room, participant _: RemoteParticipant, didSubscribeTrack _: RemoteTrackPublication) {
        onMain { $0.refresh() }
    }

    func room(_: Room, participant _: RemoteParticipant, didUnsubscribeTrack _: RemoteTrackPublication) {
        onMain { $0.refresh() }
    }

    func room(_: Room, participant _: Participant, trackPublication _: TrackPublication, didUpdateIsMuted _: Bool) {
        onMain { $0.refresh() }
    }

    func room(_: Room, participant _: LocalParticipant, didPublishTrack _: LocalTrackPublication) {
        onMain { $0.refresh() }
    }

    func room(_: Room, participant _: LocalParticipant, didUnpublishTrack _: LocalTrackPublication) {
        onMain { $0.refresh() }
    }
}
