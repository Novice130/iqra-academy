# Iqra Academy (NoviceTutor) — Complete Project Knowledge Graph & History

This document serves as the authoritative, queryable context guide for AI agents and developers working on the Iqra Academy LMS codebase.

---

## 📋 1. Chronological Log of All User Requests & Features

1. **Initial Platform Setup**:
   - Created full-stack Quran LMS application with student/teacher/admin roles, video integration, progress tracking, and subscription management.
2. **Cloudflare Build & Package Patching**:
   - Fixed `ERR_PACKAGE_PATH_NOT_EXPORTED` error in `@noble/ciphers` package during OpenNext Cloudflare bundle compilation by introducing `scripts/cf-build.cjs`.
3. **Database Runtime Fix (Error 1101)**:
   - Fixed Cloudflare Worker exception caused by injecting Node.js `ws` WebSocket polyfill into environments where native `WebSocket` already exists in `apps/web/src/lib/db.ts`.
4. **Framework Compatibility Downgrade**:
   - **Decision Note**: Downgraded from Next.js 16 (Canary/RC) to **Next.js 15.5.21** to ensure full compatibility with `@opennextjs/cloudflare` v1.20.2 and Cloudflare Workers `workerd` edge runtime.
5. **Role-Based Access & Dashboard Redirection**:
   - Fixed session role resolution so `TEACHER`, `ORG_ADMIN`, and `SUPER_ADMIN` accounts (`syedamer130@gmail.com`, `subedar2017info@gmail.com`) automatically route to `/dashboard/teacher` instead of the student dashboard.
6. **Teacher Instant Meetings**:
   - Built ad-hoc video meeting generator (`/api/teachers/instant-meeting`) allowing teachers and admins to spin up LiveKit video calls on-demand and share join links.
   - Automatic student booking on link access.
7. **School-Wide Active Classes Oversight**:
   - Implemented live class observation panel on `/dashboard/teacher` for `ORG_ADMIN` and `SUPER_ADMIN` roles (`syedamer130@gmail.com`, `subedar2017info@gmail.com`) to hop into any active session across the school without needing an invitation.
8. **Recurring Group Scheduling**:
   - Created recurring Monday through Thursday 4:30 AM – 6:35 AM group sessions for students Bkyt (`bkyt@test.com`), Sobur (`sobur@test.com`), and Malek (`malek@test.com`).
   - Assigned teacher: **Masad Shareef** (`masadshareef1973@gmail.com`).
9. **Admin Student Management & Assignment**:
   - Added Admin Student Management interface at `/dashboard/teacher/students`.
   - Created `AssignStudentModal.tsx` and `/api/admin/assign-student` to allow admins to assign any registered student to a specific teacher.
10. **Database Cleanup**:
    - Purged all fake seed data (12 test accounts, mock progress records, fake bookings) from PostgreSQL database.
    - Preserved active production accounts:
      - **Admins**: `syedamer130@gmail.com`, `subedar2017info@gmail.com`
      - **Teacher**: `masadshareef1973@gmail.com`
      - **Students**: `bkyt@test.com`, `sobur@test.com`, `malek@test.com`
11. **Graphify Knowledge Graph Integration**:
    - Installed `@sentropic/graphify` in project repository.
    - Executed codebase analysis generating `.graphify/graph.json` and `.graphify/GRAPH_REPORT.md` (536 nodes, 1223 edges, 43 code communities).

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
- `apps/web/src/lib/db.ts`: Handles Neon PostgreSQL connection. Implements dynamic `WebSocket` detection to avoid `workerd` crashes.
- `apps/web/src/lib/rbac.ts`: Enforces role-based permissions (`STUDENT < TEACHER < ORG_ADMIN < SUPER_ADMIN`).
- `apps/web/src/lib/livekit.ts`: Constructs access tokens with moderator privileges for video calls.
- `apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx`: Admin interface for assigning students to teachers.
- `apps/web/scripts/clean_and_assign.ts`: Maintenance script for data cleanup and schedule seeding.

---

## 📊 4. Graphify Knowledge Graph Status

- **Location**: `.graphify/graph.json` and `.graphify/GRAPH_REPORT.md`
- **Nodes Indexing**: 536 codebase symbols (components, API routes, database schemas, utilities).
- **Edges Indexing**: 1,223 call and import dependencies.
- **Communities**: 43 functional clusters (Auth, LiveKit Video, Session Management, Admin Utilities, DB Schemas).
