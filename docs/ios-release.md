# Publishing the iOS app

Everything between a build that runs in the simulator and a build a family can
install. The simulator part is done (2026-08-09, see `docs/mobile-app.md` §
iOS); none of the rest can be finished without an Apple account, so this
splits into **what the repo now does for you** and **what only a human with
the account can do**.

Android's equivalent is `docs/publishing-builds.md` — and note the difference:
an APK is a file we host in R2 ourselves, an iOS build can only be installed
through Apple. There is no "put the .ipa on the download page" option.

## What is already in the repo

| Piece | Where | Notes |
| --- | --- | --- |
| Bundle id | `com.novicetutor.app` | in `project.pbxproj`, matches Android |
| Team | `TT3HQ774N4` | already set for all three build configs |
| Usage strings | `ios/Runner/Info.plist` | camera, mic, background modes, `ITSAppUsesNonExemptEncryption` |
| Export options | `ios/ExportOptions.plist` | App Store method, automatic signing |
| Build + upload | `scripts/ios-release.sh` | version from pubspec, build number from git |
| Account deletion | `/dashboard/settings` | required by 5.1.1(v) — see below |

```sh
cd apps/mobile
./scripts/ios-release.sh              # build, then upload if the API key is set
./scripts/ios-release.sh --no-upload  # just produce the .ipa
./scripts/ios-release.sh --validate   # build + Apple's checks, no upload
```

The build number is `git rev-list --count HEAD`, which only ever goes up and
points at the exact commit a build came from. Apple rejects a build number it
has seen before for the same version, so **never** set it by hand unless you
are re-uploading after a rejection (`BUILD_NUMBER=… ./scripts/ios-release.sh`).

## What only you can do

### 1. Apple Developer Program — $99/year

developer.apple.com/programs. Enrol as an **individual** unless the school is
a registered company; an organisation enrolment needs a D-U-N-S number and
takes weeks. Everything below is blocked until this clears (usually 24–48h).

### 2. The app record in App Store Connect

appstoreconnect.apple.com → Apps → **+** → New App.

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | Novice Tutor |
| Primary language | English (U.S.) |
| Bundle ID | `com.novicetutor.app` — register it under Certificates, Identifiers & Profiles first |
| SKU | `novicetutor-ios` (internal only, never shown) |
| User access | Full |

Register the identifier **with Push Notifications enabled**, or the entitlement
that `UIBackgroundModes` already promises will not exist and the upload is
rejected.

### 3. An App Store Connect API key

Users and Access → Integrations → App Store Connect API → **+**.
Role: **App Manager**. Download the `.p8` — Apple shows it once.

```sh
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
```

That directory is one of the four places `altool` looks, which is why the
script insists on it rather than taking a path. Then, in your shell profile:

```sh
export APP_STORE_CONNECT_KEY_ID=XXXXXXXXXX
export APP_STORE_CONNECT_ISSUER_ID=<the UUID on the same page>
```

**The `.p8` is a credential.** It is not in the repo, `*.p8` is gitignored, and
anyone holding it can ship builds as you.

### 4. Push, for real

An **APNs key** (Certificates, Identifiers & Profiles → Keys → Apple Push
Notifications service), uploaded into the Firebase project `fir-auth-d4f03`,
plus an iOS app registered there. That yields `GoogleService-Info.plist` →
`apps/mobile/ios/Runner/`, gitignored exactly like `google-services.json`.

The server payloads are already iOS-shaped; nothing in `apps/web` changes.
Without this file the app builds and runs, and never receives a notification —
the script warns rather than stopping, because a TestFlight build with no push
is still worth testing.

### 5. TestFlight

The upload appears under TestFlight after 5–30 minutes of processing.

- **Internal testers** (up to 100, must be in your App Store Connect team):
  no review, available immediately.
- **External testers**: a Beta App Review first, usually a day. This is where
  a WebView shell gets its first real judgement, so read the next section
  before submitting.

### 6. App Review, and the three guidelines that actually bite

