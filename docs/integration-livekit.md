# Video Calls (LiveKit)

How live classes actually work: where the room comes from, who is allowed
into it, and why the call screen is shaped the way it is.

## Where it runs

**LiveKit Cloud**, not the `livekit.yaml` sitting in this repo — that file is
left over from a self-hosted experiment and nothing reads it. Configuration is
three environment variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`) consumed by `src/lib/livekit.ts`.

Rooms are named `qlms-<sessionId>` (`generateRoomName`). LiveKit **auto-creates
a room on join**, which matters more than it sounds: any code path that mints a
token with `roomJoin` can bring a room into existence, whether or not the class
is running. Every token-issuing path therefore has to check the session state
itself — see the guest flow below.

The web app is the only real client. `apps/mobile` (Flutter) loads
`/dashboard/session/[id]` in an `InAppWebView` rather than embedding the
LiveKit SDK, so everything here applies there too.

## One class, one room

**This is the single most important thing in this document.** A class is not
one session row. The normal shape here is a group row for the teacher *plus an
INDIVIDUAL row per student*, and every person's dashboard links at their own
row. Name the LiveKit room after the row and you get one room per person: on
2026-08-06 a real class of three ran with each student alone in a separate
room while the teacher sat in a fourth.

So the room belongs to the **class occurrence**, not the row.
`src/lib/class-room.ts` resolves any row to one canonical row for that teacher
and slot, identically for every caller, and everyone joins the room named after
*that*:

1. Anything of this teacher's already `IN_PROGRESS` within 6h wins outright —
   a sibling row, an instant meeting, whatever got there first.
2. Otherwise, if the class is due (from an hour before its slot to three hours
   after), the earliest sibling row within 90 minutes takes it, ties broken by
   id. Deterministic on purpose: two students arriving at the same moment must
   not open two rooms.
3. Otherwise it isn't due — the session page shows a lobby rather than opening
   a room for a class that isn't today.

**Whoever arrives first opens the room, students included.** A student half an
hour early is *in* the room, so the next student finds them there and the
teacher joins them on arrival. Opening it marks the class `IN_PROGRESS`, which
is what the admin live-classes panel and the students' ribbon key off. An
admin dropping in to observe is excluded — they are neither teaching nor
attending, and their visit must not mark a class as begun.

A student redirected onto a row they were never booked on is auto-booked there
(roster-checked: the teacher must have taught them before). Without that they
hit a 403 and bounce back to their own empty room, which is the bug itself.

`POST /api/teachers/instant-meeting` follows the same rule: it resumes a class
already running, else starts the one scheduled around now, else creates an
ad-hoc session. "Instant" does not mean "new" — minting a fresh row is what
put the students somewhere else. It takes no arguments and the UI is one tap.

## Joining, and the two kinds of "host"

`POST /api/sessions/[id]/join` issues the token and returns two separate flags:

| Flag | True for | Used for |
| --- | --- | --- |
| `isModerator` | the session's teacher **and** any org/super admin | moderator controls: spotlight, mute, remove, invite link |
| `isHost` | the session's own teacher only | ending the class on disconnect |

They are deliberately not the same check. Ending the session keys off `isHost`,
because an admin who dropped into someone else's class to observe used to end
the lesson for everyone when they left.

Joining also flips a `SCHEDULED` session to `IN_PROGRESS`. Nothing else did
that, so live classes were invisible to every dashboard that filters on it.

### Identity is per connection

Identities are `email#<random>`, not the bare email. LiveKit disconnects an
existing participant when a new one joins with the same identity, so a teacher
opening the room on their phone used to kick their own laptop.

Anything reasoning about *who* someone is (spotlight matching, default focus)
compares `baseIdentity()` — the part before the `#`. Anything acting on a
connection (mute, rename, remove) uses the full identity, so removing the phone
somebody joined on twice leaves their laptop alone.

## Guest links (knock-to-join)

`/join/[id]` is a public page deliberately outside `/dashboard`, so it misses
the auth guard. The security model is that **the link alone grants nothing**:

1. Guest types a name → `POST /api/guest/join` creates a `guest_join_requests`
   row as `PENDING` and returns **no token**.
2. Host sees `GuestKnockPrompt` (top-centre, polls
   `GET /api/sessions/[id]/guests` every 4s) and admits or denies.
3. The guest's own poll on `GET /api/guest/join?requestId=…` mints the token,
   and only once the row says `ADMITTED`.

Constraints, all of which exist because the endpoint is unauthenticated and the
`requestId` travels in a URL a guest can forward:

- **The class must be joinable.** One `isJoinable()` predicate — `IN_PROGRESS`
  and started within 6h — shared by the knock and the token paths. The token
  path used to check only `actualStart`, so a guest kept being handed fresh
  tokens after the class ended and sat alone in an auto-created room.
