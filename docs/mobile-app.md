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

## Handing it to a student

`https://novicetutor.com/app/download` — a page on the site, not a store
listing, so it also has to talk someone through Android's "unknown app"
warning. Most people stop there otherwise.

**The APKs live in R2, not in `public/`.** They used to be Worker static
assets, and that stopped being possible on 2026-08-08: screen sharing pulled
in WebRTC's native libraries, the arm64 build went from 18.9MB to 32.1MB, and
**a single Workers static asset is capped at 25 MiB**. Over that ceiling
`deploy:cf` fails with `Error: Asset too large.` — the whole deploy, not just
the file.

Publishing a build is an upload, not a copy:

```sh
npx wrangler r2 object put novicetutor-app/novice-tutor.apk \
  --file apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk \
  --content-type application/vnd.android.package-archive --remote

npx wrangler r2 object put novicetutor-app/novice-tutor-arm32.apk \
  --file apps/mobile/build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk \
  --content-type application/vnd.android.package-archive --remote
```

`--remote` is not optional. Without it wrangler writes to a local simulated
bucket and cheerfully reports success.

Serving is `apps/web/src/app/api/app-download/[file]/route.ts`, over the
`APP_DOWNLOADS` binding in `wrangler.json`. It hands `object.body` straight to
the `Response` and allow-lists the two filenames. **Never buffer the object** —
the worker has 128MB of memory and reading a 32MB file in to send it is the
same mistake that caused the August 1102 outages (`worker-limits.md`). For the
same reason, do not "simplify" this by storing the APK in Postgres.

`deploy:cf` warns if an `.apk` reappears in `public/app/`, because that is what
silently breaks the next deploy. Bump `VERSION` and `SIZE` in
`src/app/app/download/page.tsx` when the app version changes.

## Ringing the phone

A teacher pressing "Ring" on a student is a phone call, not a notification.
`IncomingCallOverlay` on the web only rings a student who already has the site
open and foregrounded — the case that matters (phone in a pocket, screen off)
was unreachable until this.

**Server:** `POST /api/calls` sends `sendCallPush` — **data-only**, HIGH
priority, 45s TTL. Data-only matters: include a `notification` block and
Android renders it itself and never wakes the app, which is the difference
between a phone that rings and a tray badge. The 45s TTL matches the teacher's
own ring timeout, because a ring that arrives at midnight is worse than one
that never arrives. `cancel`, `decline` and `accept` all send `CALL_ENDED` so
the handset stops ringing — including the student's *other* devices when they
answer on one of them.

**App:** `lib/shell/incoming_call.dart` draws it with
`flutter_callkit_incoming` (ringtone, Accept/Decline, over the lock screen).
The FCM background handler shows the call even from a killed process.

Accept and Decline have to work with **no WebView on screen**, so they read the
session cookie straight out of `CookieManager` — process-wide, not per-widget —
and attach it to a plain `HttpClient` POST. One source of truth for the
session: the cookie the site itself set. Both are best-effort; if the phone is
offline at that moment the teacher's 45s timeout still resolves the call as
"no answer".

Answering from a lock screen while the app is **killed** launches the app
rather than delivering an event, so `PushService.init` also checks
`FlutterCallkitIncoming.activeCalls()` and picks the accepted call up from
there.

Needs `USE_FULL_SCREEN_INTENT` in the manifest. Android 14 restricts that to
calling and alarm apps — sideloading is fine, a Play Store listing needs a
declaration.

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
# JDK 17, not Android Studio's JBR 21: flutter_callkit_incoming asks Gradle
# for a Java 17 toolchain, and under JBR 21 the build dies with "Cannot find a
# Java installation ... languageVersion=17".
export JAVA_HOME="$HOME/dev-tools/jdk-17.0.20+8/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

cd apps/mobile
flutter analyze
flutter build apk --debug          # build/app/outputs/flutter-apk/app-debug.apk
flutter run                        # onto a connected handset
```

Release builds, per-ABI (the fat APK is 87MB and worth nobody's data):

```sh
flutter build apk --release --split-per-abi
# build/app/outputs/flutter-apk/app-arm64-v8a-release.apk    (~32MB)
# build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk  (~24MB)
```

**If `flutter build apk` dies with a bare `25.0.2`**, it has picked up Android
Studio's bundled JBR — Java 25, which Gradle 8.12 cannot parse, and the
`IllegalArgumentException` surfaces as just the version string. It is not
your code: `cd android && ./gradlew assembleDebug` with `JAVA_HOME` set to the
dev-tools JDK 17 succeeds on the same tree. Fixed permanently with:

```sh
flutter config --jdk-dir="$HOME/dev-tools/jdk-17.0.20+8/Contents/Home"
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

