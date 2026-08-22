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
/// in room metadata, the per-person volumes — names the *person*, a bare
/// email. Comparing whole identities therefore never matches, and never
/// matching is silent: the student simply watches whoever happens to be first
/// in the dictionary. Every comparison here goes through ``base(_:)``.
///
/// ── Ending a class is a decision, not an event ──────────────────────────────
/// `/end` is called from exactly one place: the host's tap on End class. Not
/// from a disconnect, not from `onDisappear`, not from backgrounding. A
/// teacher whose train goes into a tunnel has not finished the lesson, and the
/// web client carries the same scar (`LiveKitRoom.tsx`).
///
/// ── Host controls split two ways, and the split is not arbitrary ────────────
/// Muting somebody, renaming them, removing them and changing their volume are
/// server calls, because they are authority the server has to check. *Asking*
/// somebody to unmute or to turn their camera on is a data-channel message,
/// because LiveKit refuses server-forced unmute by design — a server must not
/// be able to switch a microphone on silently. The topic strings here are the
/// web client's (`components/video/hostControls.ts`) and must stay identical.
@Observable
@MainActor
final class CallController {
    /// What fills the main view.
    enum Stage {
        case waitingForOthers
        case remote(VideoTrack, name: String)
        /// Somebody is presenting. Outranks any camera, including a spotlight.
        case screenShare(VideoTrack, name: String)
    }

    /// Per-viewer, never synced — the same choice Zoom calls speaker/gallery.
    /// The default differs by role on purpose: a teacher wants every student
    /// on screen at once, a student wants the teacher big.
    enum Layout: String, CaseIterable {
        case speaker
        case grid
    }

    /// Something the host asked of this device, which only this device can
    /// grant. Nothing happens until the person taps.
    enum HostRequest: String, Equatable {
        case microphone
        case camera
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

    /// One connection in the room, flattened for the views.
    struct Person: Identifiable, Equatable {
        /// The connection: `email#random`. What host actions address.
        let id: String
        /// The person: a bare email. What volumes and spotlight are keyed by.
        let base: String
        let name: String
        let isLocal: Bool
        let isHost: Bool
        let isSpeaking: Bool
        let micOn: Bool
        let cameraOn: Bool
        let isSharingScreen: Bool
        /// Slider travel, 0…1, from room metadata. 1 when untouched.
        let volume: Double
        /// Needed to force-mute; nil when there is no microphone published.
        let micTrackSid: String?

        static func == (lhs: Person, rhs: Person) -> Bool {
            lhs.id == rhs.id && lhs.name == rhs.name && lhs.isSpeaking == rhs.isSpeaking
                && lhs.micOn == rhs.micOn && lhs.cameraOn == rhs.cameraOn
                && lhs.isSharingScreen == rhs.isSharingScreen && lhs.volume == rhs.volume
                && lhs.micTrackSid == rhs.micTrackSid
        }
    }

    let grant: JoinGrant
    let sessionId: String
    let room: Room
    let chat: CallChat

    private(set) var stage: Stage = .waitingForOthers
    private(set) var selfTrack: VideoTrack?
    private(set) var micOn = false
    private(set) var cameraOn = false
    private(set) var isSpeaking = false
    private(set) var status: Status = .connecting
    private(set) var canFlipCamera = false
    private(set) var people: [Person] = []
    private(set) var backgroundBlurred = false
    private(set) var guests: [GuestKnock] = []
    /// The host's ask, waiting on this person's tap.
    private(set) var hostRequest: HostRequest?
    /// Optimistic until the room's own metadata catches up, the same shape as
    /// the web client's pending spotlight.
    private(set) var spotlightBase: String?

    var layout: Layout

    /// Set by the one deliberate exit. It also suppresses the disconnect that
    /// our own `/end` causes: a host who just ended the class should not then
    /// be told the class ended.
    private var isLeaving = false
    private let grants: MediaPermissions.Grants
    /// What the device check chose. A permission is what you *may* publish;
    /// this is what you asked to publish.
    private let choices: PreJoinChoices
    private var shim: DelegateShim?
    private var volumes: [String: Double] = [:]
    private var blurProcessor: BackgroundBlurVideoProcessor?
    private var guestPoll: Task<Void, Never>?

