# Novice Tutor — native iOS app

A SwiftUI app that talks to `novicetutor.com` over its existing JSON API. It
replaces the Flutter WebView shell in `apps/mobile` for iOS; that shell is
still what ships on Android.

## Running it

```
open apps/ios-native/NoviceTutor.xcodeproj
```

Or from the command line:

```
xcodebuild -project apps/ios-native/NoviceTutor.xcodeproj \
  -scheme NoviceTutor \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

## Pointing it at a laptop

Release builds always talk to `novicetutor.com`. A debug build can be aimed
somewhere else: **tap the "Novice Tutor" title four times** on the sign-in
screen and fill in the server field, or pass it at launch:

```
xcrun simctl launch <udid> com.novicetutor.app -dev.originOverride http://localhost:3000
```

Two things have to line up on the server side, and both fail in ways that look
like a wrong password:

- **Trusted origin.** Better Auth answers `INVALID_ORIGIN` to an origin it
  does not know. Start the dev server with
  `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000`.
- **Cookie security.** When `NEXT_PUBLIC_APP_URL` is `https://…`, Better Auth
  issues a `__Secure-` cookie, and `URLSession` will not send one over plain
  HTTP — sign-in returns 200 and every request after it is a 401. Start the
  dev server with `NEXT_PUBLIC_APP_URL=http://localhost:3000` as well. `curl`
  does not enforce this, so a working curl proves nothing here.

A real device cannot reach the Mac's `localhost`; use the Mac's address on the
network and put that same string in `BETTER_AUTH_TRUSTED_ORIGINS`.

## Tests

`NoviceTutorUITests` drives the real app against a real server — it signs in
with `teststudent1@test.com` and checks the schedule loads. Deliberately not
hermetic: what breaks in this app is the seams (a cookie kept across requests,
the role choosing an endpoint, dates decoded from the API's format), and none
of those fail against a stub.

```
xcodebuild test -project apps/ios-native/NoviceTutor.xcodeproj \
  -scheme NoviceTutor \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Override the server or account with `NT_ORIGIN`, `NT_EMAIL`, `NT_PASSWORD`.
**`NT_PASSWORD` has no default and the tests skip without it** — the password
is not in this repository.

`xcodebuild` does not pass your shell environment to the test process. Prefix
each variable with `TEST_RUNNER_` and it arrives with the prefix stripped:

```
TEST_RUNNER_NT_ORIGIN=https://novicetutor.com \
TEST_RUNNER_NT_PASSWORD=... \
xcodebuild test -project apps/ios-native/NoviceTutor.xcodeproj -scheme NoviceTutor \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

## Layout

| Folder | What lives there |
| --- | --- |
| `App/` | Entry point, session state, root routing, account screen |
| `Networking/` | API client, models, endpoints, config |
| `Auth/` | Sign in and sign up |
| `Schedule/` | The classes list |
| `Call/` | Joining a class, and the class itself |
| `DesignSystem/` | The few shared colours and shapes |

The Xcode project uses **synchronized folder groups**, so a new `.swift` file
under `NoviceTutor/` is picked up with no project file edit.

## The call

`Call/` is the class itself: `CallScreen` asks the server for a grant,
`CallController` owns the LiveKit `Room`, `CallStageView` and `CallControlBar`
draw it, and `CallLobbyView` is what a person sees when they are early.

Three server conventions it has to honour, all of them silent when broken:

- **Identity is per connection, `email#random`.** `teacherIdentity` in the
  grant and `spotlightIdentity` in room metadata are bare emails, so every
  comparison goes through the part before the `#`.
- **`?connecting=1` goes only on the request whose token is used.** It is what
  makes the server drop stale connections, open the attendance row, and ring
  the class. On a speculative request it would evict the connection the person
  is sitting in.
- **Room metadata is read, never written.** `updateRoomMetadata` replaces the
  whole string, so a write from here would wipe the teacher's spotlight and
  every per-student volume.

`/end` is called from one place only: the host's tap on **End class**. Never
from a disconnect, a backgrounded app, or a dismissed view — a teacher whose
train goes into a tunnel has not finished the lesson.

**The room has not been exercised against a live class yet.** The simulator has
no camera, misrepresents audio routing, and cannot receive a push, so the
two-device pass (iOS student + web teacher in the same class) has to happen on
a real iPhone.

## Push

`App/PushService.swift`. The server already sends through FCM and branches on
`device_tokens.platform`, so iOS registers an FCM token against
`POST /api/devices` with `platform: "ios"` and needs no server change.

It degrades rather than crashes: `GoogleService-Info.plist` is gitignored, and
without it the service quietly does nothing and the app is otherwise complete.
This is a notification, not a ring — a full-screen incoming call needs a PushKit
VoIP push, which FCM cannot send.

## Not done yet

- Chat, progress, booking, and the teacher's roster.
- Screen share, background effects, per-student volume, spotlight *control*
  (reading it is in), host moderation, CallKit ringing.

## Releasing

`scripts/release.sh` archives, exports and uploads **this** project. It is not
`apps/mobile/scripts/ios-release.sh`, which builds the Flutter shell that still
ships on Android — both projects declare `com.novicetutor.app`, and only one of
them can be the app on the store.

```
./scripts/release.sh --no-upload   # archive and export only
./scripts/release.sh --validate    # ...and run Apple's validation
./scripts/release.sh               # ...and upload
```

Build number comes from `git rev-list --count HEAD`, so it can never repeat —
Apple rejects a build number it has already seen. Export compliance is answered
in `Config/Info.plist`, so the upload does not ask.

Needs `APP_STORE_CONNECT_KEY_ID` and `APP_STORE_CONNECT_ISSUER_ID` in the
environment, and the API key at
`~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`. `*.p8` is gitignored:
anyone holding one can ship builds as us.
