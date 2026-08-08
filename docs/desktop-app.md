# Desktop app (Windows and macOS)

> **Parked 2026-08-08, the day it was written.** The audience is phones —
> iOS and Android — and desktop users get the website. Nothing here is
> abandoned or broken: it builds and runs on both platforms, and the
> reasoning below is worth keeping. But **it is not being shipped, so do
> not sink time into it** (auto-update, signing, the tray-unload memory
> work) unless the decision changes. `apps/desktop` stays in the tree for
> the day it does.

Added 2026-08-08. `apps/desktop` — an Electron shell around novicetutor.com,
the same bet as the Android app: the web app already has every screen, and the
shell only does what a browser tab cannot.

One codebase, both platforms. The macOS build is a universal binary (Intel and
Apple Silicon in one bundle) shipped as a `.dmg`; Windows is an NSIS installer.
The platform differences are small and all of them are marked in the code:
system audio on screen share is Windows-only, the tray's start-at-login entry
is hidden on macOS (login items belong in System Settings), and screen
recording needs a permission on macOS that Windows does not have.

## Why Electron and not Tauri

This came up explicitly, and the objection was a fair one: Teams Classic was
Electron and idled at the better part of a gigabyte, and Microsoft rewrote new
Teams (2023) on **WebView2** citing roughly half the memory. Zoom, for its
part, is native C++ and cheaper than either.

Two things decided it anyway.

**The Zoom↔Teams gap is native-vs-web, not Rust-vs-Node.** Zoom is cheap
because it owns its video pipeline down to hardware decode. Tauri would not
have moved us any closer to that: the call screen is still a web page running
WebRTC, MediaPipe segmentation and the WebGL compositor in
`components/video/segmentation`. In a real class those dominate, and the shell
is roughly a constant on top of them.

**We could not have tested it.** Tauri renders through WebView2 on Windows and
WKWebView on macOS — two engines, neither of them the Chrome the call screen
and the background pipeline were built against. Everything verified on this
machine would have said nothing about a Windows box. Electron ships one
Chromium everywhere, so a check here holds there. Given this project's history
of "worked in Chrome, wrong on the device", that was worth 120MB.

**What it costs, measured.** With the window open and idle on macOS,
`app.getAppMetrics()` reports **~450 MB** across four processes (browser 150,
GPU 100, network 57, renderer 140). That is a real number and it is not a
flattering one. Two caveats: macOS Electron is consistently heavier than
Windows, and hiding the window saves little because only the renderer throttles
— every other process stays resident. **If this needs to come down, the lever
is destroying the renderer while in the tray**, which the design already allows
for: the ring poll lives in the main process precisely so it survives a window
that isn't there. That drops the ~140MB renderer at the cost of a reload when
the window is reopened. Not built; measure on Windows first.

Run with `NT_METRICS=1` to print the breakdown every ten seconds.

## Layout

```
apps/desktop/
  src/main/index.ts        entry: single instance, deep links, the IPC bridge
  src/main/window.ts       the main window, navigation policy, wake lock
  src/main/screenShare.ts  getDisplayMedia handler + the picker
  src/main/ring.ts         incoming calls, including while in the tray
  src/main/tray.ts         tray icon, start-with-Windows
  src/main/metrics.ts      NT_METRICS=1 memory reporting
  src/preload/             contextBridge APIs (index / picker / ring)
  src/renderer/            picker.html and ring.html, plain HTML+JS
  resources/               icons, rendered from apps/web/public/logo.svg
  entitlements.mac.plist   hardened-runtime entitlements, for notarising
  electron-builder.yml     packaging for both platforms
```

## What the shell adds

**A screen picker with thumbnails.** Nothing in the web app changed:
`navigator.mediaDevices.getDisplayMedia` exists in Electron, so `CallControlBar`
takes the ordinary browser path and LiveKit publishes the track exactly as it
does in Chrome. `setDisplayMediaRequestHandler` only replaces the chooser in
between, because Chromium's built-in one inside an Electron app is a list with
no previews and "I shared the wrong window" is unrecoverable. Cancelling
rejects with `AbortError`, which is what Chrome does, so the Present button
flips itself back with no special handling. System audio is offered on Windows
only — macOS cannot do loopback without a kernel extension, and asking for it
there fails the whole request rather than degrading.

**A ring that works while minimised.** `IncomingCallOverlay` polls
`/api/calls/incoming`, and deliberately **stops when `document.hidden`** — a
backgrounded tab has no audio and nobody looking at it, and that standing load
is what took the worker down in August (`worker-limits.md`). Neither of those
holds for a tray-resident app. So the poll moves to the main process whenever
the window is hidden or minimised, and stands down the moment it is visible
again; the two never poll at once. Cookies come from the shared session, so it
is the same authenticated request the page makes. Answering in either place
silences the other, via `desktopCallHandled` on the page side.

**Tray, close-to-hide, start with Windows.** Closing the window hides it, which
is what makes the tray mean anything. Launched at login it comes up hidden —
`--hidden` in the login-item args.

**Native notifications** for class-started and new-message, driven from the
page's existing poll. Deduped per notification id: the poll returns the same
unread row every 20s until it is acted on, and a toast per poll is how an app
gets muted for good.

**A wake lock that survives minimising.** The web app's `navigator.wakeLock` is
released the moment the window is backgrounded. A minimised class is still a
class, so `LiveKitRoom` also tells the shell, which holds a `powerSaveBlocker`.