- **An admission expires 2 minutes after `respondedAt`.** Long enough to
  survive a page reload; short enough that a forwarded link is dead on arrival
  and a removed guest can't re-poll their way back in.
- **Knocks expire after 10 minutes**, written `EXPIRED` server-side by either
  the host's list sweep or the guest's own poll. Filtering stale rows out of
  the host's list without writing the status left guests spinning forever.
- **Repeat knocks are one knock.** Same (session, name) reuses the pending row;
  a session accepts at most 12 pending knocks, so a script can't bury the
  host's video under prompt cards.
- **The invite link is host-only** (`isModerator`), and lives in the People
  panel. The old link pointed at `/dashboard` and was useless without an
  account; `/join` is the door.

Guests join with `isHost={false}`, so leaving can never end the class, and
`LiveKitRoom` takes an `onLeave` callback — the default `/dashboard` push
bounces a guest to a login page for an account they don't have.

## The call screen

`CustomVideoConference` is hand-built rather than LiveKit's `VideoConference`
prefab, and the tiles are ours (`VideoTile`) rather than `ParticipantTile`.
That is not preference: `ParticipantTile`'s `children` *replaces* its
internals, and wrapping it breaks `GridLayout`'s sizing, so per-tile overlay
controls are not possible with the stock components.

**One control row, no floating buttons.** `CallControlBar` is a single centred
row: mic▾, camera▾, present, effects, chat, people, view, leave. The screen had
previously grown one floating button per feature. New features belong in the
People panel or the view menu, not as another button.

- **View menu** (the layout glyph) is layout only: Speaker (follows the room's
  spotlight), Gallery (equal grid), Active speaker (follows the voice). Active
  speaker tracks the *last* speaker — LiveKit's active-speaker list empties on
  every pause, and a view that falls back to the grid between sentences is
  unwatchable. Under 640px the row overflows and the People button is hidden,
  so this menu carries a People entry on phones only.
- **People panel** (`PeoplePanel`) is the one sidebar: the guest invite link,
  the roster with spotlight / mute / ask-to-unmute / remove, and ringing a
  student into the running call.
