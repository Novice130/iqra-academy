# Iqra Academy (NoviceTutor) — Complete Project Knowledge Graph & History

This document serves as the authoritative, queryable context guide for AI agents and developers working on the Iqra Academy LMS codebase.

---

## 🚦 0. Handover Summary (read this first)

**As of 2026-08-05 ~7 AM**: `master` live on `novicetutor.com` and pushed to GitHub. Video calls and chat fixed and verified working (#11–#13).

**Deploy**: `cd apps/web && npm run deploy:cf` — builds and deploys straight to Cloudflare, independent of git. `git push origin master` separately.

**Open items**: none logged. Ask the user what else is broken before starting.

**Rules, don't break these again**:
- Every route/page touching `db` must wrap in `withDb()` (`@/lib/db`).
- Never reassign `token.ttl` after constructing a LiveKit `AccessToken`.
- Don't swap to the `neon-http` driver without rewriting `withRLS` and `quota.ts`.

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