## The bridge

`window.noviceTutorDesktop`, exposed through `contextBridge` — see
`apps/web/src/lib/desktop.ts` for the web-side wrapper, whose calls are all
no-ops in a browser so nothing has to branch on platform.

The user agent carries `NoviceTutorDesktop/1.0`. As with the Android shell,
**features key off the version marker, not off the bridge existing** — every
build has a bridge, and that is how you ship a button that does nothing.

## Building

Each platform builds on itself. Cross-building the Windows installer from
macOS needs wine, which is not installed here.

```sh
cd apps/desktop
npm install

npm run dist:win     # -> release/Novice Tutor Setup <version>.exe   (on Windows)
npm run dist:mac     # -> release/Novice Tutor-<version>-universal.dmg
npm run dist:dir     # unpackaged, for a quick check
```

Windows is NSIS, per-user (no admin prompt), with a directory choice. macOS is
a universal `.dmg` plus a `.zip`.

**`electron` must be pinned to an exact version** in `package.json`:
electron-builder resolves the binary itself, refuses a range, and in this
hoisted monorepo cannot fall back to reading `node_modules` either.

`dist:mac` and `dist:dir` force `CSC_IDENTITY_AUTO_DISCOVERY=false`. Without
it electron-builder finds whatever identity is in the local keychain and signs
with it — on this machine an *Apple Development* certificate, which is for
running on your own hardware and is not distributable. An unsigned build is
the honest artefact for testing.

## Signing, and the warning users see

Neither platform trusts an unsigned app, and each complains differently.

### Windows — the blue "Windows protected your PC" page

That is **SmartScreen**, not a blue screen of death; the app is fine, Windows
just has no idea who published it. It goes away by signing the installer with
an Authenticode certificate — and, importantly, by that certificate building
up reputation.

Since June 2023 the private key for any publicly trusted code-signing
certificate must live on FIPS 140-2 Level 2 hardware. **A `.pfx` file on disk
is no longer an option.** Three routes, cheapest first:

- **Azure Trusted Signing** — Microsoft's own service, roughly $10/month, no
  hardware token to post around because the key lives in their HSM. Identity
  has to be validated, and organisations have historically needed to have
  existed for three years; individual accounts also exist. electron-builder
  supports it directly — uncomment `win.azureSignOptions` in
  `electron-builder.yml` and set the `AZURE_*` credentials. This is the route
  to try first.
- **An OV certificate** (Sectigo, Certum, SSL.com), roughly $200–400/year on a
  USB token or cloud HSM. Signs fine, but SmartScreen reputation is earned per
  certificate over downloads and time, so **early users still see the warning**.
- **An EV certificate**, roughly $400–700/year. The one that buys immediate
  SmartScreen reputation — no warning from the first download. If the warning
  is the actual problem, this is what solves it outright.

With a token or HSM configured, set `CSC_LINK` and `CSC_KEY_PASSWORD` and
electron-builder signs during `dist:win`.

Verify the numbers before buying: prices and the identity rules move.

### macOS — "Apple could not verify this app is free of malware"

Gatekeeper. The fix is two steps, not one, and both need an **Apple Developer
Program membership at $99/year**:

1. **Sign** with a *Developer ID Application* certificate. Note this is not the
   *Apple Development* certificate that comes free with an Apple ID — that one
   only runs on your own machines, and it is what the local keychain here
   already holds.
2. **Notarise**: upload the signed app to Apple's notary service, which scans
   it and issues a ticket, then staple the ticket to the `.dmg` so it validates
   offline.

Once the certificate is in the keychain:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run dist:mac:signed
```

The app is already prepared for this and it is the part that is easy to get
wrong: `hardenedRuntime` is on (notarisation rejects builds without it), and
`entitlements.mac.plist` asks back for the camera, the microphone, and
V8's JIT. Miss the JIT entitlements and a signed build crashes on launch;
miss the media ones and the call screen's buttons look dead, because the
permission request fails without ever prompting.

Until it is signed, users can still open it — right-click the app, choose
Open, then Open again — but nobody should be told to do that routinely.

## Running it locally

```sh
cd apps/desktop
npm start                       # against novicetutor.com
NT_APP_URL=http://localhost:3005 npm start
NT_METRICS=1 npm start          # memory breakdown every 10s
NT_DEMO_RING=1 npm start        # fake incoming call after 3s
```

`NT_DEMO_RING` exists because the ring window is otherwise the one screen
nobody can iterate on — seeing it requires someone to actually call you.

To drive it headlessly, launch with `--remote-debugging-port=9222` and attach
puppeteer. Connect via the websocket from `/json/version`, not `browserURL`:
the latter will happily attach to a dying previous instance still holding the
port and report no windows.

## Not built

- **Auto-update.** electron-updater against a generic feed would work, and R2
  already serves the APKs, so the hosting is solved. Updating is manual today.
- **Code signing on either platform** — see above for what it costs and which
  certificate actually removes the SmartScreen warning.
- **Screen recording permission on macOS is prompted for but not testable
  here.** The app detects the refusal and opens the right settings pane; it
  has not been exercised on a Mac that had the permission switched off.
- **A custom title bar.** The OS frame is kept — the web app has its own header
  and a frameless window would mean rebuilding window controls.
