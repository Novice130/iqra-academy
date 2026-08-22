# Remaining work — 1102 outage, iPhone pass, Apple steps

## Context

Three things are still open on Novice Tutor. One is code and needs a web deploy;
one needs a real iPhone in hand; one can only be done inside an Apple account.

The 1102 outages of 6–7 August were caused by `src/lib/db.ts` opening a Neon
**WebSocket pool per request** — a TLS handshake and a socket held for the life
of the request — while idle dashboards polled ~31 req/min each. Enough
concurrent pools in one isolate exceeded the Worker's 128 MB memory limit.
`withHttpDb()` was added as the fix (one `fetch` per query, no pool) and applied
to the worst offenders, but the sweep was not finished: the auth catch-all and
the 15-second live-class poll still open pools on every request.

**One correction to the earlier framing:** the homepage does *not* touch the
database. `apps/web/src/app/page.tsx` is a pure static component tree with no
`withDb`, so swapping drivers cannot help it. Its 2026-08-20 hang was a stale
Worker script, already fixed by redeploying from a clean build; what remains for
`/` is a caching change, not a driver change, and it is listed separately below
because it is optional.

Outcome wanted: no `exceededResources` in the 14:00 UTC class window, and the
iOS build proven on real hardware so the App Store submission is not the weakest
version of the app.

## 1. Finish the `withHttpDb` sweep (web deploy)

The rule, from `docs/worker-limits.md` and the doc comment in
`apps/web/src/lib/db.ts:77`: **`withDb()` only for handlers that open a
transaction** (`db.transaction`, `withRLS`, quota logic). Everything else takes
`withHttpDb()`. `tsc` cannot catch a wrong choice — the HTTP driver refuses
transactions at *runtime*.

Files to change:

- **`apps/web/src/app/api/auth/[...all]/route.ts`** — both `GET` and `POST` are
  wrapped in `withDb`. Move **`GET` only** to `withHttpDb`. GET is the session
  lookup, single-row reads, and it is on the hot path of every page load and
  every poll. Leave `POST` on `withDb`: sign-up writes user + account rows, and
  the cost of being wrong there is a broken registration, not a slow one.
- **`apps/web/src/app/api/students/live-class/route.ts:34`** — read-only, no
  `insert`/`update`/`transaction` in the file, and `LiveClassRibbon.tsx:34`
  polls it every 15s from every student dashboard. Straight swap to
  `withHttpDb`.

Before swapping either, grep the handler and everything it calls for
`transaction(` and `withRLS` — that is the whole safety check.

Deliberately **not** changed: `api/sessions/[id]/participant` (writes on both
`POST` and its second handler) and the admin/session mutation routes. They stay
pooled.

Deploy — from `reference_deploy_and_db_ops` and the 2026-08-20 postmortem:
clean local build, then `wrangler versions upload`, then
`wrangler versions deploy <id>@100%`. Re-deploying an existing version id does
nothing.

## 2. Two-device pass on a real iPhone

iOS student + web teacher in one class. The simulator already proved sign-in,
join, outbound audio and leave (commit `9620837`), so this pass is only for what
the simulator cannot show:

- **Camera** — the simulator serves `Mock video device 1`, a test pattern. A
  real face is also the only way to judge background effects.
- **Inbound audio** — never heard once. Nothing in the simulator can listen to
  the speaker.
- **Background audio** — lock the phone mid-class, confirm the teacher still
  hears the student and vice versa.
- **Control bar at 402pt**, the ⋮ tile menu, and the effects bottom sheet as
  touch targets, per `feedback_mobile_layout_regressions`.

Free Personal Team signing is enough for all of this; the profile expires every
7 days. Push, App Groups and screen sharing are **not** testable here — they
need item 3.

## 3. Apple account steps (only the user can do these)

In order, because each unlocks the next:

1. Apple Developer Program enrolment, $99/yr.
2. Register identifier `com.novicetutor.app` **with Push Notifications
   enabled** — enabling push later means regenerating profiles.
3. App Store Connect app record.
4. APNs key → upload into Firebase project `fir-auth-d4f03`; download
   `GoogleService-Info.plist` into `apps/mobile/ios` (gitignored).
5. App Store Connect API key. **Hand back the Key ID and Issuer ID only.** The
   `.p8` is a credential — it stays at `~/.appstoreconnect/private_keys/` on the
   building Mac and never enters the repo.

Then `apps/mobile/scripts/ios-release.sh` can run for the first time end to end;
it has never got past signing. Also human-only, and needed for review: a demo
account with a **future class booked**, review notes, privacy labels (no
tracking — never add `NSUserTrackingUsageDescription`), and a reachable privacy
policy URL. Guideline 4.2 is the real risk for a WebView shell, and the defence
is push + native sign-in + camera/mic + background audio all working in the
submitted build.

## Optional, related: stop re-rendering `/` per request

`apps/web/open-next.config.ts` is `defineCloudflareConfig({})` — no incremental
cache, so every request to a static page re-renders it and the prerendered
`.open-next/cache/<buildid>/index.cache` is dead weight. Pointing it at R2 (the
`novicetutor-app` bucket pattern already exists) would serve `/` from the built
payload. Not part of the 1102 fix; worth doing while a deploy is happening
anyway.

## Verification

1. `npm run build` and `eslint` clean before anything ships.
2. **Exercise both auth methods against the dev Neon branch after the swap** —
   sign in and sign up as a real test account (`reference_test_accounts`,
   password in `NT_PASSWORD`, not in this repo), because a transaction under the HTTP driver throws
   only at runtime. A successful sign-up is the proof that leaving `POST` pooled
   was enough.
3. Load a student dashboard and confirm the 15s `/api/students/live-class` poll
   still returns the live class.
4. After deploy, watch `workersInvocationsAdaptive` (account
   `6b8df46475fc4b356cd5979c1418780f`, `scriptName: "novicetutor"`) through the
   14:00 UTC window: `exceededResources` **is** 1102. Paths come from the zone's
   `httpRequestsAdaptiveGroups`, where 1102 shows as `edgeResponseStatus` 503.
5. Sanity probe if anything hangs: same path, different method. A fast
   `POST /` → 405 proves zone, edge, route and Worker are healthy and the hang is
   inside the GET render.
