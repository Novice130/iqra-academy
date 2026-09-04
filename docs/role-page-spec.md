# 🖥️ Role Page & Navigation Specification

**Project**: NoviceTutor / Iqra Academy LMS & Virtual Classroom  
**Status**: Canonical Source of Truth (Post-Remediation)  
**Last Updated**: 2026-09-05  

---

## 1. Global Navigation & Layout Contracts

### 1.1 Responsive Dashboard Chrome (`DashboardChrome.tsx`)
All authenticated dashboard routes (except active meeting sessions) are wrapped by `DashboardChrome`:
- **Desktop ($\ge 1024$px)**: Exact `264px` fixed sidebar (`w-[264px]`) containing organization branding, user profile card, role-specific navigation menu, and sign-out action.
- **Tablet ($640–1023$px)**: Compact `64px` navigation rail (`w-16`) featuring centered icon buttons, active indicators, and accessible hover tooltips.
- **Mobile ($< 640$px)**: Native mobile bottom navigation bar with 4 primary role tabs plus a "More" sheet trigger.
- **Active Meeting Exception**: Meeting routes (`/dashboard/session/[id]`) strictly suppress all dashboard chrome, rendering a zero-chrome fullscreen canvas with native safe-area padding.

### 1.2 Sub-Frame Navigation Feedback (`NavigationProgress.tsx`)
- Intercepts all internal link clicks with sub-frame ($< 16$ms) feedback.
- Renders a slim `#0A84FF` progress bar across the top of the viewport with blur glow and fade-out transition.
- Safely wrapped in React `Suspense` to preserve Next.js static and dynamic routing boundaries.

### 1.3 Focused Streaming Skeletons (`loading.tsx`)
Every major route implements a dedicated streaming skeleton mirroring the exact geometry of the loaded page, completely eliminating generic full-page loading spinners:
1. `/dashboard/loading.tsx` — Hero card, 4 stat cards, quick actions, profile pills.
2. `/admin/loading.tsx` — Stat cards, live class monitor, overview actions.
3. `/dashboard/booking/loading.tsx` — Teacher selector, day strip, slot grid.
4. `/dashboard/schedule/loading.tsx` — Week navigation, 8-column header, hourly rows.
5. `/dashboard/attendance/loading.tsx` — Filter controls, attendance table rows.
6. `/dashboard/teacher/students/loading.tsx` — Search header, student card grid.
7. `/admin/invoices/loading.tsx` — Breadcrumbs, filter controls, invoice table.
8. `/dashboard/session/[id]/loading.tsx` — Immersive dark canvas with shimmer camera shimmer.

---

## 2. Student Experience Specifications

| Route | Title | Purpose & Core Behaviors |
|---|---|---|
| `/dashboard` | **Student Home** | Next class hero card with prominent `ClassActionButton` (countdown before T-60; blue action at T-60); quota cards calculated from real database records; student profile cards. |
| `/dashboard/progress` | **Progress** | Child profile track selection (`QAIDAH`, `QURAN_READING`, `HIFZ`), completed/total lesson progress bar, teacher notes and verified milestones. |
| `/dashboard/booking` | **Book a Class** | 3-step booking wizard (Teacher $\to$ Date/Time $\to$ Confirmation). Displays viewer timezone, slot invalidation via `useSchedulingRealtime`, and instant booking confirmation. |
| `/dashboard/schedule` | **Schedule** | Role-scoped Week and List views. Status badges (`UPCOMING`, `READY`, `LIVE`, `COMPLETED`, `EXPIRED`), `<LocalTime>` timezone rendering, direct join actions. |
| `/dashboard/chat` | **Messages** | Real-time direct conversation between student/parent and assigned teachers. Real message status without fake presence or online indicators. |
| `/dashboard/billing` | **Billing** | Subscription details, payment methods, invoice ledger. Formatted safely for Apple App Store / Google Play guidelines. |
| `/dashboard/settings` | **Settings** | Account name, contact details, viewer timezone preference (`GET`/`PATCH /api/me/timezone`), security / two-factor authentication, child profiles. |

---

## 3. Teacher Experience Specifications

| Route | Title | Purpose & Core Behaviors |
|---|---|---|
| `/dashboard/teacher` | **Teacher Home** | Today's scheduled class roster, quick action "⚡ Instant Meeting" (`StartInstantMeetingButton`), quick stats. Zero admin live class matrix leakage. |
| `/dashboard/teacher/availability` | **Availability** | Weekly 7-day $\times$ 48-slot availability editor. Quick mode toggle, custom slot selection, save feedback, and "Save & Finish" redirect to teacher home. Admin editing banner displaying target teacher name. |
| `/dashboard/teacher/students` | **Students Roster** | Search, filter by track, student cards. Progress percentage strictly verified: `Math.min(100, Math.round((completed / total) * 100))`. |
| `/dashboard/teacher/students/[id]` | **Student Details** | Profile info, guardian contacts, lesson milestone progress, attendance history formatted with `<LocalTime>`, canonical "Call Student" trigger. |
| `/dashboard/teacher/messages` | **Support Threads** | Teacher-parent communications, unread badge counters, responsive split desktop / stacked mobile layout. |

