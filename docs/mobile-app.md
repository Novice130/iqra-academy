# Mobile app (Android first, then iOS)

Rewritten 2026-08-06, when the Android project was actually generated and the
app took its current shape. The plan is still: build it, test it on devices at
home, publish later.

## What the app is

**One WebView holding novicetutor.com, plus push.** That is the whole app, and
the shape is deliberate.

The alternative — native Flutter screens for dashboard, booking and chat,
hitting the API directly — was drafted first and is still in the repo at
`apps/mobile/legacy/lib/`. It is excluded from analysis and from the build
(`analysis_options.yaml`), has never compiled (~240 analyzer errors), and is
kept only because it documents the API call shapes someone once intended. It
would have meant building and maintaining every screen twice, and drifting
from the web app the moment either side changed.

What the shell gets in return:

- **One auth path.** Login happens in the WebView, so the Better Auth session
  cookie lives exactly where the call page expects it. The old plan — sign in
  with Dio, then push the cookie into `CookieManager` — was the first thing
  that would have broken, and it would have looked like a backend bug.
- **One call UI.** The LiveKit call screen is hand-built and took several
  sessions to get right (`integration-livekit.md`). There is now one of it.
- **The join endpoint's three answers are already handled**, because the web
  page handles them. `/api/sessions/[id]/join` can return `joinUrl`,
  `{ waiting: true }`, or `{ redirectSessionId }`; the native draft treated
  the last two as errors.

### Layout

```
apps/mobile/
  lib/main.dart            app shell, theme, APP_URL
  lib/shell/web_shell.dart the WebView and everything native around it
  lib/shell/push.dart      FCM: token, permission, deep links
  android/                 generated 2026-08-06, applicationId com.novicetutor.app
  legacy/lib/              the abandoned native-screen draft (not built)
```

## What the native side actually does

Everything in `web_shell.dart` is there because a plain browser tab cannot do
it:

- **Camera and mic.** `onPermissionRequest` grants the WebView's own gate after
  Android has asked the user; the manifest carries `CAMERA` and `RECORD_AUDIO`.
  `mediaPlaybackRequiresUserGesture: false` matters — the call page publishes
  tracks without a tap first.
- **Hardware back = browser back**, falling through to closing the app only at
  the top of the history stack.
- **Off-site links leave the WebView.** Google OAuth refuses to render inside a
  WebView at all (`disallowed_useragent`), so anything that is not
  `novicetutor.com` or `meet.novicetutor.com` is handed to the system browser.
  **Consequence: "Sign in with Google" cannot complete inside the app.** Email
  and password works. If Google sign-in on mobile matters, the fix is Custom
  Tabs plus a redirect back into the app, and it is not built.
- **Offline screen and pull to refresh**, because a WebView's own failure page
  is a Chrome error page with someone else's branding on it.
- **Deep links.** `https://novicetutor.com/...` opens the app. Full
  verification needs `/.well-known/assetlinks.json` on the site carrying this
  app's signing fingerprint; until then Android shows a chooser, which works.

## Push — the reason the app exists

Everything else in the product polls. A student with the site closed hears
nothing, which is exactly the case a phone should cover.

**Flow:** the app gets an FCM token → registers it by calling `/api/devices`
*from inside the WebView*, so the session cookie authenticates it with no
second auth path → the server stores it in `device_tokens` → when a teacher
starts a class, `/api/teachers/instant-meeting` writes the `MEETING_STARTED`
notification row **and** calls `sendPushToUsers` → tapping the notification
deep-links to `/dashboard/session/<id>`.

**Server side** is `apps/web/src/lib/fcm.ts`. It uses the FCM HTTP v1 API and
signs the OAuth2 assertion with Web Crypto, because `firebase-admin` does not
run on Cloudflare Workers and Workers has no `crypto.createSign`. Dead tokens
(404/`UNREGISTERED`) are deleted on the spot.

**It is all no-op until configured.** Without `FCM_PROJECT_ID`,
`FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` the server never sends; without
`android/app/google-services.json` the app fails `Firebase.initializeApp`,
catches it, and runs as a plain WebView. That is intentional — the app builds
and works before the Firebase project exists.

### Turning push on

1. Firebase console → new project → add an Android app with package name
   `com.novicetutor.app`.
2. Download `google-services.json` → `apps/mobile/android/app/`. It is
   gitignored.
3. Add the Google Services Gradle plugin (`com.google.gms.google-services`) to
   `android/settings.gradle.kts` and `android/app/build.gradle.kts` — without
   it the JSON is ignored and initialization still fails.
4. Project settings → Service accounts → generate a private key; put the three
   values in `apps/web/.env` and in the Worker's secrets.
5. Start a class as a teacher with the app installed and closed.

## Building it

Flutter is **not** installed system-wide. It lives at `~/dev-tools/flutter`,
with a JDK at `~/dev-tools/jdk-17.0.20+8` (Android Studio's bundled JBR at
`/Applications/Android Studio.app/Contents/jbr/Contents/Home` works too), and
the Android SDK where Android Studio put it.

```sh
export PATH="$HOME/dev-tools/flutter/bin:$PATH"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

cd apps/mobile
flutter analyze
flutter build apk --debug          # build/app/outputs/flutter-apk/app-debug.apk
flutter run                        # onto a connected handset
```

Point it at something other than production with
`--dart-define=APP_URL=http://10.0.2.2:3000` (the Android emulator's route to
the host machine).

`flutter doctor -v` hangs with no stdin — it is waiting on a license prompt.
`sdkmanager --licenses` first, or skip it.

### The Gradle pin, and why it is there

`flutter create` generated AGP 9.0.1 / Gradle 9.1 / Kotlin 2.3.20. That
combination does not build: `flutter_inappwebview_android` still calls
`getDefaultProguardFile('proguard-android.txt')`, which AGP 9 refuses outright
("no longer supported since it includes `-dontoptimize`"). Since the WebView
plugin *is* the app, `android/settings.gradle.kts` and the Gradle wrapper are
pinned back to **AGP 8.9.2 / Gradle 8.12 / Kotlin 2.1.0**.

Undo the pin only once `flutter_inappwebview` ships a stable release that
builds on AGP 9 — 6.1.5 is the newest stable as of this writing and does not.
Do not reach for the 6.2.0 betas to dodge this.

## Still to do

- Release signing. The release build is currently signed with the debug key,
  which is fine for sideloading and useless for the Play Store.
- Launcher icon: `flutter_launcher_icons` is configured in `pubspec.yaml`
  against `assets/images/logo.png`; run `dart run flutter_launcher_icons`.
- Push, end to end on a real handset (see above).
- Google sign-in inside the app (Custom Tabs), if it turns out to matter.
- iOS: same codebase, but it needs a developer account, signing, a privacy
  manifest, and `NSCameraUsageDescription` / `NSMicrophoneUsageDescription`.
  `flutter create --platforms=ios .` when that day comes.

## Things that are not bugs

- **Screen sharing is absent on phones.** `getDisplayMedia` does not exist on
  Android Chrome or iOS Safari; the button is correctly hidden.
- **"Sign in with Google" opens the browser.** See above — a WebView is not
  allowed to show that page.