    var micDenied: Bool { !grants.microphone }
    var cameraDenied: Bool { !grants.camera }
    var isHost: Bool { grant.isHost }
    /// Room-wide state a host may change, and everybody else only observes.
    var canModerate: Bool { grant.isModerator }

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
        layout = grant.isModerator ? .grid : .speaker

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
        chat = CallChat(room: room)
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
        readMetadata(room.metadata)
        await chat.start()

        if grants.camera, choices.cameraOn {
            _ = try? await room.localParticipant.setCamera(enabled: true)
        }
        canFlipCamera = (try? await CameraCapturer.canSwitchPosition()) ?? false

        if canModerate { startGuestPolling() }
        refresh()
    }

    /// The one deliberate way out. `endClass` is true only for a host's tap.
    func leave(endClass: Bool) async {
        guard !isLeaving else { return }
        isLeaving = true
        UIApplication.shared.isIdleTimerDisabled = false
        guestPoll?.cancel()
        await chat.stop()

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
        if micOn { clearRequest(.microphone) }
        refresh()
    }

    func toggleCamera() async {
        _ = try? await room.localParticipant.setCamera(enabled: !cameraOn)
        if cameraOn { clearRequest(.camera) }
        refresh()
    }

    func flipCamera() async {
        guard let track = room.localParticipant.firstCameraVideoTrack as? LocalVideoTrack,
              let capturer = track.capturer as? CameraCapturer else { return }
        _ = try? await capturer.switchCameraPosition()
    }

    /// Blurs what is behind you, using the SDK's own Vision-backed processor.
    ///
    /// The processor lives on the *capturer*, so it survives a camera toggle
    /// but not a new track — turning the camera off and on again re-publishes,
    /// which is why this is re-applied from ``refresh()`` rather than set once.
    func setBackgroundBlur(_ enabled: Bool) {
        backgroundBlurred = enabled
        if enabled, blurProcessor == nil {
            blurProcessor = BackgroundBlurVideoProcessor()
        }
        applyBlur()
    }

    /// The person the host is asking about, answered by the person themselves.
    func acceptHostRequest() async {
        guard let request = hostRequest else { return }
        hostRequest = nil
        switch request {
        case .microphone:
            guard grants.microphone, !micOn else { return }
            await toggleMicrophone()
        case .camera:
            guard grants.camera, !cameraOn else { return }
            await toggleCamera()
        }
    }

    func dismissHostRequest() { hostRequest = nil }

    // MARK: - Host controls

    /// Whose camera fills everyone's screen. Room-wide, host only, and it is
    /// the *person* that is spotlighted — a teacher who rejoins on a laptop
    /// stays spotlighted.
    func setSpotlight(_ base: String?) async {
        guard canModerate else { return }
        let previous = spotlightBase
        spotlightBase = base
        refresh()
        do {
            try await APIClient.shared.setSpotlight(sessionId: sessionId, identity: base)
        } catch {
            // A silent failure would leave this device showing a spotlight
            // nobody else has.
            spotlightBase = previous
            refresh()
        }
    }

    /// Room-wide volume for one person: the quiet alternative to muting them,
    /// for a student who should keep reciting while the class listens to
    /// somebody else. Every client applies it, so it is stored on the room.
    func setVolume(_ volume: Double, for base: String) async {
        guard canModerate else { return }
        volumes[base] = volume
        applyVolumes()
        refresh()
        try? await APIClient.shared.setParticipantVolume(
            sessionId: sessionId,
            identity: base,
            volume: volume
        )
    }

    func mute(_ person: Person) async {
        guard canModerate, let sid = person.micTrackSid else { return }
        try? await APIClient.shared.muteParticipant(
            sessionId: sessionId,
            identity: person.id,
            trackSid: sid
        )
    }

    /// LiveKit blocks server-forced unmute, so this is a request the other
    /// device shows and its owner answers.
    func askToUnmute(_ person: Person) async {
        await send(.microphone, to: person.id)
    }

