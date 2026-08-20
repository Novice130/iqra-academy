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

## Layout

| Folder | What lives there |
| --- | --- |
| `App/` | Entry point, session state, root routing, account screen |
| `Networking/` | API client, models, endpoints, config |
| `Auth/` | Sign in and sign up |
| `Schedule/` | The classes list |
| `Call/` | Joining a class |
| `DesignSystem/` | The few shared colours and shapes |

The Xcode project uses **synchronized folder groups**, so a new `.swift` file
under `NoviceTutor/` is picked up with no project file edit.

## Not done yet

- The room itself. `Call/RoomView.swift` shows the grant the server minted and
  stops there; the LiveKit Swift SDK is the next piece.
- Push, and therefore ringing. Needs the APNs key.
- Chat, progress, booking, and the teacher's roster.
