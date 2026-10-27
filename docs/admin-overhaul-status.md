# Admin panel overhaul — status

Last updated 2026-10-26. Branch `feat/admin-panel-overhaul` (cut from `02672a3`
on `feat/vps-migration`), worktree `.claude/worktrees/admin-overhaul`. Design:
`docs/superpowers/specs/2026-10-26-admin-panel-overhaul-design.md`.

**Merged** (fast-forward) into `feat/vps-migration` on 2026-10-26. Not pushed,
not deployed.

Verified:
- `tsc --noEmit`, eslint (0 errors), `next build`.
- Against a throwaway local Postgres 16 (UTC, `drizzle-kit push` + `db:seed`),
  production build on localhost:
  - Every `/admin` page, as ORG_ADMIN and as SUPER_ADMIN, loaded in headless
    Chromium: 200, no console or page errors, no 5xx. (Only noise: the
    realtime WebSocket, as no sidecar was running.) Teacher and family
    dashboards too.
  - Scripted checks, 58/58: admin booking notifies family and teacher;
    SUPER_ADMIN can and ORG_ADMIN cannot delete another org's time off;
    `/api/cron/daily` rejects no auth, a wrong secret and an admin session,
    flips a past-due manual invoice to OVERDUE, leaves a not-yet-due one and
    a Stripe one alone, ends a cancel-at-period-end subscription, reports a
    lapsed one without ending it, and does nothing on a second run.
  - `npm run test:api`: 99 passed, 14 failed. The same suite on the base
    commit `02672a3`, same database: 96 passed, 17 failed. Every failure on
    the branch also fails on base (see "Known failing API tests").
- Pages were loaded, not clicked through action by action. LiveKit, Resend,
  Stripe and the sidecar were not configured, so those paths were only seen
  failing gracefully ("would have sent" in the log for email).

## Done

### Foundation
- `lib/admin-page.ts` — `requireAdminPage()`, `orgFilter()` (ORG_ADMIN = own
  org, SUPER_ADMIN = all orgs).
- `app/admin/_components/ui.tsx` — shared header, panel, stat, badge, empty,
  skeleton, button/input/table classes.
- `app/dashboard/nav.ts` — one nav config for every role and shell.
- `lib/money.ts`, `lib/csv.ts` (quoted, formula-safe), `lib/root-admin.ts`,
  `lib/roles.ts`. `canAccessAdmin` moved to `lib/rbac.ts`.

### Pages (`/admin/...`)
| Page | What it does |
|---|---|
| `/admin` | Real KPIs in viewer's zone, needs-attention list, live now, today |
| `live-classes` | Live rooms incl. breakouts, end room, auto-refresh |
| `scheduled-classes` | One row per class, SQL filters + paging |
| `sessions/[id]` | Class page: cancel, reschedule, reassign, no-show, completed, attendance, recording, history |
| `assign-student` | Prefill from URL, repeat weekly up to 12 weeks |
| `teacher-schedules` | 7-day week in viewer's zone, CSV |
| `students`, `students/[id]` | List + full student page |
| `teachers`, `teachers/[id]` | List + hours/month (payroll CSV), roster, time off |
| `trials` | Trial pipeline with follow-ups |
| `users` | Add, change role, remove |
| `invoices` | Ledger, filters, family filter, refunds |
| `plans` | Plans + manual subscriptions (assign, pause, resume, change, extend, cancel) |
| `coupons` | Create, deactivate |
| `exports` | Students, users, sessions, attendance, invoices CSV |
| `curriculum` | Lessons per track: add, edit, reorder, deactivate |
| `audit` | Filterable audit log |
| `system` | DB, LiveKit, stuck classes, outbox, CRM, sidecar health |

Teacher side: progress recording on `/dashboard/teacher/students/[id]`
(`api/teachers/progress`).

### Security fixes
- Refunds were not org-scoped (now by invoice, org-checked, capped).
- LiveKit end-room was not org-scoped.
- Session PATCH let an admin assign another org's teacher.
- Student profile PATCH/DELETE was open to teachers and other orgs.
- Notification emails inserted user text unescaped (HTML injection).

### Bug fixes
- Instant Meeting button never opened the room; Reassign/prefill links ignored;
  teacher assign modal always 400.
- Cancelling a class notified nobody; group-class actions now apply to every
  overlapping row of the class (not neighbouring 1:1s); no-show is per student.
- Advisory locks on every booking path (admin, trials, Cal.com, instant).
- Attendance rate undercounted group classes (`lib/attendance.ts`).
- Family-plan quota inserted a new entitlements row per check (`lib/quota.ts`).
- Extensions double-counted; teacher week was 8 days in server time;
  hydration mismatch; impossible dates rolled over; refunds voided owed
  invoices; payment edits unaudited; trial conversion used sibling activity.
- 3 stale API tests corrected (`tests/api/rbac-deep`, `tenant-isolation`).

### Removed
Duplicate live-classes loader, `InstantMeetingAdminButton`, `AssignStudentModal`,
`api/admin/impersonate` (did nothing), `lib/admin.ts` (unused AdminJS), triple
nav lists, per-page auth copies, duplicate `money()`, emoji labels.

