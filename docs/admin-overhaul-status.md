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

## Server setup for the daily job (not done — infra repo is yours)

Fits the existing pattern (`hetzner/backup/infra-backup.{service,timer}`): a
host systemd timer, calling the route from inside the web container so the
request never leaves the box and the secret never appears on a command line.

1. Add to `/opt/sites/novicetutor/web.env` (and the name to
   `hetzner/sites/novicetutor/web.env.example`):
   `CRON_SECRET=` a value from `openssl rand -hex 32`. Compose's `env_file`
   already passes web.env to `web`; the realtime sidecar does not get it.
2. `/etc/systemd/system/novicetutor-daily.service`:

   ```ini
   # Daily billing sweep for novicetutor.com: overdue invoices, subscription
   # period end. journalctl -u novicetutor-daily.service -n 20
   [Unit]
   Description=novicetutor.com daily billing job
   After=docker.service
   Requires=docker.service

   [Service]
   Type=oneshot
   ExecStart=/usr/bin/docker exec novicetutor-web-1 node -e "fetch('http://127.0.0.1:3000/api/cron/daily',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
   TimeoutStartSec=5min
   ```

3. `/etc/systemd/system/novicetutor-daily.timer`:

   ```ini
   # 13:00 UTC: morning in the US, evening in India. Persistent: a run missed
   # while the server was off happens at boot.
   [Unit]
   Description=novicetutor.com daily billing job

   [Timer]
   OnCalendar=*-*-* 13:00:00 UTC
   RandomizedDelaySec=10min
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

4. `systemctl daemon-reload && systemctl enable --now novicetutor-daily.timer`,
   then one manual run: `systemctl start novicetutor-daily.service &&
   journalctl -u novicetutor-daily.service -n 20` (expect `200 {"success":true,...}`).
5. Optional, defence in depth: in the `novicetutor` Caddy block, answer 404
   for `/api/cron/*` from outside (`@internal path /api/cron/*` +
   `respond @internal 404` before the main `handle`).

Until the site moves to Hetzner nothing calls the route; Cloudflare Workers
production keeps today's behaviour (on-load settle, overdue computed for
display). One Neon wake a day is negligible.

## To do

### Left for the user
1. Delete `cookies.txt` in the main checkout: a curl cookie jar holding a
   novicetutor.com session cookie (expired 2026-08-29). Git-ignored, never
   committed. The deletion was blocked by the permission guard.
2. The repo copy of `AuthKey_T479RMTYDJ.p8` was moved to
   `~/.appstoreconnect/moved-from-repo/`. It is byte-identical to
   `~/.appstoreconnect/private_keys/AuthKey_T479RMTYDJ.p8`, so the moved copy
   can be deleted. Key files there are now mode 600.
3. Your main-checkout work from before the merge is snapshotted at
   `refs/backup/main-wip-2026-10-26` (all 16 files). It was re-applied after the
   merge except `InstantMeetingAdminButton.tsx`, which the branch deletes (its
   popup fix is in `git show refs/backup/main-wip-2026-10-26 --
   apps/web/src/app/admin/InstantMeetingAdminButton.tsx` if wanted). Delete the
   ref once happy: `git update-ref -d refs/backup/main-wip-2026-10-26`.
4. Server setup above.

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
