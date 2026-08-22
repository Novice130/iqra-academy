# Next up — what's left, and who does which part

Written 2026-08-23, after the polling change shipped (`043fa96`, `e9d6388`,
`8b3567b`, deployed as Worker version `898502fc`).

Nothing in this file is started. It is deliberately a plan, not a progress
report — the testing work in particular should begin from a clean session
rather than inherit anyone's assumptions about what already works.

---

## 0. Where things stand

Shipped and live:

- The live-class ribbon and the incoming-call poll now run at a cadence the
  **server** chooses, and stop entirely when the app is backgrounded or in a
  call. Measured on the simulator: idle 28 → 7.5 requests/min, backgrounded
  ~24/min → **0**.
- A class-ended push is sent from both end paths (the host pressing End, and
  LiveKit's `room_finished`). It is written, deployed, and **silent** —
  nothing arrives on iOS until item 2 below is done.
- `/api/sessions/[id]/end` no longer 500s when LiveKit keys are absent.

Two things are true and worth holding onto:

- **`docs/remaining-work.md` item 1 (the `withHttpDb` sweep) is done.** Both
  the auth catch-all GET and the live-class route are on the HTTP driver.
- FCM secrets (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`) are
  already set on the Worker. The **server** side of push needs nothing.

---

## 1. Delete the test accounts before submitting to Apple

`teststudent1@test.com`, `teststudent2@test.com`, `teststudent3@test.com`,
`testteacher@test.com`, and the `testclass_*` session rows.

Two separate reasons, and they need doing at different times:

**Before the App Store build.** A shipped app should not have working
credentials for accounts that exist on the live system. The literals are
already out of the source (they come from `AppConfig.devTestPassword` now,
supplied via `NT_PASSWORD` or a `-dev.testPassword` launch argument, and every
quick sign-in shortcut hides itself when there is none), but the accounts
themselves are still real.

**Security, independent of Apple.** The old password is still in *pushed* git
history — commits `9971273` and `8640cc8`, both on `origin/master`. Removing it
from HEAD stopped it spreading; it did not remove it from any clone anyone
already has. Deleting the accounts makes the exposed string worthless, which is
the cheap fix. Rewriting history with `git filter-repo` would work too but
breaks every existing clone, so it is not recommended.

**Do not delete rows by hand.** Sessions have foreign keys from eight tables
(`bookings`, `call_invites`, `chat_rooms`, `guest_join_requests`,
`notifications`, `progress_records`, `session_attendees`, `teacher_feedback`).
Go through `deleteSessionCascade()` in `src/lib/session-cleanup.ts` — both
hand-rolled delete paths used to miss `call_invites` and `notifications`, and
every affected meeting silently failed to delete.

**Order matters:** delete these *after* the testing in item 5, because the UI
test and every quick sign-in shortcut depend on them. This is the last step
before an App Store build, not the first.

---

## 2. Firebase: upload the APNs key, download the plist

You have the Apple Developer Program and a `.p8`. This is what turns push on.

### What to do

1. In the Apple Developer portal, confirm the identifier `com.novicetutor.app`
   has **Push Notifications** enabled on the App ID. Enabling it later means
   regenerating provisioning profiles, so check before going further.
2. Firebase console → project `fir-auth-d4f03` → Project settings → **Cloud
   Messaging** → *Apple app configuration* → upload the **APNs auth key**:
   the `.p8`, plus its **Key ID** and your **Team ID**.
3. Same settings page → *Your apps* → add an iOS app with bundle id
   `com.novicetutor.app` if one does not exist → download
   **`GoogleService-Info.plist`**.
4. Put the plist at `apps/ios-native/NoviceTutor/GoogleService-Info.plist` and
   add it to the Xcode target. It is gitignored (`GoogleService-Info.plist` is
   in the root `.gitignore`) and must stay that way — it carries the project's
   API keys.

### Which `.p8` is which

There are two and they are not interchangeable:

- **APNs auth key** (`AuthKey_XXXXXXXX.p8`, from Certificates → Keys → Apple
  Push Notification service). This is the one Firebase wants. One key works for
  every app in the team, and for both sandbox and production.
- **App Store Connect API key** (from App Store Connect → Users and Access →
  Integrations). This one is for `apps/ios-native/scripts/release.sh` to upload
  builds. It stays at `~/.appstoreconnect/private_keys/` and never enters the
  repo — hand back only its Key ID and Issuer ID.

### Why Firebase at all, rather than talking to APNs directly

The server runs on Cloudflare Workers, and `firebase-admin` does not run there
— so `apps/web/src/lib/fcm.ts` signs its own service-account JWT with Web
Crypto RS256 and calls the FCM HTTP v1 API. That code already exists, is
already deployed, and already branches per platform
(`const isIos = (device) => device.platform === "ios"`).

Android registers through the same `POST /api/devices` endpoint into the same
`device_tokens` table, keyed by a `platform` column. Routing iOS through FCM as
well means **one sender, one token table, one code path** for both platforms.
Talking to APNs directly would mean a second implementation of token
management, retry, and dead-token pruning, for no gain.

Uploading the `.p8` is what authorises FCM to deliver to APNs on our behalf.
Downloading the plist is what makes `PushService.isAvailable` true in the app.

### What happens automatically once the plist lands

Nothing further to write. `PushService` configures Firebase, asks for
permission after sign-in, and registers the token. `AppDelegate` already
handles `didReceiveRemoteNotification` and routes `CLASS_ENDED` /
`CALL_ENDED`. `remote-notification` is already in `UIBackgroundModes`. When
`PushService.canReceivePush` flips true, the idle ring poll drops itself from
5s to 30s.

**One caveat, stated honestly:** iOS throttles silent (`content-available`)
pushes and drops them entirely for an app the user force-quit. The class-ended
push is a best-effort accelerator. The adaptive poll is what makes the ribbon
*correct*; push is what makes it feel *instant*.

### While you are in there — check the LiveKit webhook signing key

The webhook endpoint you created is right. `WebhookReceiver.receive` verifies
the signature against `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` as set on the
Worker. If the "Signing API key" you picked in LiveKit Cloud (`Novice_tutor`)
is a *different* key pair than those secrets, every delivery returns 401 and
the webhook silently does nothing — no error anywhere, it just never works.
Worth confirming the key id matches.

---

## 3. iOS call screen — bring it up to the web's feature set, and make it look native

This is the biggest single gap in the app, and it is a product problem as much
as an engineering one: the iOS call screen has four buttons, and the web call
screen has roughly fifteen capabilities.

### What iOS has today

`Call/CallControlBar.swift`, in full: mic toggle, camera toggle, flip camera,
hang up.

### What the web has, and iOS does not

From `apps/web/src/components/video/`:

| Capability | Where it lives on web | Who it is for |
|---|---|---|
| Background blur / replacement | `BackgroundEffects.tsx` + `segmentation/` | both |
| Screen share | `nativeScreenShare.ts`, `ScreenSharePill.tsx` | both |
| Device pickers (camera, mic) | `cameraDevices.ts`, settings sheet | both |
| Chat | `ChatIcon` path in `CustomVideoConference.tsx` | both |
| People panel | `PeoplePanel.tsx` | both |
| Per-participant volume | `VolumeSlider.tsx` | student, mostly |
| Spotlight a participant | `PeoplePanel.tsx` | both |
| Layout switching | `LayoutIcon` path | both |
| Host: mute a participant | `hostControls.ts` → `muteTrack` | teacher |
| Host: ask to unmute | `UNMUTE_REQUEST_TOPIC` | teacher |
| Host: ask for camera | `CAMERA_REQUEST_TOPIC` | teacher |
| Host: remove a participant | `hostControls.ts` → `removeParticipant` | teacher |
| Host: End class vs Leave | `CallControlBar.tsx` | teacher |
| Guest admission (knock) | `GuestKnockPrompt.tsx` | teacher |
| Solo inactivity prompt | `SoloInactivityPrompt.tsx` | both |

The host-control ones are LiveKit data-channel topics, so the iOS side is a
publish/subscribe on the same topic strings — not new server work. Check each
against the server before building: some are pure client, some are not.

### The look

Target the shape people already know from FaceTime and the iOS in-call UI,
because a Quran student's parent has used that and has not used ours:

- Full-bleed remote video, local participant in a small draggable corner tile
  that snaps to the nearest corner.
- Controls in a floating rounded container over the video, auto-hiding after a
  few seconds of no touches and returning on tap.
- Circular translucent control buttons with `.ultraThinMaterial`, filled when
  active, red only for the end button.
- A pull-up sheet (detents) for everything secondary — people, chat, effects,
  devices — rather than more buttons on the bar.
- Speaking indicator on tiles, and a clear "muted" badge.
- Respect the safe area and the Dynamic Island; the bar sits above the home
  indicator.
- Landscape as a first-class layout, not a stretched portrait one.

Two existing constraints to honour, both learned the hard way:

- `feedback_mobile_layout_regressions`: a passing build is not a rendered
  screen. Prefer inline style over utility classes on call UI, and check at
  402pt width.
- `project_teacher_leave_vs_disconnect`: only a deliberate "End class" may end
  the class. A backgrounded app, a dropped connection, or a dismissed sheet
  must never call `/end`.

---

## 4. A landing page for the iOS app

Wanted: a modern marketing page that turns a visitor into a download, rather
than the current in-app `PublicHomeScreenView` doing that job by itself.

Points worth deciding before building:

- **Where it lives.** A dedicated route on `novicetutor.com` (say `/app`) is
  the obvious home; it can use the existing design system and ships with the
  same deploy.
- **The funnel.** Visitor → sees what a class actually looks like → App Store
  button (and the existing Android APK link from R2) → installs → signs up or
  books a trial. The trial class already exists as a first-class concept
  (`sessions.isTrial`, paired with `consumesQuota: false`), so the page can
  point straight at it.
- **What actually converts here.** A parent choosing a Quran tutor wants to
  see the teacher, the structure (Noorani Qaida → Tajweed → Hifz, which the
  app already names), and the schedule fitting their week. Screenshots of a
  real class beat feature bullets.
- **App Store rules.** Per `project_payments_and_app_store`: no in-app prices,
  1-on-1 is IAP-exempt, group classes are not. The landing page is a website
  and may talk about price freely — the *app* may not link to it in a way that
  reads as steering around IAP. Keep that boundary deliberate.
- Needs the App Store URL, so it cannot fully ship before item 2's chain
  completes. Everything except the final link can be built now.

---

## 5. Device testing — the plan, to be run fresh

**Do not start this from the current session.** Run it clean.

Escalating, so a failure localises to one layer:

1. **Website in a desktop browser.** Two participants, teacher and student.
   Confirm the whole feature set in the table above still works. This is the
   reference implementation — if something is broken here, it is not a mobile
   bug.
2. **Website in mobile Safari on a real iPhone.** Same call. This separates
   "our layout breaks at phone width" from "the native app is wrong".
3. **Android WebView shell.** Same again. Confirms the shell's permission
   plumbing and `nativeScreenShare`.
4. **iOS simulator joining a real class**, with a web teacher on the other
   side. The specific question is **whether the student sees and hears other
   participants** — outbound audio was proven in `9620837`, inbound never was.
   The simulator serves `Mock video device 1`, so its own camera proves
   nothing, but it can *receive* remote video fine.
5. **Real iPhone**, last, for the three things a simulator cannot show:
   inbound audio through the speaker, a real camera (and therefore whether
   background effects look right on a face), and background audio with the
   phone locked mid-class.

Free Personal Team signing covers steps 4 and 5; the profile expires every 7
days. Push cannot be tested until item 2 is done.

Local setup for any of this is in `reference_ios_against_local_dev` — the short
version is that the dev server needs
`NEXT_PUBLIC_APP_URL=http://localhost:3000` or the app cannot hold a session,
and local HTTPS does not work as a substitute.

---

## 6. Known and deliberately not fixed

- **A student opening the room early flips the session to `IN_PROGRESS`**
  (`api/sessions/[id]/join/route.ts:235`), so the ribbon can advertise a live
  class with no teacher in it. The read-side fix is to require an open
  `session_attendance` row with `role = 'TEACHER'` in the live-class query.
  Left alone on request.
- **`NoviceTutorUITests/SignInFlowUITests` is stale.** It looks for text fields
  labelled "Email" and "Password"; the sign-in redesign renamed them, and
  signed-out now lands on `PublicHomeScreenView` rather than the form.
  `LiveRibbonUITests` works around this by using the debug quick-sign-in
  shortcut.
- **`emptyTimeout` is 600s** (`join/route.ts:205`), so an abandoned room stays
  `IN_PROGRESS` for up to ten minutes before `room_finished` fires. The host
  pressing End is instant; this only affects a teacher who closes the tab.