    func askForCamera(_ person: Person) async {
        await send(.camera, to: person.id)
    }

    /// Drops one connection. Per-connection, like muting: the phone somebody
    /// joined on twice goes, their laptop stays. Nothing stops them rejoining
    /// from their dashboard — this is "leave now", not a ban.
    func remove(_ person: Person) async {
        guard canModerate, !person.isLocal else { return }
        try? await APIClient.shared.removeParticipant(sessionId: sessionId, identity: person.id)
    }

    func answerGuest(_ guest: GuestKnock, admit: Bool) async {
        guard canModerate else { return }
        guests.removeAll { $0.id == guest.id }
        try? await APIClient.shared.answerGuest(
            sessionId: sessionId,
            requestId: guest.id,
            admit: admit
        )
    }

    private func send(_ request: HostRequest, to identity: String) async {
        guard canModerate else { return }
        let topic = request == .microphone ? Self.unmuteRequestTopic : Self.cameraRequestTopic
        let payload = Data((request == .microphone ? "unmute" : "camera").utf8)
        try? await room.localParticipant.publish(
            data: payload,
            options: DataPublishOptions(
                destinationIdentities: [Participant.Identity(from: identity)],
                topic: topic,
                reliable: true
            )
        )
    }

    static let unmuteRequestTopic = "unmute-request"
    static let cameraRequestTopic = "camera-request"

    // MARK: - State

    /// Recomputed wholesale from the room on every delegate callback. Cheaper
    /// to write once than to keep a dozen incremental updates agreeing.
    func refresh() {
        let remotes = room.remoteParticipants.values.filter { participant in
            // A screen-share publisher is a capture device wearing a
            // participant's clothes. It is not somebody in the class.
            guard let identity = participant.identity?.stringValue else { return false }
            return !identity.contains("#screen-")
        }

        let focus = spotlightBase ?? grant.teacherIdentity
        let chosen = remotes.first { Self.base($0.identity?.stringValue) == focus } ?? remotes.first

        // A presentation outranks a face, including a spotlighted one: the
        // reason somebody is presenting is that the thing on their screen is
        // what the class is meant to be looking at.
        let presenter = room.remoteParticipants.values.first { $0.firstScreenShareVideoTrack != nil }

        if let presenter, let track = presenter.firstScreenShareVideoTrack {
            stage = .screenShare(track, name: Self.displayName(presenter))
        } else if let chosen, let track = chosen.firstCameraVideoTrack {
            stage = .remote(track, name: Self.displayName(chosen))
        } else {
            stage = .waitingForOthers
        }

        selfTrack = room.localParticipant.firstCameraVideoTrack
        micOn = room.localParticipant.isMicrophoneEnabled()
        cameraOn = room.localParticipant.isCameraEnabled()
        isSpeaking = room.localParticipant.isSpeaking

        people = ([person(from: room.localParticipant)] + remotes.map(person(from:)))
            // Teacher first, then whoever is talking, then alphabetically —
            // a list that reorders itself on every syllable is unusable, so
            // speaking only breaks ties within a role.
            .sorted { lhs, rhs in
                if lhs.isHost != rhs.isHost { return lhs.isHost }
                if lhs.isLocal != rhs.isLocal { return lhs.isLocal }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }

        applyBlur()
        applyVolumes()
    }

    private func person(from participant: Participant) -> Person {
        let identity = participant.identity?.stringValue ?? ""
        let base = Self.base(identity) ?? identity
        let micPublication = participant.audioTracks.first { $0.source == .microphone }
        return Person(
            id: identity,
            base: base,
            name: Self.displayName(participant),
            isLocal: participant is LocalParticipant,
            isHost: base == grant.teacherIdentity,
            isSpeaking: participant.isSpeaking,
            micOn: micPublication.map { !$0.isMuted } ?? false,
            cameraOn: participant.firstCameraVideoTrack != nil,
            isSharingScreen: participant.firstScreenSharePublication != nil,
            volume: volumes[base] ?? 1,
            micTrackSid: micPublication?.sid.stringValue
        )
    }

