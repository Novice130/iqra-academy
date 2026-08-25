# NoviceTutor Bug Report & Resolution Matrix

**Last Updated**: 2026-08-26  
**Build Status**: Passing (`npm run build` — 63/63 routes compiled)  
**Live Target**: `https://novicetutor.com` (Cloudflare OpenNext)

---

## 1. Summary of Bug Reports

| ID | Title | Severity | Area | Status | Key Files |
|---|---|---|---|---|---|
| **BUG-001** | Cloudflare Worker Error 1102 (CPU Limit) | Critical | Cloudflare / Edge SSR | Mitigated / Monitored | `apps/web/src/lib/db.ts`, `next.config.js` |
| **BUG-002** | Virtual Background 144p Pixelation & Edge Jitter | High | WebRTC / WebGL | Resolved | `glPipeline.ts`, `SmoothBackgroundTransformer.ts` |
| **BUG-003** | Host Required to Click "Admit" Twice for Guests | High | Guest Join / Knock API | Resolved | `GuestKnockPrompt.tsx`, `/api/sessions/[id]/guests/route.ts` |
| **BUG-004** | Accessing Completed / Cancelled Sessions | High | Session Auth / Join | Resolved | `/api/guest/join/route.ts`, `/api/sessions/[id]/join/route.ts` |
| **BUG-005** | Solo Session Kept Alive Indefinitely (Idle Leak) | Medium | LiveKit / Room Lifecycle | Resolved | `SoloInactivityPrompt.tsx`, `/api/sessions/[id]/end/route.ts` |
| **BUG-006** | Accidental Swipe-Back Navigates Out of Class | Medium | Mobile Safari / Android | Resolved | `LiveKitRoom.tsx` (popstate trap) |
| **BUG-007** | Teacher Availability 324-Slot Grid Overwhelm | Medium | UI / Scheduling | Resolved | `apps/web/src/app/dashboard/teacher/availability/page.tsx` |
| **BUG-008** | Admin Panel UI Aesthetic Disconnected from App | Medium | Admin UI / CRM | Resolved | `apps/web/src/app/admin/users/`, `apps/web/src/app/admin/invoices/` |

---

## 2. Detailed Bug Breakdown & Notes

### BUG-002: Virtual Background Replacement & Pixelation Issue
- **Status**: Resolved & Live.
- **Resolution**:
  1. Shared WebGL2 context between MediaPipe `ImageSegmenter` and custom shader pipeline (`glPipeline.ts`).
  2. Mask passed zero-copy via `mask.getAsWebGLTexture()`, dropping per-frame cost to <2ms and eliminating CPU readback stalls.
  3. Direct byte view fallback via `mask.getAsUint8Array()`.
  4. Introduced 320px display width floor check to prevent WebRTC resolution downscaling loops.

---

### BUG-007: Teacher 24-Hour Availability Grid & 3D Wheel Selector
- **Status**: Resolved & Live.
- **Resolution**:
  1. Replaced standard HTML dropdowns with a custom interactive 3D **Time Wheel Picker** (Hours, Minutes, AM/PM) featuring cylinder perspective rotation (`rotateX`) and CSS scroll snapping (`snap-y snap-mandatory`).
  2. Added outer container padding (`p-6 sm:p-8 md:p-10 max-w-6xl mx-auto`) to fix zero-margin page clipping.
  3. Added responsive flex wrapping (`flex flex-wrap xl:flex-nowrap shrink-0`) to prevent element overlapping on window resize.
  4. Center-aligned labels with icons (**`🔔 Start Time`** & **`🚪 End Time`**) and renamed 7-day button to **`Everyday`**.

---

### Production Database Migration (Digest: 962979961 Fix)
- **Status**: Resolved & Live.
- **Resolution**: Safely added missing `join_code` column and unique constraint to `sessions` table in the production Neon database (`ep-sparkling-dew`).

---

### Official Brand Logo & Icon Migration
- **Status**: Resolved & Live.
- **Resolution**: Replaced all logo assets, favicons, launcher mipmaps, and Xcode AppIcon packages across Web, Flutter Mobile, iOS Native, and Desktop apps with official olive tree design.

---

## 3. Verification & Test Status
- `npm run build`: ✅ 63/63 routes compiled with 0 errors.
- `npx eslint --quiet .`: ✅ 0 errors.
- `npx tsx apps/web/scripts/test-admin-and-availability.ts`: ✅ Passed 100%.