- **Re-verify screen sharing on the 1.2 build.** It *has* run on a handset —
  that is where "it only shares the app, not the screen" came from. What is
  unverified is the fix. Check in this order: Android's dialog offers no
  "single app" option, the class sees the whole screen including other apps,
  the notification's Stop ends the share *and* the publishing participant, and
  leaving the call tears it down.
- Release signing. The release build is currently signed with the debug key,
  which is fine for sideloading and useless for the Play Store. Note this also
  pins the Google sign-in SHA-1 — **back up `~/.android/debug.keystore`.**
- Launcher icon: `flutter_launcher_icons` is configured in `pubspec.yaml`
  against `assets/images/logo.png`; run `dart run flutter_launcher_icons`.
- Push, end to end on a real handset (see above).
- Google sign-in inside the app (Custom Tabs), if it turns out to matter.
- **iOS — see the section at the bottom.** It is the next piece of work.

## Screen sharing

Added 2026-08-08, and run on a real handset the same day.

**What the handset showed: it shared the app, not the screen.** The first build
(`bd85e6a`) called `requestCapturePermission()` with no arguments, so Android
14's dialog offered "Share one app" — which is the default selection there —
and taking it captures only the Novice Tutor window. The class then watches the
call screen they are already sitting in. `fullScreenOnly: true` landed in
`535cccd` and removes that option; anyone still seeing app-only capture is on a
build older than 1.2.

Android's WebView has **no `getDisplayMedia`**. Not blocked, not behind a
permission — the API is absent, so the browser path the desktop call screen
uses cannot work in the app whatever is granted. Zoom and Teams capture with
MediaProjection, and so does this.

The shell **joins the same LiveKit room a second time** and publishes the
captured screen. Everyone else sees an ordinary screen share, because to
LiveKit that is exactly what it is — no special client handling, and the
existing "screen share wins the main view, cameras become floating tiles"
layout in `CustomVideoConference.tsx` applies unchanged.

```
web  CallControlBar ──► nativeScreenShare.ts ──► GET /api/sessions/[id]/screen-token
                                │                       (mints a publish-only token)
                                ▼  callHandler('startScreenShare', {url, token})
dart lib/shell/screen_share.dart
       1. Helper.requestCapturePermission(fullScreenOnly: true)
       2. MethodChannel -> ScreenShareService.start()   (foreground service)
       3. Room.connect() + setScreenShareEnabled(true)
```

Things that are the way they are for a reason:

- **The page mints the token, not Dart.** The Better Auth session cookie lives
  in the WebView; Dart's HTTP client is a different cookie jar entirely.
- **The token is publish-only** — `canSubscribe: false`, `canPublishData:
  false`, `roomAdmin: false`. The WebView beside it is already receiving the
  class, and decoding every participant twice on one phone is pure waste.
  Identity is `email#screen-xxxx`; the random suffix matters, because a
  teacher who stops and restarts must not collide with the connection LiveKit
  has not finished tearing down.
- **`fullScreenOnly: true`.** Android 14's capture dialog defaults to "Share
  one app". A teacher taking the default shares the Novice Tutor window, so
  the class watches the call screen they are already sitting in. This removes
  the option.
- **Ordering is Android's:** capture granted, *then* the foreground service,
  *then* the projection. Doing the projection before the service throws on
  Android 14+. The service (`ScreenShareService.kt`) is hand-written rather
  than pulling in `flutter_background`, which exists to run background Dart
  this app never needs.
- **And Dart waits for the service to actually be foreground.**
  `startForegroundService` returns as soon as the intent is queued, so the
  first version carried straight on to create the projection and could lose
  that race — a SecurityException, and a share that dies after the teacher has
  already agreed to the dialog. `ScreenShareService.onStarted` fires at the end
  of `startForeground`, MainActivity holds the method call open until then, and
  answers `false` after 4s (an Activity in the background cannot start a
  foreground service at all, and nothing reports that).
- **Picture-in-picture is suppressed while presenting.** Leaving the app is
  both the PiP trigger and the entire point of presenting. Shrinking the class
  into a floating window puts that window *in the capture*, so the students
  would watch a thumbnail of themselves pinned over the thing they were
  supposed to be looking at.
- **Tapping Present while already sharing restarts it.** Android's own cast
  chip can kill the projection with no callback flutter_webrtc listens for —
  the track stays published and the class watches a frozen screen. Treating a
  second tap as "already sharing, nothing to do" left no way out of that.