**4.2 Minimum Functionality** is the real risk. The app is a WKWebView around
novicetutor.com, and Apple rejects "a repackaged website". What makes this one
defensible is native behaviour the website cannot have, and it has to be
working in the build you submit — not planned:

- push notifications (§4 above), including the class-starting alert
- native Google sign-in (`docs/mobile-app.md` § iOS, item 7)
- camera and microphone in a live class, with the OS permission prompts
- background audio, so a locked screen does not drop the lesson

Submitting without push is submitting the weakest possible version of the
argument.

**3.1.1 In-App Purchase.** The app shows no prices and sells nothing — see
`apps/web/src/lib/pricing-visibility.ts`, which is written for exactly this.
Fees are agreed and invoiced outside the app (`/admin/invoices`). One-to-one
tutoring is additionally exempt under 3.1.3(d) "Person-to-Person Experiences",
but group classes are one-to-many and are not, which is why showing nothing
anywhere is the position rather than showing prices to some people.

**5.1.1(v) Account deletion.** An app that creates accounts must let a person
delete theirs from inside the app. This is now built:
`apps/web/src/app/api/me/account/route.ts` and the card on
`/dashboard/settings`. It cancels upcoming classes, anonymises the account and
the children's profiles, and tells the school. Reviewers do check it, and they
check it with the demo account below.

### 7. What the reviewer needs from you

In App Review Information:

- **Demo account** — a real student login with a class booked in the future,
  or the reviewer sees an empty dashboard and calls it non-functional. Make a
  fresh one; do not hand over an account from `docs/test-accounts.md` that
  somebody is teaching with.
- **Notes** — say plainly: religious education for children, classes are
  arranged and paid for outside the app, no purchasable content exists, the
  camera and microphone are used only during a live class and nothing is
  recorded unless the teacher turns recording on.
- **Age rating** — the questionnaire's "Infrequent/Mild Religious or Cultural
  References" applies. Answer honestly; a wrong rating is a re-review.

### 8. Privacy nutrition labels

Declared per data type, and they must match what the app really does:

| Type | Collected | Linked to identity | Used for tracking |
| --- | --- | --- | --- |
| Name, email address | Yes | Yes | No |
| Phone number | Optional | Yes | No |
| Coarse location | No | — | — |
| Camera, microphone | Used in-session, not collected | — | — |
| Usage data / diagnostics | Yes (attendance, crash logs) | Yes | No |

**No tracking.** The app has no advertising SDK and no third-party analytics,
so App Tracking Transparency does not apply and `NSUserTrackingUsageDescription`
must stay out of Info.plist — adding it triggers a prompt for a permission
nothing asks for.

A privacy policy URL is mandatory. It has to be a real, reachable page.

## If somebody else is driving the build

They need two strings from you, and **not** the `.p8` — that file is a
credential, and anyone holding it can ship builds as you:

- `APP_STORE_CONNECT_KEY_ID` — the ten characters in the key's name
- `APP_STORE_CONNECT_ISSUER_ID` — the UUID at the top of the same page

The key file itself stays on the Mac that builds, at
`~/.appstoreconnect/private_keys/`, and never enters the repo.

## Order to do it in

1. Enrol (§1). Everything waits on this.
2. Register the identifier with push, create the app record (§2).
3. API key (§3), then `./scripts/ios-release.sh --validate` — this proves
   signing works before you care whether the build is any good.
4. APNs key and `GoogleService-Info.plist` (§4). Rebuild.
5. Upload, internal TestFlight, install on a real iPhone. This is the first
   time anyone has seen the app outside a simulator.
6. iOS OAuth client for Google sign-in (`docs/mobile-app.md` § iOS item 7) —
   free, and it strengthens the 4.2 argument.
7. Privacy labels, demo account, review notes (§6–8), then submit.

Screen sharing (`docs/mobile-app.md` § iOS item 8) is not a blocker and needs
a Broadcast Upload Extension. Ship without it.
