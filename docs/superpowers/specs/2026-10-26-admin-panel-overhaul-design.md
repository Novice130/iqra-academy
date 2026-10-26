# Admin panel overhaul — design

Date: 2026-10-26. Branch: `feat/admin-panel-overhaul`.

## Why

The admin panel at `/admin` was seven pages that grew one at a time. It could
watch live classes, book a single class, change a role and raise an invoice,
but it could not answer the questions an operator of a live tutoring school
asks every day: who is this student and are they paid up, how many hours did
this teacher teach, which trial requests are waiting, why was that class
cancelled, is the video service healthy. Six admin APIs had no screen at all,
two pages were near copies of each other, the nav was written out three
times, and several buttons were broken (Instant Meeting never opened the room,
"Reassign" opened a blank booking form, prefill links were ignored).

## Goals

1. Every entity an operator manages has a screen: students, teachers, users,
   classes, trials, invoices, coupons, exports, audit log, system health.
2. One place per job. No duplicate pages, components, helpers or nav lists.
3. Production quality: real numbers (no hardcoded "Healthy"), viewer-timezone
   dates, loading/empty/error states, accessible, works at 320px.
4. Fix the broken flows and the scoping holes the audit found.

## Non-goals

- No database schema changes or migrations. Deployment is mid-move to the
  Hetzner server; the schema stays as it is. Where the audit enum lacks a
  value, use the closest existing one and put the detail in `metadata.op`.
- No new npm dependencies.
- No real impersonation, subscription/plan management or progress-recording
  backend. Each needs its own design.
- No changes to the video call UI (uncommitted work exists there).

## Anti-goals

- A page that shows a number that isn't true.
- An action that says it notifies someone and doesn't.
- An admin of one org seeing or changing another org's data.

## Shared foundation (already built, commit 5844652)

- `lib/admin-page.ts` — `requireAdminPage(path)` returns `AdminContext`
  (`userId, orgId, role, isSuperAdmin, name, email, timezone`), memoised per
  request; `orgFilter(ctx, table.orgId)` → `eq(...)` for ORG_ADMIN, nothing for
  SUPER_ADMIN. **Scope rule:** ORG_ADMIN reads its org, SUPER_ADMIN reads all.
- `lib/rbac.ts` — `canAccessAdmin`, `requireRole` (hierarchical), `ROLE_HIERARCHY`.
- `app/admin/_components/ui.tsx` — `PageHeader, Panel, StatCard, StatGrid,
  Badge, StatusBadge, statusTone, humanize, EmptyState, DefinitionList,
  PageSkeleton`, class recipes `btn.*, input, label, table.*`.
- `app/dashboard/nav.ts` — the admin nav. Pages it links to:
  `/admin, /admin/live-classes, /admin/scheduled-classes,
  /admin/teacher-schedules, /admin/assign-student, /dashboard/attendance,
  /admin/students, /admin/teachers, /admin/trials, /admin/users,
  /admin/invoices, /admin/coupons, /admin/exports, /admin/audit,
  /admin/system`, plus `/admin/students/[id]`, `/admin/teachers/[id]`,
  `/admin/sessions/[id]` as detail pages.
- `lib/money.ts` (`money(cents, currency)`), `lib/csv.ts` (`csvCell`, `toCsv`),
  `lib/root-admin.ts`.

## Work packages

| Pkg | Owns |
|---|---|
| A Overview & live | `/admin` overview with real KPIs and a needs-attention list; `/admin/live-classes` built on one shared live-room loader; delete `InstantMeetingAdminButton` |
| B Students & trials | `/admin/students` list, `/admin/students/[id]` 360 view, `/admin/trials` pipeline; remove the broken `AssignStudentModal` |
| C Teachers & users | `/admin/teachers` list, `/admin/teachers/[id]` (hours, roster, time off), `/admin/users` with create and delete |
| D Scheduling | `/admin/sessions/[id]` with cancel/reschedule/reassign/no-show that notify and audit; assign-student prefill and weekly repeat; teacher-schedules week fix |
| E Billing | invoices on `lib/money`, refunds (org-scoped), `/admin/coupons`, `/admin/exports` |
| F Ops | `/admin/audit` viewer, `/admin/system` health; delete the no-op impersonate route |

## Left to the builders

Layout details inside each page, query shapes, and which secondary actions to
include, provided they use the shared kit and the existing API/lib helpers.
