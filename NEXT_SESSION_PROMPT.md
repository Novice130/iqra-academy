# Handoff Instructions for Incoming AI Session

Please continue working on the **NoviceTutor / Quran LMS** project. Read `BUG_REPORT.md` and `BACKGROUND_BUG_NOTES.md` in the repository root for full context.

---

## 🚨 Active Priorities to Fix Immediately

### 1. Virtual Background Issue (BUG-002) — Still Open
- **Problem**: Changing/blurring background still does not work properly or shows poor quality on user devices (e.g. iPad, mobile Safari, remote clients).
- **What Was Done So Far**:
  - `apps/web/src/components/video/segmentation/glPipeline.ts`: Custom WebGL2 shader pipeline with temporal smoothing EMA (`0.15`), `UNPACK_ALIGNMENT = 1`, and linear texture sampling.
  - `apps/web/src/components/video/segmentation/SmoothBackgroundTransformer.ts`: MediaPipe input downscaled to `256x144` before inference.
- **Your Task**:
  - Investigate why background changes are failing to apply or look incorrect.
  - Trace how `LiveKitRoom.tsx` / `CustomVideoConference.tsx` / `PreJoinScreen.tsx` register the track processor.
  - Check whether `@livekit/track-processors` or browser canvas WebGL context creation is failing or falling back on iOS/iPadOS Safari.
  - Test `/debug/segmentation` and `/debug/prejoin` directly.

---

### 2. Teacher Availability Grid & Scheduler (BUG-007) — Still Open
- **Problem**: User reports availability page behavior is still the same (e.g., pre-filled matrix, cluttered 324-slot grid, or workflow not matching requirements).
- **What Was Done So Far**:
  - Added Quick Schedule bar with Start/End times (`00:00` to `23:30`) and batch recurrence (`Mon-Fri`, `Mon-Sat`, `Everyday`).
  - Added Custom toggle for 7x48 matrix and `@keyframes youtubeLike` bounce animation.
- **Your Task**:
  - Inspect `apps/web/src/app/dashboard/teacher/availability/page.tsx`.
  - Fix initial state loading: Ensure the page defaults to an uncluttered, empty Quick Scheduler view, and does not render the giant weekly matrix unless explicitly requested.
  - Verify that saving slots updates database correctly via `POST /api/teachers/availability` and handles existing teacher data cleanly.
  - Test with `npx tsx apps/web/scripts/test-admin-and-availability.ts`.

---

## ✅ Verified Working & Completed Features (Do Not Break)
- **Admin Panel Redesign (BUG-008)**: Ported Twenty CRM UI tables, avatars, calculation footer, and slide-over detail drawer in `/admin/users` and `/admin/invoices`.
- **Mobile Swipe-Back Intercept (BUG-006)**: `usePreventBackNavigation` in `LiveKitRoom.tsx` traps popstate so users don't accidentally leave live classes.
- **Solo Inactivity Auto-Close (BUG-005)**: 30-minute idle prompt in `SoloInactivityPrompt.tsx`.
- **Deny Join to Completed Meetings (BUG-004)**: `isJoinable` checks in `/api/guest/join` and `/api/sessions/[id]/join`.
- **Guest Single-Click Admit (BUG-003)**: Bulk request deduplication in `/api/sessions/[id]/guests`.

---

## 🛠️ Verification Commands
- Check build: `npm run build` (inside `apps/web`)
- Check lint: `npx eslint --quiet .` (inside `apps/web`)
- Test DB availability: `npx tsx scripts/test-admin-and-availability.ts` (inside `apps/web`)
