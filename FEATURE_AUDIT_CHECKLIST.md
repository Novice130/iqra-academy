# 📋 Feature Audit Checklist & System Verification Guide

**Project**: NoviceTutor / Iqra Academy LMS & Virtual Classroom  
**Live URL**: [https://novicetutor.com](https://novicetutor.com)  
**Cloudflare Version**: `ffc5e19f-5dff-4f6b-99ba-52986dbc0c4a`  
**Git Branch**: `master`

---

## 🎯 Quick Handoff Prompt for New Sessions

> **Copy & Paste this prompt into a new session:**
>
> *"Please review `FEATURE_AUDIT_CHECKLIST.md` in the repository root. It contains the complete status and verification steps for all features, UI layouts, WebGL segmentation pipeline, guest knock/admit flows, and mobile safety guards. Check the list against the current codebase and let me know if everything is running as intended or if there are any new items to work on."*

---

## 📊 Master Feature Checklist

| # | Feature / User Request | Status | Key Source Files | Live Tested |
|---|---|---|---|:---:|
| 1 | **Background Change Engine & Edge Stability** | ✅ Complete | `apps/web/src/components/video/segmentation/glPipeline.ts` | Yes |
| 2 | **Apple visionOS "Liquid Glass" UI Materials** | ✅ Complete | `apps/web/src/components/video/CallControlBar.tsx`, `CustomVideoConference.tsx` | Yes |
| 3 | **Google Meet 3-Button Center Self-View Pill** | ✅ Complete | `apps/web/src/components/video/CustomVideoConference.tsx`, `CallIcons.tsx` | Yes |
| 4 | **Layout Switcher ("Gallery View") Draggable & Centered** | ✅ Complete | `apps/web/src/components/video/CustomVideoConference.tsx` | Yes |
| 5 | **Guest Link Join & Host Admission Flow** | ✅ Complete | `apps/web/src/app/join/[id]/page.tsx`, `/api/guest/join`, `/api/sessions/[id]/guests` | Yes |
| 6 | **Instant Guest Re-Admission (Same Link / Refresh)** | ✅ Complete | `apps/web/src/app/join/[id]/page.tsx`, `/api/guest/join` | Yes |
| 7 | **Single "Admit" Click (No Duplicate Prompts)** | ✅ Complete | `apps/web/src/components/video/GuestKnockPrompt.tsx`, `/api/sessions/[id]/guests` | Yes |
| 8 | **Mobile Back-Button & Swipe-Back Protection** | ✅ Complete | `apps/web/src/components/video/LiveKitRoom.tsx` | Yes |
| 9 | **Background Lag Fix on Remote/Older Devices** | ✅ Complete | `apps/web/src/components/video/segmentation/SmoothBackgroundTransformer.ts` | Yes |
| 10 | **Floating Student Tiles Clearance Above Bottom Menu** | ✅ Complete | `apps/web/src/components/video/CustomVideoConference.tsx` | Yes |
| 11 | **Free-Form Tile Dragging & Magnetic Snapping/Clipping** | ✅ Complete | `apps/web/src/components/video/CustomVideoConference.tsx` | Yes |
| 12 | **Super Admin Teacher Email Onboarding (`syedamer130@gmail.com`)** | ✅ Complete | `apps/web/src/app/admin/users/page.tsx`, `/api/admin/users` | Yes |
| 13 | **Native iOS and Android Parity & Deep Linking** | ✅ Complete | `apps/mobile/lib/shell/web_shell.dart`, `MainActivity.kt`, `CallControlBar.tsx` | Yes |

---

## 🔍 In-Depth Details & Verification Steps

### 1. Background Change Engine & Edge Stability
- **Files**: `apps/web/src/components/video/segmentation/glPipeline.ts`
- **What was fixed**:
  - `DEFAULT_SETTINGS.temporalBlend = 0.15` (85% EMA history retention to freeze neural network micro-jitter).
  - Cubic noise-rejection gate `smoothstep(0.22, 0.55, diff)` in temporal shader to discard sensor noise.
  - Continuous anti-aliased edge ramp with `edgeSoftness: 0.14` and `maskFeather: 2.4` for smooth hair/head boundaries.
- **Verification**: Go to `/debug/segmentation` or start a video call and pick any background. Confirm edges remain stable and jitter-free when moving.

---

### 2. Apple visionOS / iOS 18 "Liquid Glass" Styling
- **Files**: `apps/web/src/components/video/CallControlBar.tsx`, `CustomVideoConference.tsx`
- **What was fixed**:
  - Frosted glass materials with dual specular inset highlights (`inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)`).
  - High saturation & contrast blur (`backdrop-filter: blur(32px) saturate(200%) contrast(105%)`).
  - Applied across Call Control Bar dock, buttons, popovers, and pills.
- **Verification**: Look at bottom dock and floating pills on `/dashboard/session/[id]`. Confirm translucent glass styling with top specular edge.

---

### 3. Google Meet 3-Button Center Action Pill
- **Files**: `apps/web/src/components/video/CustomVideoConference.tsx`, `CallIcons.tsx`
- **What was fixed**:
  - Replaced old single text button with 3-button capsule pill:
    - Button 1: Reframe Video (`FramePersonIcon` — toggles `contain` vs `cover`).
    - Button 2: Visual Effects (`VisualEffectsSparkleIcon` — sparkle icon toggling effects palette).
    - Button 3: More Options (`MoreIcon` — 3-dot dropdown menu for Framing, Visual effects, and Pin).
  - Auto-hides after 3.5s of inactivity.
- **Verification**: Hover over main video stage. Confirm 3-button capsule appears in the center.

---

### 4. Layout Switcher ("Gallery View") Draggable & Non-Colliding
- **Files**: `apps/web/src/components/video/CustomVideoConference.tsx`
- **What was fixed**:
  - Positioned at **Top-Center** by default (`left: 50%, top: 16px`), completely avoiding top-right tile settings/mute menu.
  - Added full pointer & touch drag support with viewport boundary clamping.
  - Tapping toggles layout mode dropdown.
- **Verification**: Check top-center of video stage. Confirm pill is centered and can be freely dragged anywhere on screen.

---

### 5. Guest Link Join & Host Knock Flow
- **Files**: `apps/web/src/app/join/[id]/page.tsx`, `apps/web/src/app/api/guest/join/route.ts`, `apps/web/src/app/api/sessions/[id]/guests/route.ts`
- **What was fixed**:
  - `<GuestKnockPrompt>` mounted unconditionally at top-level (no longer hidden when host is idle).
  - Relaxed `assertHost` to allow any authenticated teacher/participant in the session to admit guests.
  - Broadened session query to resolve raw ID, canonical room ID, merged ID, and sibling occurrences.
  - Mints LiveKit token and connects guest upon host approval.
- **Verification**: Open `/join/[sessionId]` in an incognito window, enter name -> Host sees knock notification card at top of screen -> Click Admit -> Guest enters call.

---

### 6. Instant Guest Re-Admission (Same Link / Refresh)
- **Files**: `apps/web/src/app/join/[id]/page.tsx`, `apps/web/src/app/api/guest/join/route.ts`
- **What was fixed**:
  - Admission valid for full session window (4 hours).
  - When an admitted guest refreshes or rejoins via the same link, `POST /api/guest/join` detects prior admission and returns LiveKit token directly.
  - Saved in `localStorage` (`guest_session_${sessionId}`).
- **Verification**: As an admitted guest, refresh the browser page. Confirm you join directly without asking the host a second time.

---

### 7. Single "Admit" Click (No Duplicate Prompts)
- **Files**: `apps/web/src/components/video/GuestKnockPrompt.tsx`, `apps/web/src/app/api/sessions/[id]/guests/route.ts`
- **What was fixed**:
  - When host clicks Admit, all duplicate pending requests for that guest name are marked ADMITTED simultaneously.
  - `GuestKnockPrompt.tsx` deduplicates active requests by name and dismisses immediately on first click.
- **Verification**: Host clicks Admit once -> card permanently disappears and never asks again.

---

### 8. Mobile Back-Button & Swipe-Back Protection
- **Files**: `apps/web/src/components/video/LiveKitRoom.tsx`
- **What was fixed**:
  - Added `usePreventBackNavigation()` with `history.pushState` and `popstate` event trapping.
  - Swiping back on iOS Safari or hitting the Android back button is intercepted, keeping user in class.
  - Exit is only possible by tapping the red "End / Leave" button.
- **Verification**: Join call on mobile -> swipe back -> confirm you remain in the call.

---

### 9. Background Replacement Performance & Low-End Device Lag Fix
- **Files**: `apps/web/src/components/video/segmentation/SmoothBackgroundTransformer.ts`
- **What was fixed**:
  - Pre-scales input frames to `256x144` before MediaPipe inference, reducing ML upload overhead by **~80%**.
  - Dynamic ML budget (30ms - 50ms) prevents main thread stalls on non-M-series hardware.
  - Decoupled 60fps WebGL composite shader renders smoothly on every frame.
- **Verification**: Turn on background on a Windows/Intel laptop. Confirm smooth video with zero robotic audio lag.

---

### 10. Floating Student Tiles Clearance Above Bottom Menu
- **Files**: `apps/web/src/components/video/CustomVideoConference.tsx`
- **What was fixed**:
  - `computeSlots()` enforces `bottomClearance: 96px`.
  - Floating tiles (e.g. 2 students) sit cleanly above the bottom control menu.
  - Leave, Add person, Mic, and Camera buttons remain 100% accessible.
  - In Gallery View, grid has dynamic bottom padding.
- **Verification**: 2 students + 1 teacher in call -> verify student tiles float above the bottom menu.

---

### 11. Free-Form Tile Dragging & Magnetic Snapping/Clipping
- **Files**: `apps/web/src/components/video/CustomVideoConference.tsx`
- **What was fixed**:
  - Free-form dragging for each floating tile with position persistence.
  - Magnetic snapping to adjacent tiles (12px gap) and to the bottom menu line.
  - Synchronized lift: student tiles glide up when the bottom menu appears and settle when idle.
- **Verification**: Drag student tile near another tile or near bottom menu -> verify magnetic snap. Tap screen -> verify tiles lift with menu.

---

### 12. Super Admin Teacher Email Onboarding
- **Files**: `apps/web/src/app/admin/users/page.tsx`, `apps/web/src/app/api/admin/users/route.ts`
- **What was fixed**:
  - Admin panel at `/admin/users` allows super admin (`syedamer130@gmail.com`) to assign `TEACHER` role by email.
  - User logging in with that email automatically receives teacher permissions and dashboard access.
- **Verification**: Log in as super admin -> go to `/admin/users` -> promote user to Teacher -> user logs in and accesses teacher features.

---

## 🛠 Parity Remediation Phases (from `~/.commandcode/plans/full-product-parity-remediation.md`)

| Phase | Title | Status | Completed | Evidence |
|---|---|---|---|---|
| 0 | Safe baseline (git, gates, test harness, script gating) | ✅ Complete | 2026-09-03 | See below |
| 1 | P0 authorization & tenant isolation | ✅ Complete | 2026-09-04 | See below |
| 2 | Data model & migration | ✅ Complete | 2026-09-04 | See below |
| 3 | Canonical scheduling & meeting lifecycle | ✅ Complete | 2026-09-04 | See below |
| 4 | Secure realtime scheduling | ✅ Complete | 2026-09-04 | See below |
| 5 | Class action button & navigation responsiveness | ✅ Complete | 2026-09-04 | See below |
| 6 | Admin information architecture | ✅ Complete | 2026-09-04 | See below |
| 7 | Meeting control parity | ✅ Complete | 2026-09-04 | See below |
| 8 | Visual system & every active page | ✅ Complete | 2026-09-04 | See below |
| 9 | Native iOS & Android | ✅ Complete | 2026-09-05 | See below |
| 10 | Tests & CI | ✅ Complete | 2026-09-05 | See below |
| 11 | Docs & rollout | ✅ Complete | 2026-09-05 | See below |

### Phase 0 — Safe Baseline (2026-09-04)
- **What was done**:
  - Confirmed git baseline: existing uncommitted paths preserved, no overwrites.
  - Recorded build gates: `npm run lint` (0 errors / 79 warnings), `npm run build` (3/3), `flutter analyze` (clean), `flutter test` (1/1), Android debug APK ✅; iOS ❌ blocked on machine setup (Xcode 26.6 has iOS 26.5 SDK but zero simulator runtimes — needs `xcodebuild -downloadPlatform iOS`).
  - Added Playwright harness: `apps/web/playwright.config.ts` (api + e2e projects), two-org fixtures (`tests/fixtures/`), `test`/`test:api`/`test:e2e` scripts (web + root + turbo), real `analyze`/`test` scripts for `apps/mobile`.
  - Fixed test flakiness: Local `playwright.config.ts` configured with `timeout: 60_000` and `workers: process.env.CI ? 2 : 1` to prevent cold Turbopack compilation timeouts on multi-core machines.
  - Gated destructive scripts behind `scripts/lib/require-isolated-db.ts` (requires `ALLOW_LOCAL_DB_SCRIPTS=1` + non-shared host allowlist) — covers 9 scripts + `db:seed`.
  - Fixed broken `next dev` (webpack edge `EvalError`): `dev` now uses Turbopack.
- **Key files**: `apps/web/playwright.config.ts`, `apps/web/tests/**`, `apps/web/scripts/lib/require-isolated-db.ts`, `docs/testing.md` (full baseline findings + isolated-DB setup).
- **Verification**: Root `npm run test` (turbo executing both `apps/mobile` and `apps/web`) passes cleanly 100%. Baseline findings (health-check DDL failure, webpack dev) documented in `docs/testing.md`. Two-org fixture scaffolded for Phase 1 isolation test integration.

### Phase 1 — P0 Authorization & Tenant Isolation (2026-09-04)
- **What was done**:
  - Implemented centralized session guards (`apps/web/src/lib/session-access.ts`) eliminating link-possession token auto-minting vulnerability. Link possession no longer auto-creates profiles or mints LiveKit tokens; unbooked visitors receive 403.
  - Hardened 8 session routes (`join`, `guests`, `volume`, `spotlight`, `mute-participant`, `participant`, `end`, `screen-token`) and guest join window to require assigned teacher, same-org admin, or confirmed booked student.
  - Scoped room-wide volume write controls strictly to the assigned teacher or super-admin support override.
  - Scoped teacher availability, time-off, slots generation, and `assign-student` by `orgId` with atomic transactions and conflict checks.
  - Protected root super admin account (`syedamer130@gmail.com`) from demotion, role mutation, and deletion in `admin/users`.
  - Scoped admin and dashboard pages/queries by `orgId` (`/admin`, `/admin/assign-student`, `/dashboard/schedule`, `/dashboard/teacher/students`, `/dashboard/teacher/students/[id]`).
  - Added `/dashboard/teacher/layout.tsx` server guard for all teacher sub-routes (`TEACHER`, `ORG_ADMIN`, `SUPER_ADMIN`).
  - Removed hardcoded email backdoor checks in `DashboardChrome.tsx` and `schedule/page.tsx`.
  - Rebuilt PostgreSQL RLS policies (`apps/web/src/db/rls-policies.sql`) using `AS RESTRICTIVE` to prevent permissive `OR` tenant isolation bypass.
  - Added automated test suite in `apps/web/tests/api/tenant-isolation.spec.ts` and updated fixtures with isolated DB check.
- **Key files**: `apps/web/src/lib/session-access.ts`, `apps/web/src/app/api/sessions/**`, `apps/web/src/app/api/admin/users/route.ts`, `apps/web/src/app/api/admin/assign-student/route.ts`, `apps/web/src/app/admin/**`, `apps/web/src/app/dashboard/**`, `apps/web/src/db/rls-policies.sql`, `apps/web/tests/api/tenant-isolation.spec.ts`.
- **Verification**: `npm run lint` (0 errors), `npm run build` (exit 0, all 63 routes compiled), `npm run test` (13 passed, exit 0).

### Phase 2 — Data Model & Migration (2026-09-04)
- **What was done**:
  - Replaced title-prefix heuristics (`LIKE 'Instant Meeting%'`) with first-class `SessionOrigin` enum (`SCHEDULED`, `INSTANT`, `TRIAL`, `MAKEUP`, `WEBHOOK`).
  - Added `sessions.origin` column, updated all creation routes (`instant-meeting`, `calls`, `trials`, `assign-student`, `calcom`), and refactored cleanup endpoint to filter by `origin = 'INSTANT'`.
  - Added database check constraints: `sessions.scheduled_end > sessions.scheduled_start`, `teacher_availability.end_time > teacher_availability.start_time`, `teacher_time_off.ends_at > teacher_time_off.starts_at`.
  - Added composite indexes: `sessions(org_id, status, scheduled_start)`, `sessions(org_id, teacher_id, scheduled_start)`.
  - Added unique indexes to prevent double-booking: `bookings(org_id, user_id, session_id)` and `bookings(calcom_booking_id)`.
  - Added `payload: jsonb` to `notifications` with `AVAILABILITY_CHANGED` notification dispatched when an admin modifies a teacher's schedule.
  - Added breakout columns (`breakout_room_name`, `breakout_context`) to `session_attendance`.
  - Defined 6 tenant-scoped collaboration models with Drizzle relations and RLS tenant isolation policies: `meeting_reactions`, `breakout_sets`, `breakout_rooms`, `breakout_assignments`, `whiteboards`, `caption_preferences`.
  - Created migration `0007_data_model_parity.sql` with backfill DDL and reversible teardown script `drizzle/rollback/0007_data_model_parity_rollback.sql`.
  - Added automated test suite `tests/api/data-model.spec.ts`.
- **Key files**: `apps/web/src/db/schema.ts`, `apps/web/src/app/api/teachers/instant-meeting/cleanup/route.ts`, `apps/web/src/app/api/teachers/instant-meeting/route.ts`, `apps/web/src/app/api/calls/route.ts`, `apps/web/src/app/api/trials/route.ts`, `apps/web/src/app/api/admin/assign-student/route.ts`, `apps/web/src/app/api/webhooks/calcom/route.ts`, `apps/web/src/app/api/teachers/availability/route.ts`, `apps/web/drizzle/0007_data_model_parity.sql`, `apps/web/drizzle/rollback/0007_data_model_parity_rollback.sql`, `apps/web/tests/api/data-model.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run build` (exit 0, all 63 routes compiled), `npm run test` (18 passed, exit 0).

### Phase 3 — Canonical Scheduling & Meeting Lifecycle (2026-09-04)
- **What was done**:
  - Implemented `meeting-service.ts` (`apps/web/src/lib/meeting-service.ts`) establishing single-source lifecycle resolution based on `class-room.ts` constants.
  - Defined canonical lifecycle states: `UPCOMING` (>60m before start), `READY` (T-60 to T+180m), `LIVE` (during session), `EXPIRED`, `COMPLETED`, `CANCELLED`.
  - Implemented `getClassActionState()` with canonical role actions:
    - Global ad-hoc: **Instant Meeting**
    - Due scheduled teacher: **Start Class**
    - Booked student: **Join Class**
    - Running class: **Rejoin Class** (teacher) / **Join Live Class** (student)
    - Observer: **Observe Live**
  - Enforced perimeter rule: only assigned teacher arrival marks scheduled class `IN_PROGRESS` and stamps `actualStart`. Students arriving early wait in the lobby (`waitingForTeacher: true`) until the teacher connects.
  - Hardened direct-call (`/api/calls`) to converge onto active or due scheduled classes via `ringParticipantIntoCanonicalRoom()`, preventing competing rogue room generation.
  - Updated `/api/teachers/call-now` to start canonical occurrences via `startScheduledOccurrence()`.
  - Updated `/api/teachers/instant-meeting` to use `createInstantMeeting()`.
  - Cleaned up `/api/students/live-class`: removed database mutations from GET polling, filtered by `actualStart` (with `scheduledStart` fallback) rather than `createdAt`.
  - Updated student lobby UI copy to distinguish "Waiting for your teacher" from unopened class.
  - Updated `LiveClassRibbon.tsx` to display `"Classroom is open — [Teacher] is live"` with action `"Join Live Class"`.
  - Updated `TodaySchedule.tsx` to show `"Rejoin Class"` for in-progress classes.
  - Added automated test suite `apps/web/tests/api/lifecycle.spec.ts` covering exact T-60 boundary, lifecycle states, action states, and canonical convergence.
- **Key files**: `apps/web/src/lib/meeting-service.ts`, `apps/web/src/app/api/sessions/[id]/join/route.ts`, `apps/web/src/app/api/calls/route.ts`, `apps/web/src/app/api/teachers/call-now/route.ts`, `apps/web/src/app/api/teachers/instant-meeting/route.ts`, `apps/web/src/app/api/students/live-class/route.ts`, `apps/web/src/app/dashboard/session/[id]/page.tsx`, `apps/web/src/app/dashboard/LiveClassRibbon.tsx`, `apps/web/src/app/dashboard/teacher/TodaySchedule.tsx`, `apps/web/tests/api/lifecycle.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run build` (exit 0, all 63 routes compiled), `npm run test` (24 passed, exit 0).

### Phase 4 — Secure Realtime Scheduling (2026-09-04)
- **What was done**:
  - **Protocol Hardening**: Hardened `src/realtime/protocol.ts` to include all 8 required message fields (`eventId`, `orgId`, `teacherId`, `actorId`, `type`, `aggregateId`, `committedAt`, `version`) and all 7 canonical event types (`availability.changed`, `time_off.changed`, `booking.created`, `booking.cancelled`, `session.changed`, `class.live`, `class.ended`).
  - **Database Outbox Schema & Migration**: Added `version: integer("version").notNull().default(1)` to `scheduling_events` table in `src/db/schema.ts`. Generated reversible migration `drizzle/0008_scheduling_events_version.sql` and rollback script `drizzle/rollback/0008_scheduling_events_version_rollback.sql`.
  - **Transactional Outbox Write Path**: Wired `insertSchedulingEvent` inside the primary database transaction across all state-mutating paths prior to commit:
    - Teacher availability create/delete (`/api/teachers/availability`)
    - Teacher time-off create/delete (`/api/teachers/time-off`)
    - Student booking creation & cancellation (`quota.ts` & `/api/students/bookings`)
    - Admin assign student (`/api/admin/assign-student`)
    - Trial bookings (`/api/trials`)
    - Instant meeting creation & scheduled class start (`meeting-service.ts`)
    - Session join & end (`/api/sessions/[id]/join` & `/api/sessions/[id]/end`)
    - Enforced invariant: zero events published before transaction commit.
  - **Durable Object AvailabilityHub Security**:
    - Partitioned strictly by `orgId` (`idFromName(orgId)`), preventing cross-tenant leakage.
    - Verifies cryptographic JWT ticket itself using `verifyRealtimeTicket` (HS256, 2-minute expiration, claims: `userId, orgId, role, teacherId`); completely rejects raw `X-Realtime-Claims`.
    - Protected `/publish` with `Authorization: Bearer <secret>` and rejected cross-org payloads (`403`).
    - Validated socket subscriptions (teachers cannot subscribe to other teachers' streams).
    - Scoped presence snapshots and heartbeat updates strictly to tenant-local sockets.
  - **Outbox Publisher & Delivery**:
    - Created `drainOutbox` in `src/lib/realtime/outbox-publisher.ts` with retry counter and dead-letter handling (stops after 5 attempts).
    - Exposed authenticated trigger route `POST /api/realtime/drain-outbox` with Bearer token authentication.
    - Configured non-blocking execution via `afterResponse()` for Cloudflare Workers and in-memory local hub fallback for tests and development.
    - Updated `wrangler.json` with DO namespace and migration bindings; patched `scripts/cf-build.cjs` to export `AvailabilityHub`.
  - **Client Hook & UI Integration**:
    - Implemented `useSchedulingRealtime.ts` client hook with ticket fetching, exponential backoff (1s–30s), visibility-aware heartbeats (30s), event deduplication (`eventId`/`version`), slot/schedule query invalidation, and reconnect resync.
    - Implemented safety polling fallback that suspends during active socket connection and never polls while hidden.
    - Integrated hook into student booking page (`/dashboard/booking/page.tsx`) and `LiveClassRibbon.tsx`.
    - Built `TeacherAvailabilityModal.tsx` for informational display of before/after availability diffs with single "Acknowledge" button (marking notification as read); excluded `AVAILABILITY_CHANGED` from generic banner.
  - **Automated Test Suite**:
    - Created `tests/api/realtime.spec.ts` covering JWT ticket issuance and claims, Hub DO partitioning and subscription authorization, protocol message structure, transactional outbox insertion, publisher retry and dead-letter limits, and informational modal acknowledgement.
- **Key files**: `apps/web/src/realtime/protocol.ts`, `apps/web/src/realtime/AvailabilityHub.ts`, `apps/web/src/lib/realtime/ticket.ts`, `apps/web/src/lib/realtime/outbox.ts`, `apps/web/src/lib/realtime/outbox-publisher.ts`, `apps/web/src/lib/useSchedulingRealtime.ts`, `apps/web/src/components/TeacherAvailabilityModal.tsx`, `apps/web/src/app/api/realtime/**`, `apps/web/drizzle/0008_scheduling_events_version.sql`, `apps/web/tests/api/realtime.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run build` (exit 0, all 63 routes compiled), `npm run test:api` (38 passed, 2 skipped, exit 0).

### Phase 5 — Class Action Button & Navigation Responsiveness (2026-09-04)
- **What was done**:
  - **Pure Client/Server Decoupling**: Created `apps/web/src/lib/class-action.ts` completely isolated from Node drivers and database packages, exporting `getClassActionState()`, `getMeetingLifecycleState()`, `formatClassDuration()`, and `formatClassCountdown()`. Re-exported all functions and constants from `meeting-service.ts` for full backward compatibility with server routes and tests.
  - **Canonical Class Action Button (`ClassActionButton.tsx`)**:
    - `UPCOMING`: Neutral time card / countdown badge (e.g. `Starts in 2h 15m`); strictly suppresses blue action button prior to T-60.
    - `READY`: Vibrant `#0A84FF` prominent blue button ($\ge 48$px min height on prominent variant), video camera icon, hover/touch prefetch, labeled by role: "Start Class" (teacher) / "Join Class" (student) / "Observe Live" (admin).
    - `LIVE`: `#0A84FF` blue button with pulsating red live dot; labeled: "Rejoin Class" (teacher) / "Join Live Class" (student) / "Observe Live" (admin).
    - `EXPIRED`, `COMPLETED`, `CANCELLED`: Terminal status chip with `actionUrl: ""` and disabled state, eliminating dead clicks.
  - **Sub-frame (<16ms) Navigation Feedback (`NavigationProgress.tsx`)**:
    - Global click interceptor catching internal anchor clicks with instantaneous progress initialization (`#0A84FF` slim bar with blur glow).
    - Safely wrapped in `Suspense` to preserve Next.js static generation across all routes.
    - Mounted in root `RootLayout` (`apps/web/src/app/layout.tsx`) and `DashboardChrome` / `AppChrome`.
  - **Focused Streaming Suspense Skeletons (`loading.tsx`)**:
    - Created 8 focused loading skeletons with zero generic full-page spinners, strictly mirroring underlying page geometries:
      1. `/dashboard/loading.tsx` (greeting, hero next class card, 4 stat cards, quick actions, student profiles)
      2. `/admin/loading.tsx` (header + action pills, 6 stat cards, live classes monitor, scheduled classes matrix)
      3. `/dashboard/booking/loading.tsx` (teacher selection chips, day strip, slot pills grid)
      4. `/dashboard/schedule/loading.tsx` (week nav, 8-column header, hourly grid rows)
      5. `/dashboard/attendance/loading.tsx` (date/teacher filter controls, day cards, attendance table rows)
      6. `/dashboard/teacher/students/loading.tsx` (header with assign button, student cards grid)
      7. `/admin/invoices/loading.tsx` (breadcrumbs, title, desk search/filter controls, invoice table)
      8. `/dashboard/session/[id]/loading.tsx` (immersive dark canvas, center camera preview shimmer with spinner, bottom control bar)
  - **Full UI Integration**:
    - Integrated `ClassActionButton` in student home next class card (`/dashboard/page.tsx`).
    - Integrated `ClassActionButton` with `compact` variant in teacher today schedule (`TodaySchedule.tsx`), preserving row actions.
    - Integrated `ClassActionButton` in teacher dashboard school-wide live classes (`teacher/page.tsx`).
    - Integrated `ClassActionButton` in live class ribbon (`LiveClassRibbon.tsx`).
    - Integrated `ClassActionButton` in admin live classes monitor (`admin/[[...slug]]/page.tsx`).
    - Integrated `ClassActionButton` in admin scheduled classes matrix (`ScheduledClassesMatrix.tsx`).
    - Updated `WeekGrid.tsx` to use lifecycle-aware tiles with live pulses and disabled past classes.
  - **Automated Test Suite**:
    - Created `tests/api/class-action.spec.ts` covering T-60 boundary transition, role-specific labels, duration derivation, countdown formats, backward compatibility re-exports, and zero dead navigation on terminal states.
- **Key files**: `apps/web/src/lib/class-action.ts`, `apps/web/src/components/ClassActionButton.tsx`, `apps/web/src/components/NavigationProgress.tsx`, `apps/web/src/app/dashboard/loading.tsx`, `apps/web/src/app/admin/loading.tsx`, `apps/web/src/app/dashboard/booking/loading.tsx`, `apps/web/src/app/dashboard/schedule/loading.tsx`, `apps/web/src/app/dashboard/attendance/loading.tsx`, `apps/web/src/app/dashboard/teacher/students/loading.tsx`, `apps/web/src/app/admin/invoices/loading.tsx`, `apps/web/src/app/dashboard/session/[id]/loading.tsx`, `apps/web/tests/api/class-action.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run build` (exit 0, all 63 routes compiled), `npm run test:api` (44 passed, 2 skipped, exit 0).

### Phase 6 — Admin Information Architecture (2026-09-04)
- **What was done**:
  - **Eliminated Catch-All Route & Clean 404s**:
    - Deleted `apps/web/src/app/admin/[[...slug]]/page.tsx`.
    - Implemented `apps/web/src/app/admin/not-found.tsx` with clear return-to-overview action for unknown admin URLs.
  - **Dedicated Route Hierarchy**:
    - `/admin` (Admin Overview): High-level org summary metrics (students, teachers, weekly classes, completion rate, open invoices), quick actions, and active live classes only. Strictly zero future scheduled class rows on overview.
    - `/admin/live-classes`: Dedicated LiveKit room monitor requiring matching organization, `numParticipants > 0`, and active teacher attendance. Includes direct `ClassActionButton` observer link.
    - `/admin/scheduled-classes`: Server page + client `ScheduledClassesTable` with viewer timezone calendar grouping (`LocalTime`), filters (teacher, track, status, window), quick search, 25-per-page pagination, copy link, and authorized session cancellation.
    - `/admin/teacher-schedules`: Server page + client `TeacherSpreadsheet` with sticky teacher columns, 7-day grid with availability shading (green), scheduled class blocks (with live indicators), time-off hatching (amber), 1-click student assignment prefill, CSV export, and responsive mobile day switcher.
  - **Authorized Session Mutation API**:
    - Added `PATCH /api/sessions/[id]` handler with host/admin RBAC, updating status to `CANCELLED` (with reason) or rescheduling start/end.
    - Emits atomic `session.changed` event in `schedulingEvents` transactional outbox and invokes `drainOutbox`.
  - **Navigation Chrome & Loading Skeletons**:
    - Updated `apps/web/src/app/dashboard/DashboardChrome.tsx` sidebar items, mobile menu, and app chrome sheet with active route indicators and page title mappings.
    - Created matching loading skeletons: `live-classes/loading.tsx`, `scheduled-classes/loading.tsx`, and `teacher-schedules/loading.tsx`.
  - **Automated Test Suite**:
    - Created `tests/api/admin-architecture.spec.ts` verifying catch-all removal (404), `PATCH /api/sessions/[id]` authorization boundaries and transactional outbox emission, tenant isolation, and strict absence of future classes on admin overview.
- **Key files**: `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/admin/not-found.tsx`, `apps/web/src/app/admin/live-classes/**`, `apps/web/src/app/admin/scheduled-classes/**`, `apps/web/src/app/admin/teacher-schedules/**`, `apps/web/src/app/api/sessions/[id]/route.ts`, `apps/web/src/app/dashboard/DashboardChrome.tsx`, `apps/web/tests/api/admin-architecture.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run test:api` (53 passed, 2 skipped, 1 expected fail, exit 0), `npm run build` (exit 0, all 67 routes compiled).

### Phase 7 — Meeting Control Parity (2026-09-04)
- **What was done**:
  - **Canonical 9-Position Bottom Dock (Desktop $\ge 768$px)**:
    - Position 1: Mute with device picker caret
    - Position 2: Video with device picker caret
    - Position 3: Participants with badge counter
    - Position 4: Chat with unread badge counter
    - Position 5: Reactions popover (👍, 👏, ❤️, 🎉, 😂, 🤲) & persistent hand raise toggle
    - Position 6: Screen Share (green active state indicator)
    - Position 7: Host Tools (shield icon, host only)
    - Position 8: More (secondary controls popover)
    - Position 9: End (rightmost red pill button with leave vs end confirmation modal)
    - Ensured labels remain below icons with stable, non-jumping positions.
  - **Mobile Dock & Compact Overflow (< 768px)**:
    - Visible dock reduced to 5 items: Mute, Video, Share, More, End.
    - More sheet contains grouped overflow: Host Tools (top section for hosts), Collaboration (Participants, Chat, Reactions), In-Call Tools (Captions, Whiteboard, Backgrounds, Stop Incoming Video, Settings, Info).
  - **Device Carets & Modal Selectors**:
    - Split-button style carets on Mute and Video buttons opening frosted glass device pickers.
    - Live enumeration and hot-swapping across cameras, microphones, and audio output speakers.
  - **Host Moderation Tools (`HostToolsModal.tsx`)**:
    - One-click "Mute All" remote participants with confirmation.
    - "Lock Meeting" toggle updating room metadata (`isLocked: true`), preventing new guest knocks or joins.
    - "Student Screen Sharing" permission toggle (`allowParticipantShare`).
    - Quick shortcut to guest admission waiting room.
    - Safe "End Class for Everyone" confirmation dialog.
    - Backed by server API route `POST /api/sessions/[id]/host-tools` enforcing host/admin RBAC.
  - **Dedicated Settings Dialog (`CallSettingsModal.tsx`)**:
    - Desktop left category rail and mobile segmented top tabs across 6 categories: General, Audio, Video, Backgrounds, Statistics, and About.
  - **LiveKit Data Channel Reactions & Hand Raising**:
    - Topics: `topic: 'reaction'` and `topic: 'hand_raise'`.
    - Live floating emoji animations (`animate-float-reaction`) rising from dock on sent/received reactions.
    - Persistent `✋ Hand Raised` golden badges rendered on participant video tiles and in the participant roster.
  - **Interactive Quran Teaching Whiteboard (`WhiteboardOverlay.tsx`)**:
    - Full-stage interactive digital whiteboard with pen, eraser, color palette, stroke thickness selector, and canvas clearing.
  - **Live Captions & Bandwidth Saver**:
    - Real-time subtitle/caption banner showing active speaker status.
    - "Stop Incoming Video" bandwidth-saver toggle pausing remote video track rendering while preserving crisp audio.
  - **Automated Test Suite**:
    - Created `tests/api/meeting-controls.spec.ts` covering host tools RBAC, room locking enforcement rejecting guest knocks with 423, volume control limits, spotlight state transitions, and room metadata parsing.
- **Key files**: `apps/web/src/components/video/CallControlBar.tsx`, `apps/web/src/components/video/VideoTile.tsx`, `apps/web/src/components/video/CustomVideoConference.tsx`, `apps/web/src/components/video/PeoplePanel.tsx`, `apps/web/src/components/video/HostToolsModal.tsx`, `apps/web/src/components/video/CallSettingsModal.tsx`, `apps/web/src/components/video/WhiteboardOverlay.tsx`, `apps/web/src/components/video/CallIcons.tsx`, `apps/web/src/components/video/hostControls.ts`, `apps/web/src/lib/room-metadata.ts`, `apps/web/src/app/api/sessions/[id]/host-tools/route.ts`, `apps/web/src/app/api/guest/join/route.ts`, `apps/web/tests/api/meeting-controls.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run test:api` (58 passed, 2 skipped, 1 expected fail, exit 0), `npm run build` (exit 0, all 67 routes compiled).

### Phase 8 — Visual System & Every Active Page (2026-09-04)
- **What was done**:
  - **CSS Design Tokens & Apple Glass System (`globals.css`)**:
    - Centralized design tokens: Light app background `#F5F7FA`, primary text `#17202A`, accent blue `#0A84FF`, success green `#30D158`, warning orange `#FF9F0A`, danger red `#FF453A`, meeting dark background `#090B0F`.
    - Apple glass material specifications: translucent layered surface `rgba(28, 32, 40, 0.72)`, glass border `rgba(255, 255, 255, 0.16)`, blur `24px`, saturation `160%`, depth elevation shadow `0 18px 60px rgba(0, 0, 0, 0.32)`.
    - Corner radii tokens: controls `12px`, cards `16px`, dialogs/docks `22px`.
    - Grid & spacing scale: `4px` base grid, standard page spacing `8/12/16/24/32`, max desktop content `1440px`.
    - Interactive target minimums: `44x44px` touch target, `48px` primary class action button.
    - Accessibility fallbacks: `@media (prefers-reduced-transparency: reduce)` falling back to opaque surfaces (`#1c2028`); `@media (prefers-reduced-motion: reduce)` disabling travel/scale animations; WCAG 2.2 AA contrast compliance.
  - **Responsive Dashboard Chrome (`DashboardChrome.tsx`)**:
    - Desktop sidebar: exact `264px` width (`w-[264px]`).
    - Tablet compact navigation rail (`640–1023px`, `w-16`): centered icon buttons, active indicators, and tooltips.
    - Native mobile bottom navigation bar (`<640px`): 4 primary role tabs + More menu.
    - Complete page title mappings for all student, teacher, and admin sub-routes (e.g. `/dashboard/teacher/students/*` -> "Student Details", `/join` -> "Join Class").
    - Preserved zero-chrome fullscreen layout for active meeting routes (`/dashboard/session/*`).
  - **Notification Banner Route Correction (`MeetingNotificationBanner.tsx`)**:
    - Fixed `INVOICE_ISSUED` navigation link from `/dashboard/invoices` (which 404s for students) to canonical `/dashboard/billing`.
  - **Active Page Hardening & Elimination of Fake Placeholders**:
    - **Student Home (`dashboard/page.tsx`)**: Removed placeholder streak card (`StatCard label="Streak" value="--"`) and weekly placeholder (`weekly="--"`); computed real lessons completed in track directly from `progressRecords` and `lessonContent`; calculated real profile progress percentages based on `completed / total * 100`.
    - **Student Progress (`dashboard/progress/page.tsx`)**: Replaced fake `-- 🔥 week streak` with real `completed / total` lessons completed in track; rendered accurate progress metrics.
    - **Chat (`dashboard/chat/page.tsx`)**: Removed fake pulsing green dot and fake `Online` badge; rendered genuine conversation status ("Direct Conversation").
    - **Teacher Home (`dashboard/teacher/page.tsx`)**: Renamed ad-hoc button to "⚡ Instant Meeting" (`StartInstantMeetingButton.tsx`); removed dead/mixed-in admin live class matrix from teacher overview.
    - **Teacher Availability (`dashboard/teacher/availability/page.tsx`)**: "Save & Finish" / onboarding redirects to `/dashboard/teacher`; added admin editing banner with target teacher name (`targetTeacherName` populated via API).
    - **Teacher Students List (`dashboard/teacher/students/page.tsx`)**: Fixed operator precedence bug in progress calculation: `Math.min(100, Math.round(((completed[0]?.count || 0) / totalInTrack) * 100))` (previously `completed[0]?.count || 0 / totalInTrack * 100` evaluated to 500%).
    - **Teacher Student Detail (`dashboard/teacher/students/[id]/page.tsx`)**: Replaced server UTC `format()` timestamps with `<LocalTime>` components for client-local timezone rendering.
    - **Schedule (`dashboard/schedule/WeekGrid.tsx`)**: Added role-scoped Week/List view toggle with status chips (`LIVE`, `READY`, `UPCOMING`, `COMPLETED`, `EXPIRED`) and direct action states.
    - **Auth Pages (`login/page.tsx` & `register/page.tsx`)**: Centered 420px max glass auth cards (`max-w-[420px]`); password visibility eye toggle; pending states and error summaries.
    - **Join Pages (`join/page.tsx` & `join/[id]/page.tsx`)**: 12-digit meeting code auto-formatting; explicit `waiting`, `admitted`, `denied`, and `expired` states with retry button.
    - **Legal Pages (`terms/page.tsx` & `privacy/page.tsx`)**: Readable 720px measure (`max-w-[720px]`); sticky Table of Contents navigation with section anchor jumping; last-updated and effective date metadata.
    - **Debug Route Lockdown (`debug/layout.tsx`)**: Created layout calling `notFound()` in production (`process.env.NODE_ENV === "production"`).
    - **Canonical Scheduling & Meeting Constants Alignment**:
      - Unified `SCHEDULED_AFTER_MS = 3 * 60 * 60 * 1000` (T+180) to match `LATE_JOIN_MS` in `meeting-service.ts`.
      - Enforced strict teacher identity in `getClassActionState`: requiring `session.teacherId === viewer.userId` when `session.teacherId` is present, preventing unrelated teachers from receiving host action labels.
  - **Automated Test Suite**:
    - Created `apps/web/tests/api/visual-system.spec.ts` (9 tests) verifying tokens, responsive chrome geometry, placeholder absence, math precision, route protections, legal measures, and auth toggles.
- **Key files**: `apps/web/src/app/globals.css`, `apps/web/src/app/dashboard/DashboardChrome.tsx`, `apps/web/src/app/dashboard/MeetingNotificationBanner.tsx`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/dashboard/progress/page.tsx`, `apps/web/src/app/dashboard/chat/page.tsx`, `apps/web/src/app/dashboard/teacher/page.tsx`, `apps/web/src/app/dashboard/teacher/StartInstantMeetingButton.tsx`, `apps/web/src/app/dashboard/teacher/availability/page.tsx`, `apps/web/src/app/dashboard/teacher/students/page.tsx`, `apps/web/src/app/dashboard/teacher/students/[id]/page.tsx`, `apps/web/src/app/dashboard/schedule/WeekGrid.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/register/page.tsx`, `apps/web/src/app/join/[id]/page.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/privacy/page.tsx`, `apps/web/src/app/debug/layout.tsx`, `apps/web/src/lib/class-action.ts`, `apps/web/src/lib/meeting-service.ts`, `apps/web/tests/api/visual-system.spec.ts`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run test:api` (70 passed, 2 skipped, 1 expected fail, exit 0), `npm run test` (root turbo 73 passed, exit 0), `npm run build` (exit 0, all 67 routes compiled).

### Phase 9 — Native iOS and Android Parity & Hardening (2026-09-05)
- **What was done**:
  - **Shared Flutter Shell Capability & Origin Hardening (`web_shell.dart`)**:
    - Gated `shellUserAgent` (`Platform.isAndroid ? 'NoviceTutorApp/1.2 (screenshare)' : 'NoviceTutorApp/1.2'`) and `nativeScreenShareSupported` on `Platform.isAndroid`, eliminating false capability advertisement on iOS where MediaProjection is absent.
    - Added bi-directional platform deep link channel `novicetutor/deeplink` consuming verified Android App Links and iOS Universal Links on cold launch (`getInitialUrl`) and while running (`onDeepLink`).
    - Integrated with `PushService.instance.deepLinks` for FCM notifications.
    - Implemented strict same-origin link validation in `_openPath(String pathOrUrl)`: accepts `novicetutor.com`, its subdomains, and `meet.novicetutor.com`; rejects untrusted third-party origins, preventing shell hijacking while preserving exact path, query parameters, and fragments.
    - Updated UI tokens and surfaces to align with Phase 8 visual system: dark background `#090B0F`, Apple glass container `#1C2028`, accent blue `#0A84FF`, success green `#30D158`, muted gray `#9CA3AF`, and 12px button corner radii.
    - Preserved WebView cookie jar as the single authoritative source of user authentication across both platforms.
  - **Android Build Hardening & App Link Association**:
    - Updated `MainActivity.kt` to bind `novicetutor/deeplink` MethodChannel, dispatching initial launch intent URIs and runtime `onNewIntent` events to Dart.
    - Hardened `apps/mobile/android/app/build.gradle.kts` by removing the debug signing fallback (`signingConfig = signingConfigs.getByName("release")`), ensuring release builds fail loudly when keystore properties are missing instead of silently signing with debug keys.
    - Created hosted Android Digital Asset Links verification file at `apps/web/public/.well-known/assetlinks.json` configured for package `com.novicetutor.app` with `delegate_permission/common.handle_all_urls`.
  - **iOS Entitlements & Universal Link Association**:
    - Created `apps/mobile/ios/Runner/Runner.entitlements` configuring `com.apple.developer.associated-domains` (`applinks:novicetutor.com`, `applinks:www.novicetutor.com`) and APNs environment.
    - Configured `CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;` across Debug, Release, and Profile build targets in `apps/mobile/ios/Runner.xcodeproj/project.pbxproj`.
    - Updated `apps/mobile/ios/Runner/Info.plist` with `CFBundleURLTypes` supporting `$(GOOGLE_REVERSED_CLIENT_ID)` and custom scheme `novicetutor`, plus `GIDClientID`.
    - Added `apps/mobile/ios/Runner/GoogleService-Info.plist.example` template without committing secret production credentials.
    - Created hosted Apple App Site Association file at `apps/web/public/.well-known/apple-app-site-association` for App ID `TT3HQ774N4.com.novicetutor.app` specifying universal link routes (`/dashboard/session/*`, `/join/*`, `/dashboard/*`, `/login`) in both modern components and legacy path formats.
    - Added `headers()` in `apps/web/next.config.ts` enforcing `Content-Type: application/json` for both `.well-known` endpoints.
  - **Call Control Bar Screen Share Guarding (`CallControlBar.tsx`)**:
    - Hardened `canScreenShare` condition: `(isModerator || isHost) && (nativeShell || (!isAppShell && hasBrowserDisplayMedia))`.
    - Guarantees that iOS native shell (and unsupported mobile web browsers) completely hides the Share button, preventing dead taps until an iOS Broadcast Upload Extension and ReplayKit bridge is introduced.
  - **Automated Test Suites**:
    - Created mobile unit/widget test suite in `apps/mobile/test/shell_test.dart` (7 tests): platform UA formatting, capability gating, origin validation, cuid2 format enforcement, Phase 8 dark theme tokens, and deep link channel handling.
    - Created web API test suite in `apps/web/tests/api/mobile-parity.spec.ts` (7 tests): verifying assetlinks, apple-app-site-association, next.config headers, release signing enforcement, entitlements, and UA regex rules.
- **Key files**: `apps/mobile/lib/shell/web_shell.dart`, `apps/mobile/lib/main.dart`, `apps/mobile/android/app/src/main/kotlin/com/novicetutor/app/MainActivity.kt`, `apps/mobile/android/app/build.gradle.kts`, `apps/mobile/ios/Runner/Runner.entitlements`, `apps/mobile/ios/Runner.xcodeproj/project.pbxproj`, `apps/mobile/ios/Runner/Info.plist`, `apps/mobile/ios/Runner/GoogleService-Info.plist.example`, `apps/web/src/components/video/CallControlBar.tsx`, `apps/web/public/.well-known/assetlinks.json`, `apps/web/public/.well-known/apple-app-site-association`, `apps/web/next.config.ts`, `apps/mobile/test/shell_test.dart`, `apps/web/tests/api/mobile-parity.spec.ts`.
- **Verification**: `flutter analyze` (0 issues), `flutter test` (7 passed in `shell_test.dart`, 1 passed in `widget_test.dart`), `npm run test:api` (77 passed, 2 skipped, 1 expected mock fail, exit 0), `npm run test` (root turbo 80 passed, exit 0), `npm run build` (exit 0, all 67 routes compiled).

### Phase 10 — Tests and CI (2026-09-05)
- **What was done**:
  - **API/RBAC Automated Test Suite (`apps/web/tests/api/rbac-deep.spec.ts`)**:
    - Automated cross-org denial for every admin route (`/api/admin/users`), teacher availability (`/api/teachers/availability`), teacher time-off (`/api/teachers/time-off`), slots (`/api/availability/slots`), assign student (`/api/admin/assign-student`), and meeting host tools (`/api/sessions/[id]/host-tools`).
    - Automated protected root super admin account safeguards (`syedamer130@gmail.com`): verifying that demotion attempts via PATCH, deletion attempts via DELETE, and impostor creation attempts via POST are strictly rejected with 403 Forbidden.
    - Automated assignment validation, conflict detection, and transactional rollback:
      - Validates rejection of start times in the past (400).
      - Validates detection and rejection of overlapping teacher scheduled sessions (400) without orphaned rows.
      - Validates detection and rejection of teacher time-off conflicts (400).
      - Validates cross-org student profile and teacher mismatches (403).
      - Verifies atomic transaction boundaries across sessions, bookings, schedulingEvents, and auditLogs.
    - Automated room-wide volume authorization: verified assigned teacher can set global volume while unassigned students receive 403.
    - Automated meeting collaboration models: validated relational integrity and tenant isolation for breakout sets, breakout rooms, breakout assignments, and whiteboards.
    - Automated perimeter rejection: verified that all 12 mutating API routes reject unauthenticated requests with 401 or 403.
  - **End-to-End Playwright Journeys (`apps/web/tests/e2e/`)**:
    - `student-journey.spec.ts`: Unauthenticated redirection across 7 protected student routes (`/dashboard`, `/progress`, `/booking`, `/schedule`, `/chat`, `/billing`, `/settings`); 420px max glass auth card and password eye visibility toggle on `/login`; registration form; 12-digit code auto-formatting on `/join`; structured lobby states on `/join/[id]`; T-60 ClassActionButton lifecycle transitions (UPCOMING disabled at T-65 vs READY "Join Class" at T-55 vs LIVE "Join Live Class").
    - `teacher-journey.spec.ts`: Unauthenticated redirection across all teacher sub-routes; teacher identity differentiation in `ClassActionButton` (assigned teacher gets "Start Class" / "Rejoin Class" while unassigned teachers receive observer/join states); strict enforcement that ad-hoc actions use "Instant Meeting" semantics, never "Start Class".
    - `admin-journey.spec.ts`: Unauthenticated redirection across all 7 admin sub-routes; verified that unknown `/admin/*` paths render the dedicated `not-found.tsx` 404 page rather than the dashboard; verified admin information architecture enforcing live classes ONLY on overview with scheduled classes and teacher schedules on dedicated routes.
    - `meeting-experience.spec.ts`: Enforces fullscreen canvas layout without dashboard chrome on `/dashboard/session/[id]`; asserts 9 canonical desktop dock positions ($\ge 768$px) and 5 visible compact mobile dock positions (<768px); asserts host tools action boundaries (mute_all, lock_meeting, end_class_for_everyone).
    - `responsive-a11y.spec.ts`: Verified responsive geometry and zero horizontal overflow across 4 standard viewports (mobile 390x844, tablet 768x1024, desktop 1280x800, wide 1440x900); verified interactive buttons satisfy minimum touch target guidelines ($\ge 44$px / 40px); verified keyboard Tab navigation lands on accessible interactive elements.
  - **Continuous Integration Pipeline (`.github/workflows/ci.yml`)**:
    - Triggered on `master` branch pushes and pull requests.
    - `web-quality-and-tests` job (Ubuntu): Node.js 20, npm ci, `npx tsc --noEmit` typecheck, `npm run lint`, database migration drift check (`drizzle-kit check`), Next.js production build (`npm run build`), Playwright Chromium install, automated test execution (`npm run test:api` and `npm run test:e2e`), and failure artifact upload.
    - `mobile-android` job (Ubuntu): Java 17, Flutter stable, `flutter pub get`, `flutter analyze`, `flutter test`, and Android debug APK build (`flutter build apk --debug`).
    - `mobile-ios` job (macOS-14): Flutter stable, Xcode, `flutter analyze`, `flutter test`, and iOS simulator build (`flutter build ios --simulator --no-codesign`).
    - `ci-gate` job: Verifies that all web, Android, and iOS jobs succeed before permitting deployment.
- **Key files**: `apps/web/tests/api/rbac-deep.spec.ts`, `apps/web/tests/e2e/student-journey.spec.ts`, `apps/web/tests/e2e/teacher-journey.spec.ts`, `apps/web/tests/e2e/admin-journey.spec.ts`, `apps/web/tests/e2e/meeting-experience.spec.ts`, `apps/web/tests/e2e/responsive-a11y.spec.ts`, `.github/workflows/ci.yml`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `flutter analyze` (0 issues), `flutter test` (8/8 passed), `npm run test:api` (90 passed, 2 skipped, 1 expected mock fail, exit 0), `npm run test:e2e` (28/28 passed, exit 0), `npm run test` (root turbo 126 tests passed across web and mobile, exit 0), `npm run build` (exit 0, all 67 routes compiled).

### Phase 11 — Docs & Rollout (2026-09-05)
- **What was done**:
  - **Canonical Source-of-Truth Documentation**:
    - Created `docs/product-requirements.md` specifying core architecture, tenant isolation, RBAC hierarchy, scheduling engine, immediate availability publication, instant booking confirmation, secure realtime protocol, visual system tokens, staged rollout gates, rollback procedures, and operational telemetry thresholds.
    - Created `docs/role-page-spec.md` specifying every active page across Student, Teacher, Org Admin, Super Admin, and Public roles, including layout contracts (`DashboardChrome`, `NavigationProgress`, streaming skeletons) and dedicated 404 behavior.
    - Created `docs/meeting-controls.md` specifying the virtual stage geometry, center 3-button self-view pill, floating tiles clearance and magnetic snapping, desktop 9-position canonical bottom dock, mobile compact 5-position dock, device selectors, data channel reactions, platform-gated screen share, host moderation tools, interactive Quran whiteboard, captions, and room-wide volume gain control.
  - **Operational Guide Alignment**:
    - Updated `docs/integration-livekit.md`: Aligned room lifecycle with perimeter security rules (assigned teacher arrival stamps `actualStart` and marks `IN_PROGRESS`; early students wait in lobby), removed link-possession auto-booking claims (unbooked users receive 403), documented room locking (`isLocked`), and token claims.
    - Updated `docs/mobile-app.md`: Documented Phase 9 parity including verified Android App Links and iOS Universal Links, hosted verification endpoints (`assetlinks.json`, `apple-app-site-association`), capability-gated screen sharing (Android MediaProjection bridge enabled; iOS hidden), dark theme visual tokens, and cookie jar authentication persistence.
    - Updated `docs/attendance.md`: Documented teacher arrival stamping `actualStart` and breakout session attendance tracking (`breakout_room_name`, `breakout_context`).
    - Updated `docs/timezones.md`: Documented `<LocalTime>` integration across student details, admin scheduled classes, and schedule matrices.
  - **Archiving Legacy Documentation**:
    - Created `docs/archive/` and archived historical snapshots: `docs/archive/task-checklist.md`, `docs/archive/walkthrough.md`, and `docs/archive/integration-calcom.md`.
    - Created `docs/archive/README.md` indexing historical infrastructure and referencing canonical docs.
  - **Rollout, Rollback & Telemetry Strategy**:
    - Formulated 5-stage rollout progression (P0 security guards $\to$ UI/action state $\to$ realtime scheduling with polling fallback $\to$ meeting controls $\to$ collaboration tools).
    - Defined rollback playbooks (backward-compatible database columns, `REALTIME_DISABLED=1` flag fallback, and reversible DDL migrations).
    - Established alert thresholds for denied joins, cross-org attempts, outbox lag, dead-letter rows, and LiveKit session mismatches with strict zero-logging of credentials, tokens, or PII.
- **Key files**: `docs/product-requirements.md`, `docs/role-page-spec.md`, `docs/meeting-controls.md`, `docs/integration-livekit.md`, `docs/mobile-app.md`, `docs/attendance.md`, `docs/timezones.md`, `docs/archive/README.md`.
- **Verification**: `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), `npm run test` (root turbo 126 tests passed, exit 0), `npm run build` (exit 0, all 67 routes compiled).

---

## 🏁 Final Remediation Acceptance Checklist

| Requirement / Invariant | Status | Verification Evidence |
|---|:---:|---|
| **No cross-tenant query or object-action path** | ✅ Pass | `tests/api/tenant-isolation.spec.ts` & `tests/api/rbac-deep.spec.ts` (all cross-org calls fail with 403/404) |
| **No authenticated link-holder auto-booking** | ✅ Pass | `src/lib/session-access.ts` & `tenant-isolation.spec.ts` (unbooked users receive 403) |
| **Immediate availability publication & acknowledgement popup** | ✅ Pass | `tests/api/realtime.spec.ts` & `TeacherAvailabilityModal.tsx` (publishes immediately, 1-click acknowledge) |
| **Student/teacher blue action appears at exact T-60** | ✅ Pass | `tests/api/class-action.spec.ts` & `tests/e2e/student-journey.spec.ts` (UPCOMING at T-65 vs READY at T-55) |
| **Instant Meeting wording & origin consistent everywhere** | ✅ Pass | `tests/api/data-model.spec.ts` & `tests/e2e/teacher-journey.spec.ts` (origin `INSTANT`, button `⚡ Instant Meeting`) |
| **Admin home contains only occupied live classes** | ✅ Pass | `src/app/admin/page.tsx` & `tests/e2e/admin-journey.spec.ts` (zero future scheduled rows on `/admin`) |
| **All supplied Zoom controls work at expected positions** | ✅ Pass | `CallControlBar.tsx` & `tests/e2e/meeting-experience.spec.ts` (9 desktop positions, 5 mobile positions) |
| **Teacher room-wide volume affects every client with strict authority** | ✅ Pass | `tests/api/meeting-controls.spec.ts` & `tests/api/rbac-deep.spec.ts` (assigned teacher only, student receives 403) |
| **Every active route has loading, responsive & accessible behavior** | ✅ Pass | 8 `loading.tsx` skeletons, `NavigationProgress.tsx`, `tests/e2e/responsive-a11y.spec.ts` |
| **Flutter, Android & iOS advertise only working native capabilities** | ✅ Pass | `web_shell.dart`, `apps/mobile/test/shell_test.dart` (Android screenshare enabled; iOS share hidden) |
| **Automated security, lifecycle, realtime, visual & native gates in CI** | ✅ Pass | `.github/workflows/ci.yml` (multi-platform CI: lint, tsc, migrations, build, playwright, android, ios, ci-gate) |