## Added after the first pass (2026-10-26)

- **Daily billing job** — `POST /api/cron/daily` (`lib/daily-jobs.ts`), bearer
  `CRON_SECRET`, fail-closed. Marks OPEN hand-raised invoices past due as
  OVERDUE and emails the family one reminder (amount still owed); Stripe
  invoices are left to Stripe. Ends manual subscriptions set to cancel at
  period end. Manual subscriptions whose period ran out are reported, not
  ended. One summary email per org's admins on days with news. Idempotent.
  The `/admin/plans` on-load settle stays as a backstop.
- **Admin booking notifies** — `api/admin/assign-student` sends one message to
  the family and one to the teacher (in-app, push, email), each in their own
  zone, naming the first class and the weekly count.
- **Leftovers** — inline confirm in `SessionRowActions` (and it shows API
  errors now); emoji gone from the Instant Meeting label; SUPER_ADMIN can
  delete any org's time off; `/dashboard/progress` lists in-progress records.
- **Removed** — `lib/crm.ts` and the `/admin/system` CRM panel (read a table
  nothing wrote), `api/admin/observers`, `sendWelcomeEmail`,
  `sendSessionReminder`, `sendWeeklyDigest`. Tables kept (no migrations).

## Server setup for the daily job

Installed 2026-10-27. novicetutor.com is served by the Hetzner server since
01:22 UTC that day, and `novicetutor-daily.timer` runs at 13:00 UTC; its first
manual run answered `200 {"success":true,...}`.

Committed in the infra repo (`hetzner/sites/novicetutor/`, branch
`gmktec-staging-design`, not pushed):
- `web.env.example` has `CRON_SECRET` (generate with `openssl rand -hex 32`).
- `novicetutor-daily.service`: one-shot `docker exec novicetutor-web-1 node -e
  "fetch(... Bearer process.env.CRON_SECRET)"`, so the request stays inside the
  container and the secret is never on a command line.
- `novicetutor-daily.timer`: daily 13:00 UTC, `Persistent=true`.
- The install commands are at the top of the `.service` file.

The full server procedure, including when to enable the timer, is in the infra
repo's `docs/novicetutor-move.md` (section 4; cutover and rollback in 6 and 7).
Caddy answers 404 for `/api/cron/*` from outside. Until the timer runs, the
plans page still settles subscriptions on load and overdue status is computed
for display.

## To do

### Left for the user
1. Your main-checkout work from before the merge is snapshotted at
   `refs/backup/main-wip-2026-10-26` (all 16 files). It was re-applied after the
   merge except `InstantMeetingAdminButton.tsx`, which the branch deletes (its
   popup fix is in `git show refs/backup/main-wip-2026-10-26 --
   apps/web/src/app/admin/InstantMeetingAdminButton.tsx` if wanted). Delete the
   ref once happy: `git update-ref -d refs/backup/main-wip-2026-10-26`.
2. Follow the infra repo's `docs/novicetutor-move.md`: section 0 lists what
   only you can provide (pushes, the `NEXT_PUBLIC_VAPID_PUBLIC_KEY` repository
   variable, the `hz-novicetutor` DNS record, secret values).

Done 2026-10-27: `cookies.txt` (expired session cookie) deleted; the repo copy
of `AuthKey_T479RMTYDJ.p8` removed (byte-identical to
`~/.appstoreconnect/private_keys/`, where the keys are now mode 600).

### Decisions needed (user)
- Should a NO_SHOW still use up a lesson from the plan quota? (Currently yes:
  bookings stay CONFIRMED.)
- Cal.com booking that clashes with an existing class: currently created anyway
  with a log warning. OK?
- A manual subscription whose period ran out (not set to cancel) is reported
  to admins daily-ish but stays ACTIVE. Should it pause or go PAST_DUE instead?

### Remaining build work
1. **Real impersonation** ("log in as user") — needs its own design: Better
   Auth admin plugin or signed session swap, visible banner, end action, audit.
2. Observer list on the admin student page still reads `observer_emails`, but
   nothing lets a family add one any more and no digest is sent. Remove the
   panel or build the feature.

### Known failing API tests (pre-existing, same on base `02672a3`)
- Meeting controls (lock, volume, spotlight, room-wide volume): 500 without
  LiveKit configured.
- `lifecycle.spec.ts` due-window tests and `data-model.spec.ts` instant-meeting
  origin: depend on leftover classes in the database; the latter passes alone.
- On reruns against the same database, `admin-architecture.spec.ts:224`
  (admin reschedule) gets 422: earlier runs leave classes for the same
  fixture teacher at the target time and the reschedule conflict check
  refuses, correctly. Passes on a fresh database. The suite needs per-run
  cleanup or unique times.
- `tenant-isolation.spec.ts` / `rbac-deep.spec.ts` cross-org matrix: routes
  answer 404/400/422 where the tests expect 403, and one error message
  wording differs. Assertions or routes need reconciling; not touched here.
- `rbac-deep.spec.ts` breakout token: 403 where 200 expected.
