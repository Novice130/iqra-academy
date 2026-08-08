# Desktop app (Windows)

Added 2026-08-08. `apps/desktop` — an Electron shell around novicetutor.com,
the same bet as the Android app: the web app already has every screen, and the
shell only does what a browser tab cannot.

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

## Building the installer

Requires a Windows machine; there is no wine on the Mac this was written on.

```sh
cd apps/desktop
npm install
npm run dist:win     # -> apps/desktop/release/Novice Tutor Setup <version>.exe
```

NSIS, per-user (no admin prompt), with a directory choice. **Unsigned** —
SmartScreen will warn on first run until there is a code-signing certificate,
the same position the Android APK is in with its debug key.

`npm run dist:dir` packages without an installer, for a quick check.
**`electron` must be pinned to an exact version** in `package.json`:
electron-builder resolves the binary itself and refuses a range, which in this
hoisted monorepo it cannot resolve from `node_modules` either.

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
- **Code signing**, hence the SmartScreen warning.
- **macOS as a shipped target.** The build config produces an unpackaged `.app`
  for testing only; it is signed with a local development identity and not
  notarised, so it will not open cleanly on anyone else's Mac.
- **A custom title bar.** The OS frame is kept — the web app has its own header
  and a frameless window would mean rebuilding window controls.
