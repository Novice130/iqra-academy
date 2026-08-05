# Iqra Academy (NoviceTutor) — Complete Project Knowledge Graph & History

This document serves as the authoritative, queryable context guide for AI agents and developers working on the Iqra Academy LMS codebase.

---

## 🚦 0. Handover Summary (read this first)

**As of 2026-08-05 ~8:30 PM**: A full session was spent rebuilding the video-call UX to match Zoom's core meeting experience (#14 below). All changes are in the **local working tree only** — nothing from this session has been committed, pushed, or deployed yet. Testing was done against a **local dev server** exposed via a **free Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:3000`), not against `novicetutor.com`. See §5 for the full Zoom-feature-parity audit.

**Deploy**: `cd apps/web && npm run deploy:cf` — builds and deploys straight to Cloudflare, independent of git. `git push origin master` separately. **Nothing from #14 has been deployed or committed — do that first if picking this up.**

**Open items (start here next session)**:
1. **Not yet verified**: "Start Instant Meeting" / dashboard "Home" link were reported broken by the user right as this session ended. Root-caused the reproduction to a stale browser session logged in as a *student* test account hitting a teacher-only route (expected 403, not a bug) — but the user's own report needs re-confirming on a clean login before assuming it's fully explained. Chrome extension used for testing went unresponsive at the very end of the session before this could be closed out.
2. **Booking wizard is still a UI mock** (`/dashboard/booking`) — `handleBook()` just does a fake `setTimeout`, never calls an API. The only real ways to start a session today are Instant Meeting and teacher's Call Now. Scheduled-booking → shows on schedule → student joins doesn't work end-to-end.
3. **No waiting room / host-admit** — anyone with the join link (and a student profile in the org) is let straight into the room. Deliberate simplicity so far, not a bug, but worth a conscious decision before wider rollout.
4. **Auto-end-on-moderator-disconnect** (clicking in-call "Leave" as the teacher → should POST `/api/sessions/[id]/end`) was never cleanly verified end-to-end — every attempt got contaminated by shared-browser-cookie test artifacts (see rule below). The dashboard's manual "End" button on `/dashboard/teacher` **is** confirmed working.
5. Local dev/test infra is fragile and **not representative of production**: the Cloudflare quick tunnel has no fixed subdomain — every restart gets a new random URL, requiring `apps/web/.env.local`'s `NEXT_PUBLIC_APP_URL` to be updated and the dev server restarted to match. None of this dev-tunnel machinery exists in production (real domain, no dev-mode HMR chatter, no tunnel instability).
6. One-off console warning seen once during heavy rapid multi-tab testing: `Error while running updatePages(): Element not part of the array` from `@livekit/components-react`'s internal `useVisualStableUpdate`. Did not reproduce as a user-visible break; likely a transient race from many participants joining/leaving in quick succession during testing rather than a real bug. Keep an eye out.
7. Back button occasionally lands on a cached `/login` page snapshot after being authenticated (standard browser back/forward cache behavior — the user is still logged in; forward or any click fixes it). Could silence it with `Cache-Control: no-store` on `/login` if it's annoying enough; not done.

