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
| 1 | P0 authorization & tenant isolation | ⬜ Pending | — | — |
| 2 | Data model & migration | ⬜ Pending | — | — |
| 3 | Canonical scheduling & meeting lifecycle | ⬜ Pending | — | — |
| 4 | Secure realtime scheduling | ⬜ Pending | — | — |
| 5 | Class action button & navigation responsiveness | ⬜ Pending | — | — |
| 6 | Admin information architecture | ⬜ Pending | — | — |
| 7 | Meeting control parity | ⬜ Pending | — | — |
| 8 | Visual system & every active page | ⬜ Pending | — | — |
| 9 | Native iOS & Android | ⬜ Pending | — | — |
| 10 | Tests & CI | ⬜ Pending | — | — |
| 11 | Docs & rollout | ⬜ Pending | — | — |

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
