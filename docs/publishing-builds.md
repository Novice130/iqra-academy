# Publishing app builds

Every installable build — the Android APK, the Windows installer, the macOS
disk image — is served from one directory on the server and copied there by
hand.
Nothing publishes itself, and **no build is ever committed to git**.

Read this before publishing anything. The Windows section is the one that has
to happen on the Windows machine; everything else is done from the Mac.

## How it fits together

| Piece | Where |
| --- | --- |
| Directory | `/opt/novicetutor/downloads` on the VPS |
| Mount | read-only at `/data/downloads` in the `web` container (`APP_DOWNLOADS_DIR`), declared in `deploy/docker-compose.yml` |
| Route | `apps/web/src/app/api/app-download/[file]/route.ts` — streams the file |
| Page | `apps/web/src/app/app/download/page.tsx` — novicetutor.com/app/download |
| Key list | `apps/web/src/lib/app-downloads.ts` |

The keys the route will serve, and nothing else:

| Platform | Filename |
| --- | --- |
| Android, 64-bit | `novice-tutor.apk` |
| Android, 32-bit | `novice-tutor-arm32.apk` |
| Windows | `novice-tutor-setup.exe` |
| macOS | `novice-tutor.dmg` |

**Copying is enough. There is no deploy step.** The download page checks the
directory on every request, so a platform's row appears — with the real file
size — the moment the copy finishes. A platform with no file there shows "Not
published yet" instead of a broken link.

Copying needs SSH access to the server as `deploy` — your public key in
`/home/deploy/.ssh/authorized_keys`. `<server-ip>` below is the VPS address.
Copy to a temporary name and rename, so nobody downloads half a file:

```sh
scp <local-file> deploy@<server-ip>:/opt/novicetutor/downloads/<filename>.part
ssh deploy@<server-ip> 'cd /opt/novicetutor/downloads && chmod 644 <filename>.part && mv <filename>.part <filename>'
```

The shorter one-line `scp` commands further down are fine for a first publish;
use the two-step form when replacing a build that people are downloading.

**iOS is not in this table and never will be.** An APK is a file we host; an
iOS build can only reach a phone through Apple, so it has its own path
entirely — `docs/ios-release.md`. Nothing about the downloads directory applies to it.

Two rules that are not optional:

- **Never commit a build.** `apps/desktop/release/`, `apps/desktop/dist/` and
  the Flutter build output are all gitignored. Pushing from a machine that
  built an installer pushes the *source*, not the installer — this has already
  caused confusion once.
- **Never put a build in `apps/web/public/`.** Everything in `public/` is baked
  into the Docker image, so a 216 MB disk image there would be pulled by the
  server on every deploy. The `.dockerignore` excludes `public/app/` for that
  reason.

---

## Building Windows on the Mac instead

Possible as of 2026-08-09, and worth knowing what it costs first:

```sh
brew install --cask wine-stable          # Intel binary
softwareupdate --install-rosetta --agree-to-license
xattr -dr com.apple.quarantine "/Applications/Wine Stable.app"
```

All three are needed, and the third one is the trap. Homebrew 6 **removed the
`--no-quarantine` flag**, so the cask now installs quarantined and macOS
refuses to run it — the dialog says "Apple could not verify Wine Stable is free
of malware" and offers only *Move to Trash* or *Done*. Wine itself fails first
with a misleading `wine: __wine_main function not found in ntdll.so` and
`Virtual memory exhausted`, which looks like a broken build and is not.
Clearing the attribute fixes both; `wine --version` should then print `wine-11.0`.

Rosetta is unavoidable regardless of Wine's own architecture. Wine translates
Windows *API calls*, not CPU instructions — the name is literally "Wine Is Not
an Emulator" — and the installer build runs x86 Windows tools (`makensis.exe`,
`rcedit.exe`). A native arm64 Wine would still need Rosetta for those. Note
also that Rosetta is, in Apple's own words, very difficult to remove.

Then `npm run dist:win` from `apps/desktop` as below, and copy it up with the
same `scp` command.

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

### 3. Set up SSH access, once per machine

Windows 10 and 11 ship `ssh` and `scp`. Create a key if the machine has none,
and have its public half added to the server's `deploy` user:

```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Send that one line to whoever administers the server. Check it took:

```powershell
ssh deploy@<server-ip> "ls /opt/novicetutor/downloads"
```

### 4. Upload

One line. Note the quotes — the filename has spaces in it:

```powershell
scp "apps\desktop\release\Novice Tutor Setup 1.0.0.exe" deploy@<server-ip>:/opt/novicetutor/downloads/novice-tutor-setup.exe
```

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
scp apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk \
  deploy@<server-ip>:/opt/novicetutor/downloads/novice-tutor.apk
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
scp "apps/desktop/release/Novice Tutor-1.0.0-universal.dmg" \
  deploy@<server-ip>:/opt/novicetutor/downloads/novice-tutor.dmg
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
directory be fetched.