**Rules, don't break these again**:
- Every route/page touching `db` must wrap in `withDb()` (`@/lib/db`).
- Never reassign `token.ttl` after constructing a LiveKit `AccessToken`.
- Don't swap to the `neon-http` driver without rewriting `withRLS` and `quota.ts`.
- **Never wrap `<ParticipantTile>` in a plain `<div>`, and never pass it `children`.** Both were tried in #14 and each broke tile rendering a different way: wrapping it breaks `GridLayout`'s internal per-tile sizing (tiles render at wildly inconsistent heights and overlap — this is what the user saw as "smashed" tiles); passing `children` makes `ParticipantTile` render *only* the children, dropping its own video/placeholder entirely (this is what caused the "all tiles black" regression). Any custom overlay UI (buttons, badges) for a tile must live in a **separate DOM tree outside `GridLayout`/`FocusLayout`/`CarouselLayout` entirely** — see `TopBar` and `DraggableSelfView` in `CustomVideoConference.tsx` for the pattern that works.
- `GridLayout`/`FocusLayoutContainer` need to be wrapped in a div with class `lk-grid-layout-wrapper` / `lk-focus-layout-wrapper` respectively (copied from how the official `VideoConference` prefab does it) — without that wrapper class, the LiveKit CSS's `calc(100% - var(--lk-control-bar-height))` height rule never applies and the layout collapses to 0 height.
- The `<LiveKitRoom>` (`LKRoom`) element **must** carry `data-lk-theme="default"` — without it, none of `@livekit/components-styles`' CSS custom properties (`--lk-control-bar-height`, colors, spacing, etc.) are ever defined anywhere in the tree, and the whole call view can silently collapse to 0×0 (masked whenever at least one participant has a live camera track, which is why this was hard to spot).
- LiveKit room `metadata` changes (used for the spotlight feature) don't reliably reach `useRoomInfo()` and don't retroactively hydrate late joiners from `RoomMetadataChanged` alone (that event only fires on genuine *changes*, not on initial connect). Subscribe to the `Room` object directly and refresh on both `RoomMetadataChanged` **and** `RoomEvent.Connected`.
- Room `metadata` is per-**room**, not per-viewer — don't confuse "spotlight" (synced, affects what everyone sees) with per-viewer state like gallery/speaker view (must stay local `useState`, never synced).
- LiveKit enforces **one connection per identity** per room, and identity = the user's email (`generateLiveKitToken`). Logging the same test account into two devices/tabs at once makes LiveKit silently disconnect the older one — this looks exactly like an unexplained "logout" but isn't an auth bug. Give every test device its own distinct account.
- The Wake Lock API (`navigator.wakeLock`) requires a secure context (HTTPS) — it silently no-ops on plain HTTP to a non-localhost origin, same as `navigator.mediaDevices`. Both are why local testing needs the HTTPS tunnel, not just the LAN IP.

---

## 📋 1. Chronological Log of All User Requests & Features

1. **Initial Platform Setup**:
   - Created full-stack Quran LMS application with student/teacher/admin roles, video integration, progress tracking, and subscription management.