- **Failures come back with a reason** (`declined` / `serviceBlocked` /
  `connectFailed`), and the call screen shows a message above the control bar
  for the last two. Declining the prompt says nothing, because the teacher who
  declined it already knows.
- **The capability is advertised in the user agent**
  (`NoviceTutorApp/1.2 (screenshare)`), and the web button keys off that
  string — *not* off the JS bridge existing. Every build of the shell has a
  bridge, so an older install would otherwise show a button that silently did
  nothing. **Bump this marker whenever the bridge handlers change.** 1.2 is
  where `startScreenShare` began answering `{ok, reason}` instead of a bare
  bool; `nativeScreenShare.ts` still accepts the bool, so a 1.1 install keeps
  working.

Stopping works from four places, all of which converge on one shared store in
`nativeScreenShare.ts`: the control bar button, the `Live · sharing your
screen` pill over the call, the **Stop action on the ongoing notification**
(the only one reachable while presenting another app), and Android's own cast
control. The notification's Stop routes back through Dart rather than just
killing the service — the service can end itself, but Dart holds the room that
is publishing, and stopping one without the other leaves the class watching a
frozen screen from a participant nobody can see.

## Things that are not bugs

- **"Sign in with Google" opens the browser.** See above — a WebView is not
  allowed to show that page.
- **Back from the dashboard closes the app.** Deliberate, as of 2026-08-08.
  It used to go back to `/login`, which looked exactly like being signed out —
  signing in navigates with `window.location.href`, so the login page stayed
  in history. `/login` now redirects an authenticated visitor to the
  dashboard, and the shell clears history once past the auth pages.
- **Screen sharing is still absent on iOS**, and on phone *browsers*. It needs
  a broadcast extension on iOS; `getDisplayMedia` is missing in mobile
  browsers generally.

## iOS — runs in the simulator

**Started 2026-08-08.** `apps/mobile/ios` now exists, generated with
`flutter create --platforms=ios --org com.novicetutor .` and then adjusted; the
bundle identifier is **`com.novicetutor.app`**, matching the Android
`applicationId` so the same Firebase project and OAuth clients can be used.

The shape is not an open question. Same as Android: one WKWebView over
novicetutor.com plus push, for the same three reasons given at the top of this
document. `lib/shell/web_shell.dart` is ordinary cross-platform Dart, and the
platform differences it does have are now in it:

| Concern | Android | iOS |
| --- | --- | --- |
| User agent | `NoviceTutorApp/1.2 (screenshare)` | `NoviceTutorApp/1.2` |
| Screen sharing | native MediaProjection capture | not offered at all |
| Picture-in-picture | `MainActivity` over a method channel | none |
| Google sign-in | native picker | disabled until an iOS OAuth client exists |
| Camera/mic prompt | runtime permissions | same, plus Info.plist usage strings |
| Cookies | process-wide by default | `sharedCookiesEnabled: true`, or Accept/Decline sees no session |

The user-agent row is the important one. The call page decides whether to show
the Present button by matching `NoviceTutorApp/<ver> (screenshare)`
(`apps/web/src/components/video/nativeScreenShare.ts`), so an iOS build that
claimed the marker would render a button that cannot work. It omits it, and the
JS handlers are not registered there either.

### Getting it to build took three things, none of them code

All measured on 2026-08-08, in the order they blocked the build:

