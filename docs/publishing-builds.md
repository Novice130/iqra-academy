# Publishing app builds

Every installable build — the Android APK, the Windows installer, the macOS
disk image — is served from one Cloudflare R2 bucket and uploaded by hand.
Nothing publishes itself, and **no build is ever committed to git**.

Read this before publishing anything. The Windows section is the one that has
to happen on the Windows machine; everything else is done from the Mac.

## How it fits together

| Piece | Where |
| --- | --- |
| Bucket | `novicetutor-app` (Cloudflare account `syedamer130@gmail.com`) |
| Binding | `APP_DOWNLOADS`, declared in `apps/web/wrangler.json` |
| Route | `apps/web/src/app/api/app-download/[file]/route.ts` — streams the object |
| Page | `apps/web/src/app/app/download/page.tsx` — novicetutor.com/app/download |
| Key list | `apps/web/src/lib/app-downloads.ts` |

The keys the route will serve, and nothing else:

| Platform | Object key |
| --- | --- |
| Android, 64-bit | `novice-tutor.apk` |
| Android, 32-bit | `novice-tutor-arm32.apk` |
| Windows | `novice-tutor-setup.exe` |
| macOS | `novice-tutor.dmg` |

**Uploading is enough. There is no deploy step.** The download page asks R2
what exists on every request, so a platform's row appears — with the real file
size — the moment the upload finishes. A platform with no object in the bucket
shows "Not published yet" instead of a broken link.

Two rules that are not optional:

- **Never commit a build.** `apps/desktop/release/`, `apps/desktop/dist/` and
  the Flutter build output are all gitignored. Pushing from a machine that
  built an installer pushes the *source*, not the installer — this has already
  caused confusion once.
- **Never put a build in `apps/web/public/`.** A single Workers static asset is
  capped at 25 MiB and the arm64 APK is 32 MB. It does not fail politely: the
  whole deploy dies with `Error: Asset too large.` That is why R2 exists here.

---

## Windows — from the Windows machine

Everything below runs on the Windows laptop, in PowerShell, from the repo root.

### 1. Get the current code

```powershell
git checkout fix/worker-oom-and-android-screenshare
git pull
```

Worth doing even if the machine built it before: the call screen was redesigned
on 2026-08-08, and a build from before that ships the old one.

### 2. Build the installer

```powershell
cd apps\desktop
npm install
npm run dist:win
```

The output lands in `apps\desktop\release\`, named from `productName` and the
version in `apps/desktop/package.json`:

```
apps\desktop\release\Novice Tutor Setup 1.0.0.exe
```

`dist:win` builds x64 NSIS only — a real installer that asks where to install
and needs no admin rights (`perMachine: false`). See
[desktop-app.md](desktop-app.md) for why.

### 3. Sign in to Cloudflare, once per machine

```powershell
npx wrangler login
```

Opens a browser. Sign in as **syedamer130@gmail.com** and approve. The token is
stored per user account, so this is once per Windows machine, not once per
upload. Check it took:

```powershell
npx wrangler whoami
```

### 4. Upload

One line. Note the quotes — the filename has spaces in it:

```powershell
npx wrangler r2 object put novicetutor-app/novice-tutor-setup.exe --file "apps\desktop\release\Novice Tutor Setup 1.0.0.exe" --content-type application/vnd.microsoft.portable-executable --remote
```

**`--remote` is the flag that matters.** Without it wrangler writes to a
*local simulated bucket* on your disk and prints "Upload complete" exactly as
if it had worked. Nothing reaches Cloudflare. If an upload seems to have
succeeded but the site does not show it, this is why.

### 5. Check it actually landed

```powershell
curl.exe -I https://novicetutor.com/api/app-download/novice-tutor-setup.exe
```

Expect `HTTP/2 200`, a `content-length` matching the file, and
`content-type: application/vnd.microsoft.portable-executable`. Then load
https://novicetutor.com/app/download — the Windows row should show the size.

### What users will see

The installer is **unsigned**, so Windows shows a blue "Windows protected your
PC" page on first run: **More info → Run anyway**. That is expected, not a
failure, and [desktop-app.md](desktop-app.md#signing-and-the-warning-users-see)
covers what signing would cost to remove it.

---

## Android — from the Mac

```sh
export PATH="$HOME/dev-tools/flutter/bin:$PATH"
cd apps/mobile
flutter build apk --release --split-per-abi

cd ../..
npx wrangler r2 object put novicetutor-app/novice-tutor.apk \
  --file apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk \
  --content-type application/vnd.android.package-archive --remote
```

The 32-bit build (`app-armeabi-v7a-release.apk`) goes to
`novice-tutor-arm32.apk` the same way, and only matters for very old handsets.

Bump `ANDROID_VERSION` in `apps/web/src/app/app/download/page.tsx` when the app
version changes — that string is displayed, not derived.

## macOS — from the Mac

```sh
eval "$(/opt/homebrew/bin/brew shellenv)"
cd apps/desktop
npm install
npm run dist:mac

cd ../..
npx wrangler r2 object put novicetutor-app/novice-tutor.dmg \
  --file "apps/desktop/release/Novice Tutor-1.0.0-universal.dmg" \
  --content-type application/x-apple-diskimage --remote
```

Universal (Apple Silicon + Intel), which is why it is ~216 MB. The build is
unsigned and unnotarised, so first launch needs right-click → Open.

## iOS

There is nothing to publish. Apple only installs apps through the App Store —
a hosted `.ipa` cannot be installed from a link, so the download page tells
iPhone users to use Safari and add the site to their Home Screen. See
[mobile-app.md](mobile-app.md) for the App Store path.

---

## Adding a new platform or filename

Both of these, or the route returns 404:

1. Add the key to `ALLOWED_DOWNLOADS` in `apps/web/src/lib/app-downloads.ts`.
2. Add its extension to `DOWNLOAD_CONTENT_TYPES` in the same file, or it goes
   out as `application/octet-stream`.

Then add a row to the download page. The list is deliberately a closed set: the
filename is a URL path segment, and an open one would let anything in the
bucket be fetched.