2. **Cloudflare Build & Package Patching**:
   - Fixed `ERR_PACKAGE_PATH_NOT_EXPORTED` error in `@noble/ciphers` package during OpenNext Cloudflare bundle compilation via `scripts/cf-build.cjs`. That script also now force-sets `NEXT_PUBLIC_APP_URL=https://novicetutor.com` for every build (see #12) and patches a `styled-jsx` dist-path bug.
3. **Framework Compatibility Downgrade**:
   - **Decision Note**: Downgraded from Next.js 16 (Canary/RC) to **Next.js 15.5.21** to ensure full compatibility with `@opennextjs/cloudflare` v1.20.2 and Cloudflare Workers `workerd` edge runtime.
4. **Role-Based Access & Dashboard Redirection**:
   - Fixed session role resolution so `TEACHER`, `ORG_ADMIN`, and `SUPER_ADMIN` accounts (`syedamer130@gmail.com`, `subedar2017info@gmail.com`) automatically route to `/dashboard/teacher` instead of the student dashboard.
5. **Teacher Instant Meetings**:
   - Built ad-hoc video meeting generator (`/api/teachers/instant-meeting`) allowing teachers and admins to spin up LiveKit video calls on-demand and share join links.
   - Automatic student booking on link access.
6. **School-Wide Active Classes Oversight**:
   - Implemented live class observation panel on `/dashboard/teacher` for `ORG_ADMIN` and `SUPER_ADMIN` roles (`syedamer130@gmail.com`, `subedar2017info@gmail.com`) to hop into any active session across the school without needing an invitation.
7. **Recurring Group Scheduling**:
   - Created recurring Monday through Thursday 4:30 AM – 6:35 AM group sessions for students Bkyt (`bkyt@test.com`), Sobur (`sobur@test.com`), and Malek (`malek@test.com`).
   - Assigned teacher: **Masad Shareef** (`masadshareef1973@gmail.com`).
8. **Admin Student Management & Assignment**:
   - Added Admin Student Management interface at `/dashboard/teacher/students`.
   - Created `AssignStudentModal.tsx` and `/api/admin/assign-student` to allow admins to assign any registered student to a specific teacher.
9. **Database Cleanup**:
   - Purged all fake seed data (12 test accounts, mock progress records, fake bookings) from PostgreSQL database.
   - Preserved active production accounts:
     - **Admins**: `syedamer130@gmail.com`, `subedar2017info@gmail.com`
     - **Teacher**: `masadshareef1973@gmail.com`
     - **Students**: `bkyt@test.com`, `sobur@test.com`, `malek@test.com`
10. **Graphify Knowledge Graph Integration**:
    - Installed `@sentropic/graphify` in project repository.
    - Executed codebase analysis generating `.graphify/graph.json` and `.graphify/GRAPH_REPORT.md` (536 nodes, 1223 edges, 43 code communities).
11. **Video Call Reliability Overhaul** (supersedes #3's DB fix):
    - *"Failed to Join Class" / random 500s* — `lib/db.ts` reused one Neon `Pool` across every request; Cloudflare Workers forbids that ("Cannot perform I/O on behalf of a different request"), causing hangs. Fixed: per-request `Pool` via `AsyncLocalStorage`, `db` is a `Proxy` onto it, every route/page wraps in `withDb()`. Real transactions (`withRLS`, `quota.ts`) unaffected.
    - Reverted a same-symptom interim fix from a parallel session that swapped to the `neon-http` driver (commit `8f6e42f`) — it silently broke RLS scoping. Don't reintroduce without rewriting `withRLS`/`quota.ts`.
    - *Call connects then "Disconnected"* — `lib/livekit.ts` set `token.ttl` twice; the second (bare-number) assignment corrupted the JWT's `exp` claim to a 1970 timestamp, so every token was born expired. Fixed: removed the redundant reassignment.
    - `LIVEKIT_URL` secret was never set on Cloudflare (dead fallback host). Set via `wrangler secret put`.
    - Join links were `http://localhost:3000/...` in prod — `.env.local` overrides `.env` even in production builds. Fixed: `cf-build.cjs` force-sets `NEXT_PUBLIC_APP_URL` for the build.
    - Instant meetings never left `IN_PROGRESS` (piled up, no share link). Added: end-on-disconnect (`/api/sessions/[id]/end`), delete (`DELETE /api/sessions/[id]`), bulk cleanup (`/api/teachers/instant-meeting/cleanup`), copy-link UI, per-row End/Delete on `/dashboard/teacher`.
    - `/dashboard/chat` 400'd on every request (called the API with no `sessionId`, which was required). Added the persistent support-room path the schema already had a slot for (`chatRooms.sessionId: null`), plus fixed two response-shape mismatches in the frontend.
12. **Teacher/Admin Messages Inbox**: staff had no way to see/reply to student threads. Added `studentId` param to `GET`/`POST /api/chat/messages` (staff-only) and `/dashboard/teacher/messages` (thread list, links to `/dashboard/chat?studentId=X`).
13. **Git/CI Hygiene**: #11–#12 were deployed via `wrangler` before being pushed — deploy and git are independent, don't assume one implies the other. `.github/workflows/ci.yml` triggered on `main`, an abandoned branch 22 commits behind `master`; fixed to trigger on `master`.
14. **Video Call UX Overhaul — Zoom Feature Parity** (2026-08-05, one long session, **not yet committed/deployed**): Started as "test the meeting experience end to end," escalated into rebuilding most of the in-call UI. In order of discovery:
    - **Root-cause, whole video area rendered blank for every participant**: `<LKRoom>` was missing `data-lk-theme="default"`. Without it every LiveKit CSS custom property is undefined, `.lk-grid-layout-wrapper`'s `height: calc(100% - var(--lk-control-bar-height))` computes to garbage, and the grid collapses to 0 height. It only *looked* fine in earlier ad-hoc testing because a participant with a live camera track gives the tile intrinsic size that happens to paper over the collapse — camera-off (very common for Quran recitation classes) exposed it every time. Fixed by adding the attribute.
    - Replaced the LiveKit prebuilt `<VideoConference/>` with a custom `CustomVideoConference.tsx` built from the underlying primitives (`GridLayout`, `FocusLayout`, `FocusLayoutContainer`, `CarouselLayout`, `ParticipantTile`, `ControlBar`) — needed to add host controls the prebuilt doesn't expose.
    - **Spotlight (Zoom's "Pin for everyone")**: new `POST /api/sessions/[id]/spotlight` (host-only) writes `{ spotlightIdentity }` into the LiveKit room's server-side `metadata` via `RoomServiceClient.updateRoomMetadata`. Clients subscribe to the room directly (not `useRoomInfo()` — see rules above) and render whoever's spotlighted in `FocusLayout` for everyone. Two follow-on bugs, both now documented as rules above: wrapping the tile in a div to add the button broke `GridLayout`'s sizing (tiles came out different sizes and overlapping — this is the "smashed tiles" bug the user reported); passing the button as `ParticipantTile`'s `children` silently dropped all video/placeholder rendering (the "all black" regression). Final fix: spotlight controls live in a separate `TopBar` component entirely outside the grid/focus tree.
    - **Auto-spotlight the teacher by default**: `GET /api/sessions/[id]/join` now calls `RoomServiceClient.createRoom({ name, metadata })` whenever the teacher joins — `createRoom` is a no-op against an already-existing room (doesn't clobber a spotlight the teacher later set manually), so this only sets the *initial* default. Students now land on "teacher spotlighted" without the teacher touching anything.
    - **Gallery / Speaker view toggle**: per-viewer local `useState`, never synced via room metadata (deliberately — matches how Zoom/Meet let each participant choose independently). "Speaker" = whoever's spotlighted; "Gallery" = plain equal grid.
    - **Teacher-only self-view**: the teacher's own screen always shows all *other* participants in an equal grid plus their own camera in a small floating, pointer-draggable picture-in-picture (`DraggableSelfView`) — independent of what's spotlighted for everyone else. Built as a standalone absolutely-positioned tile outside `GridLayout`/`FocusLayout` for the same reason as the spotlight buttons.
    - **Fullscreen call view**: split the dashboard's sidebar+header into a new client component `DashboardChrome.tsx` that checks `usePathname()` and renders bare `{children}` (no sidebar) for any `/dashboard/session/*` route — a video call is now fullscreen/immersive like Zoom instead of squeezed next to a 240px nav sidebar. `layout.tsx` still does the server-side auth check and hands off to it.
    - **Mobile / narrow-window account menu**: the mobile header's avatar circle was a static, unclickable div — no way to see who's logged in or sign out below the `lg` breakpoint (1024px), on phones *or* a narrowed desktop window. Now a real dropdown: name, email, full nav, Sign Out.
    - **In-call "copy invite link"**: Zoom-style share button in the call's top bar (`CopyLinkButton`) — previously the only way to grab a join link was from the teacher's dashboard *before* entering the meeting.
    - **Screen wake lock**: the phone would auto-lock mid-class like any other web page. Added a `useWakeLock()` hook (`navigator.wakeLock.request('screen')`) in `LiveKitRoom.tsx`, re-acquired on `visibilitychange` since the browser silently releases it when the tab backgrounds. Requires HTTPS (see rules above).
    - Minor: fixed a `PreJoinScreen.tsx` copy bug ("Camera ON" had a space, "MicrophoneON" didn't).
    - Testing infra built for this session (not app code): local dev server + `cloudflared tunnel --url http://localhost:3000` for a real HTTPS URL reachable from real phones/laptops off the local network (`navigator.mediaDevices` and `navigator.wakeLock` both silently no-op without HTTPS). `.env.local`'s `NEXT_PUBLIC_APP_URL` must match the current tunnel URL and the dev server restarted whenever the tunnel is restarted (no fixed subdomain on the free tier).

---

## 🛠️ 2. Tech Stack & Architecture Overview

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 15.5.21 (App Router) | React server components, API routes, SSR |
| **Edge Bundle** | `@opennextjs/cloudflare` | Adapts Next.js build output for Cloudflare Workers |
| **Deployment** | Cloudflare Workers & Custom Domains | Edge hosting for `novicetutor.com` |
| **Database** | Neon Serverless PostgreSQL | Multi-tenant database with Row Level Security |
| **ORM** | Drizzle ORM | Type-safe schema, migrations, and relational queries |
| **Auth** | Better-Auth | Session cookies, RBAC, multi-tenant auth |
| **Video Calls** | LiveKit WebRTC (`@livekit/components-react`) | HD 1:1 and group Quran video classes |
| **Knowledge Graph**| Graphify (`@sentropic/graphify`) | AST & semantic codebase indexing for AI agents |

---

## 🔗 3. Subsystem Interrelationships & Call Flows

```mermaid
graph TD
    User([User Browser]) -->|HTTP Requests| CF[Cloudflare Workers / OpenNext]
    CF -->|Session Cookie| Auth[Better-Auth / lib/auth.ts]
    Auth -->|DB User Lookup| DB[(Neon PostgreSQL)]
    
    CF -->|/dashboard| Page[src/app/dashboard/page.tsx]
    Page -->|Role Check| RoleFilter{Is Admin / Teacher?}
    RoleFilter -->|Yes| TeacherDash[src/app/dashboard/teacher/page.tsx]
    RoleFilter -->|No| StudentDash[Student View]

    TeacherDash -->|Instant Meeting| InstantAPI[src/app/api/teachers/instant-meeting]
    TeacherDash -->|Observe Active Class| JoinAPI[src/app/api/sessions/[id]/join]

    JoinAPI -->|Generate JWT Token| LiveKit[LiveKit WebRTC Cloud]
```

### Module Responsibilities:
- `apps/web/src/lib/db.ts`: Neon PostgreSQL connection. One `Pool` per request via `AsyncLocalStorage` (`withDb()` wraps every route/page); `db` is a `Proxy` onto the current request's pool. **Every** route handler and DB-touching server-component page must call through `withDb()` — accessing `db` outside it throws.
- `apps/web/src/lib/rbac.ts`: Enforces role-based permissions (`STUDENT < TEACHER < ORG_ADMIN < SUPER_ADMIN`).
- `apps/web/src/lib/livekit.ts`: Constructs LiveKit access tokens. Set `ttl` via the `AccessToken` constructor option **only** — do not reassign `token.ttl` after construction (corrupts the JWT `exp` claim, see #11).
- `apps/web/src/app/api/sessions/[id]/end/route.ts`: Marks a session `COMPLETED` (host-only).
- `apps/web/src/app/api/sessions/[id]/route.ts`: `DELETE` — permanently removes a session + dependents.
- `apps/web/src/app/api/teachers/instant-meeting/cleanup/route.ts`: Bulk-delete instant meetings.
- `apps/web/src/app/api/chat/messages/route.ts`: Session-scoped chat, or a student's persistent support room when `sessionId` is omitted.
- `apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx`: Admin interface for assigning students to teachers.
- `apps/web/scripts/cf-build.cjs`: Builds + deploys to Cloudflare. Forces `NEXT_PUBLIC_APP_URL` for the build regardless of local `.env.local`.
- `apps/web/scripts/clean_and_assign.ts`: Maintenance script for data cleanup and schedule seeding.

---

## 📊 4. Graphify Knowledge Graph Status

- **Location**: `.graphify/graph.json` and `.graphify/GRAPH_REPORT.md`
- **Nodes Indexing**: 536 codebase symbols (components, API routes, database schemas, utilities).
- **Edges Indexing**: 1,223 call and import dependencies.
- **Communities**: 43 functional clusters (Auth, LiveKit Video, Session Management, Admin Utilities, DB Schemas).

---

## 🎥 5. Zoom Feature Parity — Video Meeting Audit (as of 2026-08-05, post-#14)

Honest checklist against a standard Zoom-class meeting product. Use this to decide what's actually worth building next instead of re-discovering it from scratch.

### ✅ Implemented
| Feature | Where |
| :--- | :--- |
| Join via link, host an instant meeting | `/api/teachers/instant-meeting`, `/dashboard/session/[id]` |
| Mute/unmute mic, camera on/off | LiveKit `ControlBar` |
| Screen share | `ControlBar controls={{ screenShare: true }}`, takes over focus layout for everyone |
| In-call text chat | `ControlBar controls={{ chat: true }}` (LiveKit's built-in ephemeral chat) |
| Gallery view | `CustomVideoConference.tsx` — equal grid, per-viewer toggle |
| Speaker/focus view | Same file — whoever's spotlighted goes big |
| Host spotlight ("pin for everyone") | `POST /api/sessions/[id]/spotlight` + room metadata sync |
| Auto-spotlight teacher by default | `createRoom` initial metadata in `/api/sessions/[id]/join` |
| Host self-view (PiP, draggable) | `DraggableSelfView` — teacher-only |
| Copy/share invite link (pre-call and in-call) | Teacher dashboard Quick Actions + in-call `TopBar` |
| Fullscreen/immersive call UI | `DashboardChrome.tsx` skips sidebar on `/dashboard/session/*` |
| Mobile account menu (name/email/nav/sign-out) | `DashboardChrome.tsx` mobile dropdown |
| Screen wake lock (screen doesn't sleep mid-call) | `useWakeLock()` in `LiveKitRoom.tsx` |
| Connection quality indicator | LiveKit built-in per-tile icon |
| Auto-reconnect on network blip | LiveKit client SDK, automatic |
| Device check before joining (camera/mic preview + toggle) | `PreJoinScreen.tsx` |
| End meeting (host) / Leave (anyone) | `/api/sessions/[id]/end`, per-row dashboard controls |
| Auto-book a student the first time they open an instant-meeting link | `/api/sessions/[id]/join` |

### ⚠️ Partial / needs work
| Feature | Gap |
| :--- | :--- |
| Auto-end when host clicks in-call "Leave" | Wired (`onDisconnected` → `POST /end`) but never cleanly verified end-to-end in testing (see Open Items #4). The dashboard's manual End button *is* confirmed. |
| Scheduled meetings | `/dashboard/booking` wizard is a **UI mock** — doesn't call any API, nothing persists. Only Instant Meeting / Call Now actually create sessions today. |
| Attendance tracking | Dashboard shows a literal "coming soon" placeholder card. |
| Participant list | `TopBar`'s spotlight pills double as a rough participant list, but there's no dedicated panel (no per-participant mute, no join/leave log). |

### ❌ Not implemented
| Feature | Notes |
| :--- | :--- |
| Waiting room / host-admit | Anyone with the link + a student profile joins immediately. May be a deliberate simplicity choice for a school context — worth a conscious decision, not just an oversight. |
| Host controls: mute participant, mute all, remove/kick participant, lock meeting | None exist. Would need new LiveKit `RoomServiceClient` calls (`mutePublishedTrack`, `removeParticipant`) + API routes + UI, similar shape to the spotlight feature. |
| Co-hosts | Single moderator only (`session.teacherId`). No promote-to-co-host mechanism. |
| Recording | Schema already has `sessions.recordingUrl` / `recordingAccess` columns (dead weight right now) but no start/stop/storage wired to LiveKit Egress or anywhere else. |
| Reactions / raise hand | Not present. |
| Live captions / transcription | Not present. |
| Virtual background / blur | Not present. |
| Breakout rooms | Not present. |
| Whiteboard | Not present. |
| Polls / Q&A | Not present. |
| Meeting passcode | Access is auth + booking-gated only, no separate passcode concept. |
| Per-viewer manual pin of an arbitrary participant (as opposed to host spotlight for everyone) | Only the host's spotlight (synced) and gallery/speaker (local) exist — no "I personally want to pin someone just for my own view" while staying in speaker mode. |

### Suggested next priorities (not started, just a starting point for next session)
Roughly in order of "most Zoom-like experience per unit of effort," not a commitment:
1. Verify open item #1 and #4 above on a clean login before building anything new.
2. Host mute-participant / mute-all — the single most-requested basic teacher control that's currently missing entirely.
3. Make the booking wizard real (biggest structural gap — right now there's no scheduled-class flow at all, only ad-hoc).
4. A real participant list panel (who's here, who's muted) — cheap once mute-participant exists since the data's the same.
5. Recording, if the school actually wants lesson playback — bigger lift (LiveKit Egress + storage + playback UI), only worth it if there's real demand.