---

## 4. Administrator Experience Specifications

```
                       /admin (Live Overview Only)
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 /admin/live-classes   /admin/scheduled-classes   /admin/teacher-schedules
 (Occupied Rooms)      (Matrix & Filters)         (7-Day Dense Grid)
        │                       │                       │
        ▼                       ▼                       ▼
 /admin/assign-student     /admin/users          /admin/invoices
 (Conflict Validation) (Role Management)         (Billing Ledger)
```

### 4.1 Admin Route Hierarchy

1. **`/admin` (Admin Overview)**:
   - High-level tenant metrics: Active Students, Teachers, Weekly Classes, Completion Rate, Open Invoices.
   - **Occupied Live Classes Monitor Only**: Shows classes with active LiveKit rooms and assigned teachers.
   - **Strict Invariant**: Zero future scheduled class rows on `/admin`.
2. **`/admin/live-classes` (Live Class Monitor)**:
   - Dedicated LiveKit room monitor requiring matching organization, `numParticipants > 0`, and active teacher attendance.
   - Live elapsed time, room health, participant counts, and "Observe Live" action.
3. **`/admin/scheduled-classes` (Scheduled Classes Matrix)**:
   - Viewer timezone calendar grouping using `<LocalTime>`, never raw UTC string truncation.
   - Filters: Teacher, Track, Status, Date Window.
   - Search bar, 25-per-page pagination, direct copy link, and authorized session cancellation (`PATCH /api/sessions/[id]`).
4. **`/admin/teacher-schedules` (Teacher Spreadsheet)**:
   - Dense 7-day grid with sticky teacher columns and headers.
   - Green availability shading, blue scheduled class blocks (with live indicators), amber time-off hatching.
   - 1-click slot click prefilling `/admin/assign-student` with teacher and start time.
   - CSV export and mobile horizontal day switcher.
5. **`/admin/assign-student` (Assign Student)**:
   - Student profile selector, teacher selector, track selector (`QAIDAH`, `QURAN_READING`, `HIFZ`), start time, and duration.
   - Real-time conflict validation: rejects past dates, detects existing session overlaps, and checks teacher time-off.
   - Atomic database transaction inserting session, booking, outbox events, and audit logs.
6. **`/admin/users` (User & Role Management)**:
   - Tenant user roster with role badges (`STUDENT`, `TEACHER`, `ORG_ADMIN`).
   - Promote / Change Role modal enforcing privilege ceiling.
   - **Protected Super Admin Safeguard**: `syedamer130@gmail.com` row has disabled role change and delete buttons.
7. **`/admin/invoices` (Invoice Management)**:
   - Invoice summary, filter by status (`DRAFT`, `OPEN`, `PAID`, `VOID`), invoice creation modal, payment recording.
8. **`/admin/*` (Dedicated 404)**:
   - Unknown `/admin/*` routes render `not-found.tsx` with a clear "Return to Admin Overview" CTA, strictly avoiding catch-all dashboard fallbacks.

---

## 5. Public, Authentication & Legal Routes

- **`/` (Marketing Home)**: Responsive landing page, trial class CTA, curriculum details, pricing overview.
- **`/app` & `/app/download`**: Platform download hub directing to App Store, Google Play, and web login.
- **`/login`**: Centered 420px max glass auth card. Email and password inputs, password visibility eye toggle, field-level validation, Better Auth integration.
- **`/register`**: Centered 420px max glass registration card. Google Sign-In and email signup with automatic student role onboarding.
- **`/join`**: Guest entry page with 12-digit meeting code auto-formatting (`xxx-xxx-xxxx`), name entry, and join trigger.
- **`/join/[id]`**: Direct meeting join page. Structured state machine: `connecting` $\to$ `waiting_for_host` $\to$ `admitted` (mints LiveKit token) $\to$ `denied` / `expired` (retry button).
- **`/terms` & `/privacy`**: Legal documentation pages enforcing a readable 720px measure (`max-w-[720px]`), sticky Table of Contents navigation with section anchor jumping, and last-updated metadata.
- **`/debug/*`**: Development-only diagnostic routes (`/debug/segmentation`, `/debug/prejoin`). Completely blocked in production via `debug/layout.tsx` calling `notFound()`.
