# Admin panel overhaul — status

Last updated 2026-10-26. Branch `feat/admin-panel-overhaul` (cut from `02672a3`
on `feat/vps-migration`), worktree `.claude/worktrees/admin-overhaul`. Design:
`docs/superpowers/specs/2026-10-26-admin-panel-overhaul-design.md`.

Verified: `tsc --noEmit`, eslint (0 errors), `next build` (19 admin pages).
**Not verified:** never run against a database or opened in a browser. Not
merged, not pushed, not deployed.

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

## To do

### Before merging (user)
1. Move `private_keys/AuthKey_T479RMTYDJ.p8` out of the repo folder (docs say
   `~/.appstoreconnect/private_keys/`). Delete `cookies.txt` if it's a login cookie.
2. Commit or stash main-checkout work, then `git merge feat/admin-panel-overhaul`.
   Expect a conflict on `apps/web/src/app/admin/InstantMeetingAdminButton.tsx`
   — keep the deletion.
3. Run against a test DB and click through every `/admin` page; run
   `npm run test:api` with the app running.

### Decisions needed (user)
- Should a NO_SHOW still use up a lesson from the plan quota? (Currently yes:
  bookings stay CONFIRMED.)
- Cal.com booking that clashes with an existing class: currently created anyway
  with a log warning. OK?

### Remaining build work
1. **Scheduled job** (needs infra on the Hetzner server, e.g. cron calling an
   authenticated route): mark OPEN invoices past due as OVERDUE (+ reminder
   email via `lib/email.ts sendRawEmail`); end manual subscriptions at period
   end (today done on `/admin/plans` load in `lib/admin-subscriptions.ts`).
2. **Real impersonation** ("log in as user") — needs its own design: Better
   Auth admin plugin or signed session swap, visible banner, end action, audit.
3. **Family notification when an admin books a class** (`api/admin/assign-student`
   doesn't notify).
4. Small leftovers: `StartInstantMeetingButton.tsx` has a "⚡" emoji (user WIP
   file); `SessionRowActions.tsx` uses `window.confirm`; time-off DELETE scopes
   by caller's org, so SUPER_ADMIN can't delete another org's time off;
   `/dashboard/progress` lists only completed records.
5. Dead-code candidates not yet removed: `lib/email.ts` `sendWeeklyDigest` /
   `sendSessionReminder` and `lib/crm.ts` sync functions are never called —
   wire up or delete. `api/admin/observers` is a student feature under the
   admin path with no caller.
