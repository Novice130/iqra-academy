# Master System Architecture, Bug Reports & Twenty CRM Blueprint

> **Handoff Document**: Complete documentation of all active bug investigations, architectural decisions, Twenty CRM integration plan, and scheduling systems for new sessions.

---

## Table of Contents
1. [Cloudflare Worker Error 1102: Root Cause & Optimization](#1-cloudflare-worker-error-1102-root-cause--optimization)
2. [Twenty CRM Integration Strategy & Cloudflare Feasibility](#2-twenty-crm-integration-strategy--cloudflare-feasibility)
3. [Teacher 24-Hour Availability & YouTube-Style Tile Animation](#3-teacher-24-hour-availability--youtube-style-tile-animation)
4. [Session Inactivity & 30-Minute Auto-Close Engine](#4-session-inactivity--30-minute-auto-close-engine)
5. [Virtual Background Segmentation & 144p Pixelation Fix](#5-virtual-background-segmentation--144p-pixelation-fix)
6. [Guest Join System & Join Code Normalization](#6-guest-join-system--join-code-normalization)

---

## 1. Cloudflare Worker Error 1102: Root Cause & Optimization

### Observation
- **Error**: `Error 1102: Worker exceeded resource limits` (e.g., Ray ID: `a30c0c4db8c82ce5`) on `novicetutor.com`.

### Technical Root Cause
1. **CPU Execution Time Budget**:
   - Cloudflare Workers enforce a strict CPU time limit per request (10ms CPU time on Free tier, 50ms on standard plan).
   - This limit measures active CPU instruction cycles (evaluating JavaScript, serializing JSON, executing Webpack chunks, running cryptography/auth) — NOT network I/O waiting time.
2. **Next.js OpenNext SSR Cold Starts**:
   - When dynamic Next.js routes are evaluated on cold starts, OpenNext loads large server-side bundles into the V8 isolate.
   - If a route performs complex regexes, heavy synchronous parsing, or multiple sequential DB operations during SSR on the worker thread, CPU time crosses 50ms, causing the Cloudflare isolate supervisor to forcefully terminate the worker with Error 1102.
3. **Database Connection Pooler Overhead**:
   - Using WebSocket-based pooler (`withDb`) on edge routes without pooling connections incurs TLS + WebSocket handshake serialization overhead.

### Mitigation & Best Practices
- Ensure dynamic edge routes use stateless HTTP DB client (`withHttpDb`) for read operations.
- Avoid importing heavy client-side libraries (like MediaPipe, LiveKit client SDK, Canvas helpers) in server component bundles.
- Prerender static pages (`force-static` or ISR where possible).
- In Cloudflare Dashboard, configure Workers to enable **Smart Placement** and ensure the resource plan matches production concurrency.

---

## 2. Twenty CRM Integration Strategy & Cloudflare Feasibility

### Can Twenty CRM run natively on Cloudflare?
**No, not inside Cloudflare Workers / Pages compute.**

#### Why?
Twenty CRM (`twentyhq/twenty`) is an enterprise full-stack application requiring:
- **Backend**: NestJS (persistent Node.js daemon) + Apollo GraphQL API.
- **Job Queues**: BullMQ running on persistent Redis.
- **Database**: PostgreSQL with custom extensions (`pg_trgm`, `uuid-ossp`) and custom metadata schemas.
- **Runtime**: Long-running Node.js processes and TCP socket listeners.

Cloudflare Workers is a **stateless serverless V8 isolate** with a **50ms CPU execution limit**, no long-running Node.js server, and no native Redis.

---

### The Recommended Path: Option B (Direct Open-Source Integration)

Instead of maintaining separate Docker/Redis infrastructure, we take Twenty CRM's **actual open-source UI architecture and components** directly from `twentyhq/twenty` and adapt them into our Next.js LMS connected to our Drizzle PostgreSQL database:

```
twentyhq/twenty (Open Source Repo)
 ├── View Toolbar (Filter, Sort, Options, "☰ All People ▾", "+ New", "⌘K")
 ├── Spreadsheet Table (Pill tags, Avatars, Boolean badges, "Calculate ▾" footer)
 ├── Workspace Sidebar (Workspace switcher, quick actions, workspace items)
 └── Slide-Over Detail Drawer (Record inspection, timeline, 24h hours editor)
         │
         ▼ Directly integrated into our Next.js LMS (apps/web)
         ▼ Connected to our Drizzle PostgreSQL DB (Users, Invoices, Availability)
         ▼ Deployed 100% on Cloudflare OpenNext with zero extra servers or costs
```

#### Key Components from Twenty CRM:
1. **The Exact Twenty CRM Table System**:
   - Multi-column cell renderers matching Twenty:
     - **Name & Avatar**: Initials avatar + bold name.
     - **Email & URL**: Rounded pill badges (e.g. `user@example.com`).
     - **Role / ICP Tag**: `✓ Teacher` / `✓ Student` / `★ Admin` status badges.
     - **Timezone & Phone**: Formatted metadata cells.
   - Column header controls (`+` button, sort indicators, multi-select checkboxes).
   - Bottom **"Calculate ▾"** aggregation bar (`12 Users`, `Count: 3 Teachers`, etc.).
2. **Twenty CRM View Toolbar & Workspace Header**:
   - Top Bar: `👥 People` title, `+ New` button, `...` options, and `⌘K` command shortcut.
   - View Tabs: `☰ All People (12) ▾`, `Teachers ▾`, `Students ▾`, `Admins ▾`.
   - Real-time `Filter`, `Sort`, and `Options` dropdown triggers.
3. **Twenty CRM Workspace Sidebar**:
   - Workspace dropdown (`🕌 Novice Tutor ▾`, search icon, side panel icon).
   - Quick action bar (`Home`, `Chat`, `+ New chat`).
   - Workspace categories (`👥 People`, `🏢 Organizations`, `💳 Billing & Invoices`, `📅 Scheduling`, `⚙️ Settings`).
4. **Twenty CRM Slide-Over Detail Drawer (Side Sheet)**:
   - Clicking any row smoothly slides out Twenty's detail drawer from the right.
   - Lets admins inspect user profile, change roles, view invoices, and **edit their 24h weekly availability grid** directly inside the drawer without leaving the page.

---

## 3. Teacher 24-Hour Availability & YouTube-Style Tile Animation

### The User Problem & Previous Flaws
- In previous versions (shown in user screenshot), opening the Availability page displayed a huge, cluttered, pre-filled grid with hundreds of pre-selected slots (e.g. "324 half-hour slots across 12 blocks").
- Teachers could not easily pick round-the-clock 24-hour hours or broadcast their daily routine with 1 click.

### Strict User Requirements & Design Blueprint
1. **Default Empty State**:
   - All boxes are completely empty by default.
   - The huge weekly matrix is **hidden** by default so teachers are not overwhelmed.
2. **Default View (Simple Timing & Repeat Scheduler)**:
   - Displays clean Start Time & End Time pickers across 24 hours (`00:00` to `23:30`).
   - Displays recurrence buttons directly underneath:
     - `Monday – Friday` (Weekdays)
     - `Monday – Saturday` (6 Days)
     - `Everyday` (Monday – Sunday)
     - `Custom`
   - 1-click apply instantly syncs the daily schedule across chosen days.
3. **Custom Mode Behavior**:
   - Only when the teacher selects **`Custom`** does the full 7-day x 48-slot weekly matrix of tiles open.
4. **YouTube-Like Animation on Tile Selection**:
   - When a tile is clicked and marked available, it turns vibrant emerald green (`#10b981`) with a **YouTube-like pop/bounce animation**:
     - Keyframes: `0% scale(1)`, `35% scale(1.25) rotate(-2deg)`, `70% scale(0.92) rotate(1deg)`, `100% scale(1) rotate(0deg)`.
     - Accompanied by a subtle emerald glow (`box-shadow: 0 0 12px rgba(16, 185, 129, 0.5)`).
5. **Admin Support**:
   - Admins can manage any teacher's 24h schedule via `/dashboard/teacher/availability?teacherId=...` or right from the Twenty CRM detail drawer in `/admin/users`.

---

## 4. Session Inactivity & 30-Minute Auto-Close Engine

### Problem
- When a single user remained in a call alone, the session remained open indefinitely (up to 2 hours) even after inactivity countdown completed.

### Requirements & Fix
1. **30-Minute Idle Monitor**:
   - Detect when only 1 participant is present in a LiveKit room for ≥ 30 minutes without interaction or other participants.
2. **Prominent Alert Modal**:
   - Display a 60-second warning modal: *"Are you still in this call? This session will automatically close in [XX] seconds."*
   - Provide a *"Stay in Call"* button to reset the timer.
3. **Automatic Termination**:
   - If the countdown reaches 0 without user confirmation, the client dispatches a call to `/api/sessions/[id]/end` and `/api/sessions/[id]/leave`, disconnecting the LiveKit room and freeing resources.

---

## 5. Virtual Background Segmentation & 144p Pixelation Fix

### Root Cause of 144p Video Potato
- WebRTC tracks in Chromium/WebKit have built-in CPU & bandwidth adaptation (`QualityScaler` / `VideoStreamEncoder`).
- When segmentation inference or synchronous WebGL readbacks (`glReadPixels`) block the main thread for > 16-25ms per frame, WebRTC triggers **CPU Degradation**: it commands `getUserMedia` to drop capture resolution from 720p -> 360p -> 180p -> 144p.
- WebGL default `UNPACK_ALIGNMENT` is 4 bytes. Uploading 1-byte `gl.RED` textures whose width is not a multiple of 4 skews texture rows diagonally.
- `BLUR_DOWNSCALE = 4` previously downsampled background to 180p, causing pixelated blur.

### Architectural Solution
1. **Throttled Non-Blocking Inference**:
   - Run segmentation at 15-20 fps while WebGL compositing runs at 60 fps.
   - Always guard with `isInferring` flag to prevent overlapping inferences.
2. **WebGL Alignment & High-Definition Blur**:
   - Set `gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)` for `R8` single-channel textures.
   - Use `BLUR_DOWNSCALE = 2` with `gl.LINEAR` filtering so backgrounds remain crisp HD.
3. **WebRTC HD Capture Constraints**:
   - Explicitly request `{ ideal: 1280 }, { ideal: 720 }` in pre-join and LiveKit room options.

---

## 6. Guest Join System & Join Code Normalization

### Key Resolution
- Canonical `sessionId` returned in both `GET` and `POST` payloads from `/api/guest/join`.
- `normalizeJoinCode()` added to `/api/sessions/[id]/join` and `/api/sessions/[id]/guests` to support both hyphenated (`frns-avkb-gneo`) and unhyphenated (`FRNSAVKBGNEO`) 12-character format codes.
- `GuestJoinPage` (`/join/[id]/page.tsx`) updated to track `canonicalSessionId` and pass it to `LiveKitRoom`.

---

## Summary of Completed Code Status
- **Build Status**: `npm run build` compiled with **0 errors across all 63 routes**.
- **Test Scripts**:
  - `scripts/test-e2e-auth-and-join.ts`: Passed E2E guest knock, admit, and token flow.
  - `scripts/test-admin-and-availability.ts`: Passed 24h availability persistence & admin user metrics.
