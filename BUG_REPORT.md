# NoviceTutor Bug Report & Resolution Matrix

**Last Updated**: 2026-08-26  
**Build Status**: Passing (`npm run build` — 63/63 routes compiled)  
**Live Target**: `https://novicetutor.com` (Cloudflare OpenNext)

---

## 1. Summary of Bug Reports

| ID | Title | Severity | Area | Status | Key Files |
|---|---|---|---|---|---|
| **BUG-001** | Cloudflare Worker Error 1102 (CPU Limit) | Critical | Cloudflare / Edge SSR | Mitigated / Monitored | `apps/web/src/lib/db.ts`, `next.config.js` |
| **BUG-002** | Virtual Background 144p Pixelation & Edge Jitter | High | WebRTC / WebGL | ⚠️ Active / Re-investigating | `glPipeline.ts`, `SmoothBackgroundTransformer.ts` |
| **BUG-003** | Host Required to Click "Admit" Twice for Guests | High | Guest Join / Knock API | Resolved | `GuestKnockPrompt.tsx`, `/api/sessions/[id]/guests/route.ts` |
| **BUG-004** | Accessing Completed / Cancelled Sessions | High | Session Auth / Join | Resolved | `/api/guest/join/route.ts`, `/api/sessions/[id]/join/route.ts` |
| **BUG-005** | Solo Session Kept Alive Indefinitely (Idle Leak) | Medium | LiveKit / Room Lifecycle | Resolved | `SoloInactivityPrompt.tsx`, `/api/sessions/[id]/end/route.ts` |
| **BUG-006** | Accidental Swipe-Back Navigates Out of Class | Medium | Mobile Safari / Android | Resolved | `LiveKitRoom.tsx` (popstate trap) |
| **BUG-007** | Teacher Availability 324-Slot Grid Overwhelm | Medium | UI / Scheduling | ⚠️ Active / Re-investigating | `apps/web/src/app/dashboard/teacher/availability/page.tsx` |
| **BUG-008** | Admin Panel UI Aesthetic Disconnected from App | Medium | Admin UI / CRM | Resolved | `apps/web/src/app/admin/users/`, `apps/web/src/app/admin/invoices/` |

---

## 2. Detailed Bug Breakdown & Notes

### BUG-002: Virtual Background Replacement & Pixelation Issue
- **Current Status**: ⚠️ Active / Open (User testing indicates issue persists).
- **What Was Attempted**:
  1. Pre-scaled MediaPipe input frames to `256x144` before segmentation upload to prevent main-thread stalls and avoid WebRTC `QualityScaler` triggering CPU degradation down to 144p.
  2. Set `gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)` for WebGL single-channel (`R8`) textures to fix 4-byte diagonal texture skewing.
  3. Added exponential moving average temporal filter (`temporalBlend = 0.15`) with cubic noise-rejection gate in `glPipeline.ts` shader.
  4. Adjusted blur downscale factor to 2 with linear interpolation.
- **Problem Observed**: Background replacement still not showing desired quality or failing to apply cleanly on target devices.
- **Next Steps for Incoming AI**:
  - Check `SmoothBackgroundTransformer.ts` pipeline registration inside LiveKit room.
  - Verify whether `@livekit/track-processors` default processor is colliding or overriding custom `glPipeline.ts`.
  - Verify WebGL context creation and canvas sizing in iOS Safari / iPad WebViews.
  - Test raw video stream constraints vs processed canvas video track replacement.

---

### BUG-007: Teacher 24-Hour Availability Grid Overwhelm
- **Current Status**: ⚠️ Active / Open (User reports availability behavior still unchanged / not meeting requirements).
- **What Was Attempted**:
  1. Built Quick Schedule section with Start/End time pickers across 24 hours (`00:00` - `23:30`) and batch recurrence buttons (`Monday – Friday`, `Monday – Saturday`, `Everyday`).
  2. Hidden full 7x48 matrix behind "Custom Mode" toggle.
  3. Added YouTube-style pop animation (`@keyframes youtubeLike`) with emerald glow on tile selection.
  4. Wired DB persistence to `teacher_availability` table via `/api/teachers/availability`.
- **Problem Observed**: User reports availability grid behavior is still the same or not displaying the expected clean default workflow in production.
- **Next Steps for Incoming AI**:
  - Inspect teacher availability page (`/dashboard/teacher/availability/page.tsx`) state hydration.
  - Check whether initial fetch populates old pre-existing slots and overrides default empty state.
  - Ensure clear distinction between viewing existing schedule vs editing with quick recurrence.
  - Validate mobile responsive layout and timezone sync.

---

### BUG-001: Cloudflare Worker Error 1102 (Worker Exceeded Resource Limits)
- **Status**: Mitigated / Monitored.
- **Action**: Dynamic edge routes utilize stateless HTTP DB client (`withHttpDb`). Heavy client libraries excluded from server bundles.

---

### BUG-003: Host Double "Admit" Click Bug for Guest Entry
- **Status**: Resolved.
- **Action**: `/api/sessions/[id]/guests/route.ts` bulk-updates all duplicate pending knocks for guest name to `ADMITTED`. `GuestKnockPrompt.tsx` deduplicates state immediately.

---

### BUG-004: Deny Join to Completed / Cancelled Meetings
- **Status**: Resolved.
- **Action**: Strict `status` checks in `/api/guest/join` and `/api/sessions/[id]/join` returning 403 Forbidden.

---

### BUG-005: Solo Inactivity Idle Resource Leak
- **Status**: Resolved.
- **Action**: `SoloInactivityPrompt.tsx` displays 60s warning modal after 30m idle, auto-ending call if unconfirmed.

---

### BUG-006: Accidental Mobile Back-Button / Swipe-Back Navigation
- **Status**: Resolved.
- **Action**: `usePreventBackNavigation()` in `LiveKitRoom.tsx` traps history `popstate`.

---

### BUG-008: Admin Panel UI Disconnect (Twenty CRM Integration)
- **Status**: Resolved.
- **Action**: Integrated Twenty CRM table components, initial avatars, status badges, calculation footer, and slide-over detail drawer in `/admin`.

---

## 3. Verification & Test Status
- `npm run build`: ✅ 63/63 routes compiled with 0 errors.
- `npx eslint --quiet .`: ✅ 0 errors.
- `npx tsx scripts/test-admin-and-availability.ts`: ✅ Passed.
