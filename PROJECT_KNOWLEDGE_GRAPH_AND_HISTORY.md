# Iqra Academy (NoviceTutor) — Complete Project Knowledge Graph & History

This document serves as the authoritative, queryable context guide for AI agents and developers working on the Iqra Academy LMS codebase.

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
11. **Video Call Reliability Overhaul** (superseded #3's DB fix entirely — see below):
    - **Root cause of "Failed to Join Class" / random 500s**: `lib/db.ts` created one Neon `Pool` at module load and reused it across every request. Cloudflare Workers forbids reusing I/O objects across requests ("Cannot perform I/O on behalf of a different request") — the request would hang and time out. Confirmed live via `wrangler tail`.
    - **Fix**: `lib/db.ts` rewritten to hand each request its own `Pool` via `AsyncLocalStorage`. `db` is a `Proxy` resolving to the current request's pool; a new `withDb(fn)` wrapper (in `lib/db.ts`) must wrap every route handler and server-component page (~30 files) so nested calls — including Better-Auth's session lookups — share one pool per request. Real interactive transactions (`withRLS`, `quota.ts`) still work unchanged.
    - **Reverted a bad interim fix**: a parallel session had swapped the driver to `neon-http` (commit `8f6e42f`) to dodge the same symptom, but that silently broke RLS scoping (`set_config` outside a real transaction never took effect) and would have broken `quota.ts`'s dependent-query transactions. Do not reintroduce `neon-http` without rewriting those.
    - **Root cause of "connects then Disconnected"**: `lib/livekit.ts`'s `generateLiveKitToken` set `token.ttl` twice — once correctly via the `AccessToken` constructor (`ttl: "7200s"`), then again via `token.ttl = 7200` (a bare number). The second assignment bypassed the SDK's duration parsing and wrote the raw number straight into the JWT's `exp` claim, so every token was issued already "expired" (exp = 1970-01-01 + 7200s). LiveKit accepted the signaling handshake, then killed the client once it validated the token. **Fix**: removed the redundant reassignment — the constructor option alone is correct. Confirmed by decoding the actual issued JWT before/after.
    - **Missing `LIVEKIT_URL` secret**: never set on Cloudflare, so code fell back to a dead hardcoded host (`meet.novicetutor.com`, doesn't resolve). Set via `wrangler secret put` to the real LiveKit Cloud host.
    - **Shareable join links were `http://localhost:3000/...` in production**: `.env.local` has `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local dev, and Next.js loads `.env.local` over `.env` even during production builds. `scripts/cf-build.cjs` now force-sets `NEXT_PUBLIC_APP_URL=https://novicetutor.com` as an explicit env var passed to the build subprocess, so `.env.local` can never leak into a deploy again.
    - **No way to end/clean up meetings**: instant-meeting sessions never left `IN_PROGRESS`, piling up in Today's Schedule and the admin's active-classes panel forever, with no shareable-link UI either.
      - `LiveKitRoom.tsx` now POSTs `/api/sessions/[id]/end` when the moderator disconnects (marks `COMPLETED`; a student leaving doesn't end it for others).
      - Added `DELETE /api/sessions/[id]` (deletes a session + all dependent rows: bookings, attendees, chat, feedback, progress) and `POST /api/teachers/instant-meeting/cleanup` (bulk-delete — own meetings for teachers, org-wide for admins).
      - `StartInstantMeetingButton.tsx` now shows the join URL with a copy button before entering, instead of redirecting immediately. `SessionRowActions.tsx` and `CleanupInstantMeetingsButton.tsx` add per-row End/Delete and a one-click bulk-clear on `/dashboard/teacher`.
    - **`/dashboard/chat` (general "Messages" page) was completely non-functional**: it called `/api/chat/messages` with no `sessionId`, but the API required one and 400'd every time. The `chatRooms` schema already had a nullable `sessionId` for exactly this case (comment: "Null = persistent room") but no code used that path. Added a per-student persistent support room (`chatRooms.name = "Support: {userId}"`, `sessionId: null`) used whenever no `sessionId` is given. Also fixed two response-shape bugs in `chat/page.tsx` that would've broken rendering regardless (`data.messages` vs bare array; `sender.name` vs a `senderName` field that never existed on the API response). **Known gap**: student-side only — teachers/admins have no inbox/room-list UI yet to see who's messaging.

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