- **Tile ⋮** (moderators, other people's tiles) carries the same actions plus
  rename. Fixed 220px wide — shrink-to-fit on an absolutely positioned box
  resolves to the tile's width.
- **Default layout is role-based**: teacher/admin → gallery, student → speaker
  focused on `teacherIdentity` until room metadata arrives.

Tiles are `object-fit: contain` on the main frame: a phone publishes a tall
9:16 stream, and `cover` on a widescreen tile crops someone to a slice of their
neck. Small floating tiles keep `cover`.

### What the server can and cannot force

LiveKit will force a mic or camera **off**, never back **on** — a server
shouldn't silently open someone's microphone. So:

| Action | Mechanism |
| --- | --- |
| Mute / turn off camera | `POST /api/sessions/[id]/mute-participant` (server) |
| Ask to unmute / ask for camera | data channel message, `MediaRequestModal` on their side |
| Rename | `POST /api/sessions/[id]/participant` (the name comes from the JWT) |
| Turn one person down | `POST /api/sessions/[id]/volume` (room metadata — see below) |
| Remove from call | `DELETE /api/sessions/[id]/participant?identity=…` |

Removal is per-call, not a ban: LiveKit closes that connection, and nothing
stops the person rejoining from their dashboard. Both surfaces confirm twice
before removing — a mis-tap throws a child out of their lesson, and a browser
`confirm()` steals focus from the call and reads as a page error on a phone.

Every host route resolves the caller against the session, and an `ORG_ADMIN`
counts as a host **only for their own org** — role alone let an admin of one
org reach into another org's live class.

### Per-student volume

The teacher can turn one student down without muting them — asked for so a
student who has finished their turn can carry on reciting out loud while the
class listens to somebody else. Muting would stop that; a quieter mic doesn't.

**It is room state, not a listener preference.** The teacher lowers Sobur and
*everybody* hears Sobur quietly. So the value lives in room metadata beside the
spotlight, as `volumes: { "<base identity>": 0..1 }`, written by a host-only
route and applied on every client:

```
teacher drags ──▶ POST /api/sessions/[id]/volume  (host only)
                     └─ patchRoomMetadata → LiveKit broadcasts
                          └─ every client: RemoteParticipant.setVolume()
```

Keyed on **base** identity, so a student whose phone drops and reconnects comes
back as quiet as the teacher left them. The apply effect re-runs on
`ParticipantConnected` and `TrackSubscribed` as well as on metadata change:
`setVolume` remembers the value on the participant *object*, and a reconnect
builds a new one.

**The stored number is slider travel, not amplitude.** `setVolume` takes raw
amplitude, and the first version handed it the fraction directly — so 50%
meant −6 dB, which the ear reads as about two thirds as loud, and turning a
student down "sounded almost the same". Clients now map the fraction through
`gainForSlider` (`src/lib/audio-gain.ts`), which spreads the travel over 40 dB:

| Slider | 100% | 75% | 50% | 25% | 0% |
|--------|------|-----|-----|-----|-----|
| Gain   | 1.0  | 0.32 | 0.10 | 0.03 | 0 (silent) |

Metadata, the API and the UI all still talk in fractions; only the last step
before the audio applies the curve. Anything asserting on a real `<audio>`
element must expect the *gain*, not the percentage.

Four things worth knowing before touching it:

- **`patchRoomMetadata` (`src/lib/room-metadata.ts`) exists because
  `updateRoomMetadata` replaces the whole string.** The spotlight route used to
  write `{ spotlightIdentity }` outright, which was harmless only while
  spotlight was the sole key. Read, merge, write — always.
- **The range stops at 100%.** That is the top of the curve, and `setVolume`
  lands on `HTMLMediaElement.volume`, which clamps at 1; a "boost" would move
  the handle and do nothing.
- **Both audio sources get the value.** `setVolume` defaults to the microphone
  alone, so it is called a second time for `Track.Source.ScreenShareAudio` —
  otherwise a shared screen keeps playing at full volume.
- **Phones ignore `volume` entirely** — read-only on iOS, ignored by Chromium
  on Android (Chrome and the app's WebView). Both opt into `webAudioMix`
  (`needsWebAudioMix()` in `LiveKitRoom.tsx`), routing audio through a gain
  node. Desktop stays off it: it takes over output routing, and `setSinkId` —
  the pre-join speaker picker — only exists on desktop. Its one hazard is an
  AudioContext that starts suspended, which silences the whole class;
  `useAudioPlaybackUnlock` in `CustomVideoConference.tsx` calls `startAudio()`
  on the next tap when `canPlaybackAudio` is false.

Two surfaces, one `VolumeSlider`: the tile ⋮ menu and the People panel row.
Moderator-only, because it changes what everyone hears.

### Spotlight

Stored in room metadata as `spotlightIdentity`, matched on `baseIdentity()`.
It seeds to the *session teacher*, never the joining user, so an admin dropping
in to observe doesn't become the big picture on every student's screen. The
join route backfills it via `listRooms` + `updateRoomMetadata` for the case
where a student's connection auto-created the room with empty metadata before
the teacher's `createRoom` ran, and never clobbers a spotlight set by hand.

### Backgrounds

Client-side MediaPipe segmentation, available to everyone: none / two blur
levels / eleven hand-written SVG wallpapers in `public/backgrounds`. Those SVGs
need explicit `width`/`height`, not just a `viewBox` — they're loaded through
`new Image()` + `createImageBitmap`, which has no intrinsic size to work from
otherwise.

The choice persists in `localStorage` (`nt.background-effect`), per browser
rather than per account: a phone and a desk want different setups. Effects
attach to `useLocalParticipant().cameraTrack`, not `localParticipant` — keyed
off the participant alone, a background chosen on the pre-join screen was
remembered but never applied, because no track exists at mount.

**The pipeline is ours, not `@livekit/track-processors`' (2026-08-08).** Its
`BackgroundProcessor` is still the dependency we get `ProcessorWrapper` and
`VideoTransformer` from, but the compositing is in
`src/components/video/segmentation/`. The grain that made this look worse than
Meet was never the model's resolution, which is what the first investigation
concluded. It was two things upstream does to the mask:

- it asks for a **category** mask — one bit per pixel — so the only edge
  softness available is whatever a box blur can invent from a staircase;
- it segments every frame in **complete ignorance of the previous one**, so
  every pixel the model is unsure about flips at 30Hz. That flicker is what
  reads as grain. A still screenshot of the old output looks far better than
  the live picture did, which is why this took a while to pin down.

So `glPipeline.ts` asks for **confidence** masks, blends each into the previous
frame's (an exponential moving average, `temporalBlend`), feathers the result,
and composites with a narrow smoothstep plus a light wrap — a little background
colour bled onto the rim, which is most of what stops a cut-out looking pasted
on. Everything runs at mask resolution until the final pass, so it costs a
handful of extra 256×144 draws over the old pipeline.

Two model gotchas, both of which produced a *working-looking* wrong result:

- `selfie_segmenter.tflite` (two classes) returns **one** confidence mask and
  it is the foreground. `selfie_multiclass_256x256.tflite` returns **six** and
  the first is the background. Invert one and you replace the person with the
  wallpaper. `transform()` decides from `confidenceMasks.length`, not from
  which model it thinks it loaded.
- The multiclass model is the default's runner-up, not the default. Its edges
  are indistinguishable on a real frame, it costs ~3× per frame, and its sixth
  category ("others") takes in whatever is on the desk — a teacher at a laptop
  keeps a slab of laptop lid floating in front of their wallpaper.

**`/debug/segmentation` is the bench**: your camera raw beside the processed
output, every tuning knob on a slider, `?model=detailed` to compare. No auth,
no database. The numbers in `DEFAULT_SETTINGS` came from there, and changing
them without going back to it is guessing. To drive it headlessly, Chrome will
take a still image as a camera:
`--use-file-for-fake-video-capture=<file.y4m>` — `public/teacher.png` converted
to y4m makes a realistic subject, which the built-in fake camera (a flat
colour) very much is not.

### Screen sharing

Desktop browsers use `getDisplayMedia` through `useTrackToggle`, as normal.

**Android has no `getDisplayMedia` at all**, so the app publishes a screen
track from native code as a second participant in the same room. The web side
of that is `nativeScreenShare.ts` + `/api/sessions/[id]/screen-token`; the
capture is in `apps/mobile`. Full write-up in `mobile-app.md`.

Nothing in the call UI special-cases it, and nothing should: the screen
publisher is a participant with one `screenShareVideo` track and no camera, so
the existing rules already do the right thing. It never appears in the People
roster (that list is built from camera tracks), and the screen becomes the
focused view with every camera dropping to floating tiles.

## Ending a call, and the billing leak

`POST /api/sessions/[id]/end` updates the DB **and** calls
`deleteRoom(roomName)`. It used to do only the first, so rooms stayed open
(and billing) until LiveKit's idle timeout eventually caught them.

`/api/admin/livekit-rooms` (ORG_ADMIN/SUPER_ADMIN) lists every open room with
participant counts and force-closes one or all of them — the self-serve check
when usage minutes look wrong.

Deleting a session goes through `deleteSessionCascade()`
(`src/lib/session-cleanup.ts`), which covers all eight tables carrying an FK to
`sessions`, guest knocks included.

## Moving off LiveKit Cloud

**The code ports without changes. The operations are the whole job.**

Everything this app asks of LiveKit is in the open-source server's own API:
`AccessToken` for JWTs, `RoomServiceClient` for `createRoom`,
`updateRoomMetadata`, `mutePublishedTrack`, `updateParticipant`,
`removeParticipant`, `listRooms`, `listParticipants`, `deleteRoom`. On the
client it's `livekit-client` and `@livekit/components-react`, which neither
know nor care who runs the SFU. Background effects are `@livekit/track-processors`
running MediaPipe **in the browser** — no server involvement at all.

There is no Cloud-only surface in use: no Egress (the "recording" route only
stores a URL and an access level — nothing actually records), no Ingress, no
SIP, no Cloud Agents, no analytics API. All of it is behind three environment
variables:

```
LIVEKIT_URL=wss://your-host
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Point those at your own server and the app is moved. `getRoomServiceClient()`
already derives the HTTP host from `LIVEKIT_URL` by swapping the scheme, so
nothing else needs editing.

What you take on instead:

- **TURN.** Cloud gives you global TURN for free. Self-hosted, students behind
  strict NATs or mobile carriers simply fail to connect without a working TURN
  server on 443/TLS. This is the most common self-host failure and it looks
  like "video works for some people".
- **Placement and latency.** The teacher is in India and the students are in
  the US. Cloud routes each participant to a nearby edge; a single box does
  not. Wherever you put it, someone gets the long path — pick the box's region
  deliberately rather than by where the server was easiest to buy.
- **TLS, Redis, scaling.** A single instance needs a real certificate (LiveKit
  clients refuse self-signed) and, past one node, Redis for room distribution.
- **Capacity and upgrades.** Bandwidth is yours now, and so is keeping the SFU
  version in step with the client SDK — they're released together and drift
  causes subtle media bugs.

Note the repo already contains a stale `livekit.yaml` and Jitsi environment
variables (`JITSI_*`, `JVB_AUTH_PASSWORD`) from earlier experiments. Nothing
reads them; don't take either as a starting point without checking against the
current LiveKit docs.

A sensible move is to run both for a while: point a staging deployment at the
self-hosted server, run real classes on it, and keep Cloud until TURN and
routing are proven with the actual students on the actual networks.

## Testing it

There is no automated test for the call screen; a green build proves nothing
about it. The check that has actually caught bugs is scripting a real call with
`puppeteer-core` against the installed Chrome, launched with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, driving
login → instant meeting → join in one browser and `/join/[id]` in another.

Run the dev server with the origin pinned or Better-Auth rejects the login:

```
PORT=3005 BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3005 \
NEXT_PUBLIC_APP_URL=http://localhost:3005 BETTER_AUTH_URL=http://localhost:3005 \
npm run dev
```

Dev compiles routes on demand, so wait on selectors rather than sleeping, and
retry the first API call. **It hits the live Neon database and real LiveKit** —
delete the sessions it creates afterwards.