    /// The video for one person, for the grid. Nil is a face-less tile, not an
    /// absent one — somebody with their camera off is still in the class.
    func videoTrack(for person: Person) -> VideoTrack? {
        if person.isLocal { return selfTrack }
        return room.remoteParticipants.values
            .first { $0.identity?.stringValue == person.id }?
            .firstCameraVideoTrack
    }

    /// Pushes the room's volumes onto the actual audio.
    ///
    /// Re-applied on every refresh rather than only when the metadata changes:
    /// a track subscribed later, or a participant rebuilt by a reconnect,
    /// starts at full volume and would otherwise blast over the lesson.
    private func applyVolumes() {
        for participant in room.remoteParticipants.values {
            let base = Self.base(participant.identity?.stringValue)
            let gain = CallAudio.gain(forSlider: base.flatMap { volumes[$0] } ?? 1)
            for publication in participant.audioTracks {
                // Screen-share audio too: a student presenting a video kept
                // playing at full volume when only the microphone was turned
                // down.
                (publication.track as? RemoteAudioTrack)?.volume = gain
            }
        }
    }

    private func applyBlur() {
        guard let track = room.localParticipant.firstCameraVideoTrack as? LocalVideoTrack else { return }
        let wanted = backgroundBlurred ? blurProcessor : nil
        if track.processor !== wanted { track.processor = wanted }
    }

    /// Guests knock on a link and wait outside; nothing tells the room about
    /// it, so the host's device asks. Only the host — the route refuses
    /// everybody else, and a student polling it would be 403s at 6/min.
    private func startGuestPolling() {
        guestPoll?.cancel()
        guestPoll = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if let waiting = try? await APIClient.shared.pendingGuests(sessionId: sessionId) {
                    await MainActor.run { self.guests = waiting }
                }
                // The web client's interval. Ten seconds is already the
                // difference between a guest waiting and a guest giving up,
                // and this route is a database read per poll per host.
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    private func clearRequest(_ request: HostRequest) {
        if hostRequest == request { hostRequest = nil }
    }

    fileprivate func metadataChanged(_ raw: String?) {
        readMetadata(raw)
        refresh()
    }

    private func readMetadata(_ raw: String?) {
        let parsed = Self.parseMetadata(raw)
        spotlightBase = parsed.spotlight.flatMap(Self.base)
        volumes = parsed.volumes
    }

    fileprivate func received(_ data: Data, topic: String, from participant: RemoteParticipant?) {
        switch topic {
        case Self.unmuteRequestTopic:
            // Already unmuted? Then the ask has been answered by accident and
            // showing it would be noise.
            guard !micOn, grants.microphone else { return }
            hostRequest = .microphone
            Theme.hapticNotification(.warning)
        case Self.cameraRequestTopic:
            guard !cameraOn, grants.camera else { return }
            hostRequest = .camera
            Theme.hapticNotification(.warning)
        case CallChat.legacyTopic:
            chat.receiveLegacy(data, from: participant)
        default:
            break
        }
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

        guestPoll?.cancel()
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

    static func displayName(_ participant: Participant) -> String {
        if let name = participant.name, !name.isEmpty { return name }
        return base(participant.identity?.stringValue) ?? "Someone"
    }

    /// Read-only. Writing room metadata from here would replace the whole
    /// string and wipe the teacher's per-student volumes — which is why both
    /// the spotlight and the volumes go through their own routes, and both of
    /// those patch rather than set.
    private static func parseMetadata(_ raw: String?) -> (spotlight: String?, volumes: [String: Double]) {
        guard let raw, let data = raw.data(using: .utf8) else { return (nil, [:]) }
        struct Metadata: Decodable {
            let spotlightIdentity: String?
            let volumes: [String: Double]?
        }
        guard let decoded = try? JSONDecoder().decode(Metadata.self, from: data) else { return (nil, [:]) }
        return (decoded.spotlightIdentity, decoded.volumes ?? [:])
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

    func room(_: Room, didUpdateSpeakingParticipants _: [Participant]) { onMain { $0.refresh() } }

    func room(
        _: Room,
        participant: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType _: EncryptionType
    ) {
        onMain { $0.received(data, topic: topic, from: participant) }
    }

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
