# Testing

How to run the test harness and why a dedicated test database is required.

## TL;DR

```bash
# Web API + browser tests (Playwright)
npm run test              # root, via turbo — both projects
npm run test:api          # request-level tests only (no browser)
npm run test:e2e          # browser tests only

# Mobile
npm run analyze           # flutter analyze (apps/mobile)
cd apps/mobile && flutter test
```

Playwright starts `next dev` automatically on :3000. To run against an
already-running server: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test`.

## Isolated test database (required for anything that seeds)

Several scripts under `apps/web/scripts/` and the Playwright tenant fixtures
(`apps/web/tests/fixtures/orgs.ts`) **delete and overwrite rows**. They used
to run against whatever `DATABASE_URL` was in `.env` — the shared Neon
database. That ended the day it deleted real teacher availability.

Every destructive script now starts with `requireIsolatedDb(...)`
(`apps/web/scripts/lib/require-isolated-db.ts`), which refuses to run unless:

1. `ALLOW_LOCAL_DB_SCRIPTS=1` is set explicitly, and
2. `DATABASE_URL` does **not** point at a known shared endpoint, and
3. its host is localhost or listed in `LOCAL_TEST_DB_HOSTS`.

### Set up your isolated database

Option A — Neon branch of the dev project (recommended, schema-identical):

```bash
# In the Neon console: create a branch named "test-isolation".
# Copy its pooled connection string, then in apps/web/.env.local (not .env):
DATABASE_URL=postgresql://...your-test-branch...
ALLOW_LOCAL_DB_SCRIPTS=1
LOCAL_TEST_DB_HOSTS=ep-your-test-branch.c-3.us-east-2.aws.neon.tech
```

Option B — local Postgres:

```bash
createdb quran_lms_test
# apps/web/.env.local:
DATABASE_URL=postgresql://localhost:5432/quran_lms_test
ALLOW_LOCAL_DB_SCRIPTS=1
cd apps/web && npx drizzle-kit push   # schema into the empty test DB
```

`.env.local` wins over `.env` locally and is git-ignored, so the app still
runs against the shared DB while your shell points scripts at the test DB.
Export the three variables in your shell if you want them to apply outside
Next's env loading (the Playwright fixtures read `process.env` only).

### What happens if I don't?

```text
[test-all-features] refused to run: DATABASE_URL points at a known shared
database host (ep-nameless-glade-...neon.tech).
  → Create an isolated Neon branch (or a local Postgres) for tests...
exit 1
```

The guard fails closed. Adding a host to `LOCAL_TEST_DB_HOSTS` is the
deliberate, auditable act that says "this database is disposable".

## Playwright layout

```text
apps/web/
  playwright.config.ts     # projects: api, e2e; auto-starts next dev
  tests/
    fixtures/
      orgs.ts              # seeds two orgs (pw-org-a / pw-org-b) + roles
      test.ts              # extends playwright test with orgA/orgB fixtures
    api/                   # request-level tests; authz/tenant boundaries
    e2e/                   # browser journeys
```

Fixtures use the same `requireIsolatedDb` guard — importing them can never
touch the shared database. Seeding is get-or-create on stable
slugs/emails (`pw-org-a`, `pw-teacher-a@test.invalid`, ...), so reruns are
idempotent. Reset by wiping the test branch.

Known-broken product behavior is captured with `test.fail(...)`: the test
asserts the *desired* behavior and stays "expected to fail" until the fix
lands, at which point Playwright reports it and the marker gets removed.

## Phase 0 baseline gates (recorded 2026-09-04)

| Gate | Command | Result |
|---|---|---|
| Root lint | `npm run lint` | ✅ 0 errors, 79 warnings |
| Root build | `npm run build` | ✅ 3/3 turbo tasks |
| Root test suite | `npm run test` | ✅ mobile + web passed (Playwright configured with workers: 1 local, timeout: 60s) |
| Web API tests | `npx playwright test --project=api` | ✅ 5/5 (1 expected-fail, below) |
| Web e2e tests | `npx playwright test --project=e2e` | ✅ 3/3 |
| Web typecheck | `npx tsc --noEmit` | ✅ clean |
| Flutter analyze | `cd apps/mobile && flutter analyze` | ✅ No issues found |
| Flutter test | `cd apps/mobile && flutter test` | ✅ 1/1 passed |
| Android debug build | `cd apps/mobile && flutter build apk --debug` | ✅ app-debug.apk (KGP version warning) |
| iOS simulator build | `cd apps/mobile && flutter build ios --simulator --no-codesign` | ❌ env gap, below |
| iOS device build | `cd apps/mobile && flutter build ios --no-codesign` | ❌ same env gap |

### Baseline findings

- **`next dev` (webpack) is broken.** The dev server compiles
  `src/instrumentation.ts` for the edge runtime and crashes with
  `EvalError: Code generation from strings disallowed for this context` on
  every request; the server never serves. `next dev --turbopack` works fine,
  so `npm run dev` now defaults to Turbopack. Root cause (a dev-only webpack
  edge-bundle issue) is worth revisiting only if webpack dev is ever needed.
- **`GET /api/health`'s embedded DDL fails in the dev environment.** The
  route runs `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled`
  on every call; against the database in `.env` this fails, so it reports
  HTTP 200 with `status: "error: Failed query..."`. Also, a health check
  should never mutate schema. Phase 2 makes migrations own schema and turns
  health into a read-only probe. Captured as `test.fail()` in
  `tests/api/health.spec.ts`.
- Destructive `scripts/*.ts` previously ran unguarded against the shared DB;
  now gated behind `requireIsolatedDb` (this document).
- **iOS builds blocked by machine setup, not code.** Xcode 26.6 has the iOS
  26.5 SDKs (`xcodebuild -showsdks` lists them) but **zero Simulator
  runtimes** (`xcrun simctl list runtimes` is empty), so both simulator and
  device destinations are "ineligible". Remediation: `xcodebuild
  -downloadPlatform iOS` (multi-GB download — machine owner's call), then
  re-run the gate. `flutter analyze` / `flutter test` are unaffected and
  green.
- Unauthenticated `/dashboard` **does** redirect to `/login` (middleware) —
  verified by e2e; the server component additionally returns `null` when no
  session is present, which is dead defense rather than a live bug.
