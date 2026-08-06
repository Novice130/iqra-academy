# Mobile app (Android first, then iOS)

Written 2026-08-06, at the point where the plan is: build it, test it on
devices at home, publish later. Read this before touching `apps/mobile` —
several things about it are not what they look like.

## What actually exists today

A Flutter project at `apps/mobile`, package name still `iqra_academy`, with
`lib/` written out in full: auth, dashboard, booking, chat, session and
settings screens, `go_router` routes, Riverpod providers, a Dio/Retrofit API
client pointed at the Next.js backend, and a theme with the Geist font.

Two things it does **not** have, both of which decide how the next session
starts:

- **No `android/` and no `ios/` directory.** There are no platform projects,
  no Gradle files, no signing config, no `Info.plist`. This project has never
  been built. The first step is `flutter create --platforms=android,ios .`
  from `apps/mobile`, which generates them around the existing `lib/`.
- **Flutter is not installed on this machine.** `flutter` and `dart` are both
  absent from PATH. That is the actual first blocker.

Treat `lib/` as a promising draft, not as working software: none of it has
ever been compiled, so expect the usual crop of API drift and null-safety
errors on the first build.

## The shape of the thing

It is a **WebView wrapper**, and that is the right call for now. The call
screen is a hand-built LiveKit UI that took several sessions to get right
(see `integration-livekit.md`); reimplementing it against the LiveKit Flutter
SDK would mean maintaining two of them. `LiveSessionScreen` fetches
`/api/sessions/{id}/join` and loads the returned `joinUrl` in an
`InAppWebView`.

Consequences to plan around:

**Authentication has to cross into the WebView.** The app signs in through
Better Auth with Dio, but `joinUrl` points at `/dashboard/session/<id>`, a
page behind the auth guard that authenticates by **cookie**. A Dio login does
not populate the WebView's cookie jar. Either share the cookie into
`CookieManager` explicitly, or do the login inside the WebView and let the
app read the session from there. This is the first thing that will appear to
"not work" and it will look like a backend bug. It isn't.

**`/api/sessions/[id]/join` no longer always returns a `joinUrl`.** Since the
one-room-per-class work it can answer with `{ waiting: true }` (class not due
yet) or `{ redirectSessionId }` (the class is happening on another row). The
Flutter screen reads `response.data['joinUrl']` and treats anything else as an
error, so it will show "Failed to join session" in both cases. It needs the
same three-way handling the web page has — follow the redirect, poll while
waiting. See `docs/integration-livekit.md` § One class, one room.

**Permissions.** Camera and microphone inside an `InAppWebView` need
`onPermissionRequest` handled plus the platform manifest entries; on iOS,
`NSCameraUsageDescription` / `NSMicrophoneUsageDescription`, and iOS WebViews
historically need `allowsInlineMediaPlayback` or video takes over the screen.

**Screen sharing does not exist on phones.** `getDisplayMedia` is absent on
iOS Safari and Android Chrome, so the button is correctly hidden there. Not a
bug to chase.

## What the app buys you, honestly

The one capability the web app cannot match on Android is **push
notifications while the app is closed**. `firebase_messaging` and
`firebase_core` are already declared in `pubspec.yaml` and wired to nothing —
no `google-services.json`, no FCM registration, no token sent to the backend.
Everything in the product today is polling (`src/lib/push.ts` and the
`push_subscriptions` table exist for web push and are likewise unused).

If a class starting should reach a student who doesn't have the site open,
that is the feature to build, and it is the reason the app is worth having.

## Suggested order

1. Install Flutter; `flutter create --platforms=android,ios .`; get it to
   compile at all. Expect to fix `lib/` as you go.
2. Point `API_BASE_URL` at `https://novicetutor.com` (the default is
   `10.0.2.2:3000`, the Android emulator's route to a local machine).
3. Log in, land on the dashboard, open a class end to end on a real handset.
   This is also the first real-device test the *web* call screen has ever had
   — see `project_open_items` in memory for the list of things never confirmed
   on hardware.
4. Fix the join-response handling and the WebView cookie problem.
5. FCM: `google-services.json`, register the token against a new endpoint,
   send on `MEETING_STARTED` alongside the existing notification row.
6. Only then iOS: same codebase, but Apple wants a developer account, signing,
   and a privacy manifest, and its WebView rules are stricter.

## Rebrand

`apps/mobile` is still Iqra Academy throughout — package name, `description`,
the logo in `assets/images/`, and the strings in `lib/`. The web app was
rebranded to Novice Tutor; the mobile app never was. Worth doing at step 1,
while the platform projects are being generated and the bundle id is being
chosen anyway (`com.novicetutor.app` rather than inheriting anything from
`iqra_academy`), because changing an application id after a store release is
painful.