1. **CocoaPods was not installed** — `flutter build ios` ended with
   `CocoaPods not installed or not in valid state.` Installed via Homebrew
   (`brew install cocoapods`, 1.17.0; it brings its own Ruby, which matters
   because system Ruby is Apple's deprecated 2.6.10). Note that Homebrew's
   installer never added itself to the PATH — there was no `~/.zprofile` at
   all — so `brew` appeared "not found" while sitting in `/opt/homebrew/bin`.
   This step is unavoidable rather than a preference:
   **`flutter_inappwebview_ios` and `flutter_callkit_incoming` have no
   `Package.swift`**, so Swift Package Manager cannot cover the plugin set no
   matter what, and `flutter_inappwebview` *is* the app.
2. **`xcode-select` pointed at CommandLineTools**, so `xcodebuild` refused to
   run and Flutter could not read the bundle id — which it reports as the
   thoroughly misleading `Application not configured for iOS`. Fixed with
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
3. **The iOS 26.5 platform was missing.** Xcode 26.6 builds against SDK 26.5
   but the only simulator runtime present was 26.4, left over from an older
   Xcode, and Xcode then offers *no* eligible destination at all — not even a
   booted iPhone (`iOS 26.5 is not installed`). `xcodebuild -downloadPlatform
   iOS` fetched it: 8.52 GB.

And one setting that stays off:

- **Swift Package Manager is switched off deliberately** —
   `flutter config --no-enable-swift-package-manager`. With it on, resolution
   dies before CocoaPods is even reached:

   ```
   main/Package.swift:77: Fatal error: Failed to load configuration:
   fileNotFound(... /Quran%2520learning/... pubspec.yaml ...)
   ```

   That is `firebase_core`'s SwiftPM shim URL-encoding the repository path
   twice, because the checkout lives under `.../Phet/Quran learning/...` and
   **the path contains a space**. Moving the repository somewhere without a
   space would also fix it, but with two plugins lacking SwiftPM support there
   is nothing to gain by chasing it.

With all three done, `flutter build ios --simulator --no-codesign` succeeds
(~8 min cold, ~40s after that) and the app runs.

### What it does on a simulator, as of 2026-08-08

Verified, not assumed: the app installs, launches, and **renders
novicetutor.com inside the WebView** — right layout, no browser chrome, safe
areas respected. `Push disabled (no Firebase config)` is logged and the shell
carries on as a plain WebView, which is the degradation path working.

One thing to know before debugging a hang here. On the very first cold run the
page never appeared: `onLoadStart` fired and then **nothing** — no progress, no
error, no `onLoadStop`. It was not the app. The same build loaded normally on
the next run, Safari on the same simulator loaded the site throughout, and the
origin answered every user agent with a 200 in under 0.4s; WebKit's log showed
a connection stalling (`flow stall timeout - connection not complete in
2000ms`) after trying QUIC. A transient stall, in other words — but it exposed
a real gap, since a *stalled* load calls no callback at all while a *failed*
one lands on the offline screen. `web_shell.dart` now runs a 20s stall timer
for exactly that case.

Not testable here, and waiting on a device or on Apple: own-camera video and
the background effects (**the simulator has a microphone but no camera** —
probed: zero `videoinput`, and bare `{video: true}` fails
`OverconstrainedError`), push, the incoming-call ring, and screen sharing.

### What was set up, and why each bit is there

- **Info.plist** — `NSCameraUsageDescription` and
  `NSMicrophoneUsageDescription` (iOS *terminates* an app that reaches
  AVCaptureDevice without them; it does not merely deny). `UIBackgroundModes`
  = `audio`, `remote-notification`, `voip` so a lesson survives a locked
  screen. `ITSAppUsesNonExemptEncryption = false` to skip the export
  questionnaire on every upload.
- **Podfile** — `platform :ios, '13.0'`, which is a floor and not a taste:
  `livekit_client`, `flutter_webrtc` and `firebase_core` all declare
  `ios.deployment_target 13.0`. The `post_install` hook also switches
  `permission_handler`'s permissions down to camera, microphone and
  notifications; it compiles all of them by default, and each one it compiles
  is a usage string App Review will ask about.
- **Icons** — `dart run flutter_launcher_icons` with `remove_alpha_ios: true`
  and `background_color_ios: "#0A0A0A"`. iOS icons may not carry an alpha
  channel; App Store Connect rejects the *upload*, not the review. Note that
  the tool always regenerates Android icons too, and the version now in use
  produces different output from the one that made the shipped ones — revert
  the `android/app/src/main/res` churn unless you mean it.
- **`analysis_options.yaml`** — `build/**` excluded. iOS builds check plugin
  sources out under `build/ios/SourcePackages`, examples included, and
  `flutter analyze` was reporting 50 errors from LiveKit's example app.

### Server side: iOS takes a different message

`src/lib/fcm.ts` now branches on `device_tokens.platform`, which is why the app
registers itself as `ios` (`PushService.syncToken`).

The ring is the interesting case. **iOS cannot be rung the Android way.** A
ringing phone means CallKit, CallKit means a PushKit VoIP push, and FCM cannot
send VoIP pushes at all — they go to APNs directly, with their own certificate.
A silent data-only push is not a substitute: iOS throttles background pushes
and will not deliver one to a terminated app on any schedule a waiting teacher
would accept. So iOS gets the honest degraded version — a loud
`time-sensitive` alert naming the caller, which opens straight into the call
when tapped (`?answer=1`, the same place Accept lands on Android) — and the
call data rides along so that wiring PushKit later changes the transport and
nothing else. `sendCallEndedPush` on iOS is a silent `background` push whose
only job is to clear the notification if the app happens to be running.

None of this can be tested until there is an APNs key, which needs the paid
account.

### How far you get without paying Apple

The plan is to test at home first and buy the developer account later — the
same order Android went in. That works, and most of the app is reachable for
free. Measured on the build Mac, not assumed:

**The simulator has a microphone and no camera.** A probe page calling
`enumerateDevices()` in Simulator Safari (iPhone 17, Xcode 26.6) reports one
device — `audioinput` — and **zero video inputs**; a bare `{video: true}` fails
with `OverconstrainedError`, so this is an absent camera rather than a
constraint that could be relaxed. iOS did prompt for the microphone, so the
Mac's mic passes through. The simulator therefore covers the shell, login,
layout, navigation, audio, and joining a class — but not your own video, and so
not the background effects.

**A real iPhone on a free Apple ID covers the rest.** Xcode will sign with a
"Personal Team" at no cost, and camera and microphone both work, so the whole
call screen can be exercised. Two limits: the provisioning profile **expires
after 7 days**, and Push Notifications, App Groups and Associated Domains are
paid-only capabilities.

So before spending anything you can test everything except push, the
incoming-call ring (needs VoIP push), screen sharing (its broadcast extension
needs an App Group), and universal links.

One thing that is *not* a testing route, despite sounding like one: Apple
Silicon Macs can run iPhone apps, but only App Store builds whose developer
opted in. It needs a published app, so it is no help here.

### Toolchain on the build Mac, checked 2026-08-08

Xcode 26.6 and the simulators work. **CocoaPods is not installed and there is
no Homebrew**, so Flutter cannot build iOS plugins yet — and system Ruby is
Apple's deprecated 2.6.10, which newer CocoaPods dependencies refuse. Install
Homebrew and then `brew install cocoapods` (it brings its own Ruby); the
`sudo gem install` route needs `activesupport` pinned to 6.1.7.6 first.
`flutter doctor` flags this and nothing else.

Then, from `apps/mobile`:

```sh
export PATH="$HOME/dev-tools/flutter/bin:$PATH"
flutter build ios --simulator --no-codesign   # first run does pod install
open -a Simulator
flutter run -d <simulator id>
```

### Order of work

Free things first, so the app can be seen working before the account is bought.

1. ~~`flutter create --platforms=ios .`, Info.plist usage strings.~~ **Done
   2026-08-08.**
2. ~~Simulator: shell loads, layout is right.~~ **Done 2026-08-08.** Still to
   do on the simulator: sign in, then join a class and confirm audio.
3. A real iPhone on a free Personal Team: the full call screen, camera,
   background effects. Re-sign weekly.
4. **Apple Developer Program, $99/year** — everything below needs it.
5. **Push.** An APNs key plus an iOS app in the Firebase project
   (`fir-auth-d4f03`), which yields `GoogleService-Info.plist` (gitignored,
   like `google-services.json`). Nothing on the Android device side carries
   over; the server payloads are already iOS-shaped — see above.
6. **The incoming-call ring.** Optional, and only if the alert fallback proves
   too weak: `flutter_callkit_incoming` on iOS means CallKit plus **PushKit
   VoIP pushes**, which FCM cannot send, so it means talking to APNs directly
   as well as a separate certificate. Apple also enforces that a VoIP push
   actually reports a call. Stricter than Android's full-screen intent.
   The Dart side already passes `IOSParams`.
7. **Google sign-in.** Needs an **iOS OAuth client** in the Google Cloud
   project (free — it is not an Apple capability, so it can be done at any
   point). Two things then have to agree: build with
   `--dart-define=GOOGLE_IOS_CLIENT_ID=<client id>`, and add the *reversed*
   client id to Info.plist as a `CFBundleURLTypes` scheme, or the callback
   never reaches the app. Until both exist the shell does not intercept
   Google's pages at all and tells the user to sign in with a password —
   intercepting without a client id would replace Google's error page with a
   spinner that never resolves. The audience of the ID token stays the *web*
   client, as on Android.
8. **Screen sharing.** WKWebView has no `getDisplayMedia`, same as Android, and
   iOS has no MediaProjection to fall back on. It needs a **Broadcast Upload
   Extension**: a second binary in the bundle, talking to the app through an
   App Group — **which is paid-only, so it cannot be prototyped for free**.
   `livekit_client` supports it via
   `ScreenShareCaptureOptions(useiOSBroadcastExtension: true)`. Expect it to be
   larger than the Android equivalent, which took two sessions.

### Carry these over from Android

- **Advertise the capability in the user agent**, and key the web app's
  buttons off that string — not off the JS bridge existing. Every build has a
  bridge; that is how you ship a button that does nothing.
- **The page mints LiveKit tokens, not Dart.** The session cookie lives in the
  WebView, and Dart's HTTP client is a different cookie jar.
- A green build says nothing about how it renders on a device.
