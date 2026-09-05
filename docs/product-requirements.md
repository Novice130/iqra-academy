# 📘 Product Requirements & System Architecture Specification

**Project**: NoviceTutor / Iqra Academy LMS & Virtual Classroom  
**Target Domain**: [https://novicetutor.com](https://novicetutor.com)  
**Status**: Canonical Source of Truth (Post-Remediation)  
**Last Updated**: 2026-09-05  

---

## 1. Executive Summary & Core Decisions

NoviceTutor provides a real-time, multi-tenant virtual classroom and learning management system for 1-on-1 and small-group Quran education. The system couples a web frontend and admin portal deployed to Cloudflare Workers with a native iOS and Android Flutter WebView shell.

### Fixed Architectural & Product Decisions

1. **Immediate Availability Publication**: Teacher and admin availability modifications publish immediately without approval gates. When an administrator updates a teacher's schedule, an informational notification is dispatched containing structured before/after diffs; the teacher acknowledges the update with a single click (no approval, rejection, or undo workflow).
2. **Immediate Booking Confirmation**: Student bookings and trial lesson signups confirm instantly upon submission without phantom or multi-step approval workflows.
3. **Canonical Class Action Boundaries**: The prominent `#0A84FF` blue class action button appears exactly **60 minutes before scheduled start** (`T-60`) for the assigned teacher ("Start Class") and confirmed booked students ("Join Class"). Prior to `T-60`, a neutral time card/countdown is rendered, strictly eliminating dead clicks.
4. **Perimeter Security Invariant**: Only the assigned teacher's arrival marks a scheduled session as `IN_PROGRESS` and stamps `actualStart`. Students arriving early wait in the lobby (`waitingForTeacher: true`).
5. **Ad-Hoc Session Semantics**: Ad-hoc classes created on demand use **Instant Meeting**, never "Start Class", and are tagged with `origin: "INSTANT"`.
6. **Strict Room-Wide Volume Authority**: Room-wide participant gain adjustments can only be executed by the assigned teacher (or super-admin support override). Unassigned teachers, students, and observers receive `403 Forbidden`.
7. **Admin Information Architecture**: The `/admin` overview displays occupied live classes only. Scheduled classes and dense teacher spreadsheet schedules reside on dedicated routes (`/admin/scheduled-classes` and `/admin/teacher-schedules`).
8. **Native Shell Parity**: Flutter serves as a thin, secure WebView shell. Authentication relies exclusively on HTTP-only session cookies in the WebView cookie jar. Native platform capabilities are strictly gated: screen sharing is enabled on Android via native MediaProjection bridge and completely hidden on iOS until ReplayKit Broadcast Upload Extensions are introduced.

---

## 2. Multi-Tenancy & Authorization Model

```
                    ┌───────────────────────────────┐
                    │      Incoming HTTP Request    │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │    Better Auth Session Cookie │
                    │      (userId, orgId, role)    │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
        ┌───────────────────────────────────────────────────────┐
        │  Shared Session Guard (src/lib/session-access.ts)    │
        │  • loadOrgSession(orgId, sessionId)                   │
        │  • assertSessionViewer(session, viewer)              │
        │  • assertSessionHost(session, viewer)                │
        │  • assertAssignedTeacher(session, viewer)            │
        └──────────────┬────────────────────────┬───────────────┘
                       │                        │
             Authorized│                        │Unbooked / Cross-Org
                       ▼                        ▼
        ┌─────────────────────────┐   ┌─────────────────────────┐
        │  withRLS(ctx, async tx) │   │ 403 Forbidden / 404     │
        │  (Postgres RESTRICTIVE) │   │ (No Tenant Oracle)      │
        └─────────────────────────┘   └─────────────────────────┘
```

### 2.1 Role Hierarchy
The platform defines four discrete roles ordered by privilege ceiling:
1. `STUDENT`: Can view own profile, book slots within quota, join confirmed classes, manage timezone/billing.
2. `TEACHER`: Can manage own weekly availability, review assigned students, start scheduled classes, launch instant meetings, and control in-call room-wide volume.
3. `ORG_ADMIN`: Scoped strictly to `viewer.orgId === target.orgId`. Can manage tenant users, assign students to teachers, inspect scheduled classes, review invoices, and observe live classes.
4. `SUPER_ADMIN`: Cross-org authority for global platform diagnostics. Protected root account: `syedamer130@gmail.com`.

### 2.2 Tenant Isolation Guarantees
- Every database query and mutation includes `orgId`. Foreign entities fail closed with `404 Not Found` to prevent tenant oracle discovery.
- **User Identification**: Authenticated identity must resolve by `session.user.id`, never email. User lookup operations strictly query by immutable user IDs from the verified session to eliminate email collision vulnerabilities and prevent cross-tenant impersonation.
- **Root Super Admin Protection**: Server routes (`/api/admin/users`) strictly reject any attempt to demote, delete, or recreate `syedamer130@gmail.com` with `403 Forbidden`.
- **Defense in Depth**: PostgreSQL Row Level Security (`apps/web/src/db/rls-policies.sql`) uses `AS RESTRICTIVE` policies combining tenant and object predicates with `AND`, preventing permissive `OR` tenant leakage.

---

## 3. Canonical Scheduling & Meeting Lifecycle

All scheduling logic converges onto the single source of truth defined in `src/lib/class-room.ts` and `src/lib/class-action.ts`.

### 3.1 Lifecycle States

| State | Window | Condition | Action Label (Teacher / Student) |
|---|---|---|---|
| `UPCOMING` | $> T-60$ min | Scheduled class in future | Countdown badge (Disabled) |
| `READY` | $T-60$ to $T+180$ min | Join window open | "Start Class" / "Join Class" |
| `LIVE` | During class | Room occupied / `IN_PROGRESS` | "Rejoin Class" / "Join Live Class" |
| `EXPIRED` | $> T+180$ min | Class not started within late window | "Expired" (Disabled) |
| `COMPLETED` | Terminal | Class marked ended | "Class Completed" (Disabled) |
| `CANCELLED` | Terminal | Session cancelled | "Class Cancelled" (Disabled) |

### 3.2 Canonical Room Resolution
- Classes for a teacher in a given time slot map to **one canonical occurrence**.
- Direct calls (`/api/calls`) and instant meetings converge onto active or due scheduled classes via `ringParticipantIntoCanonicalRoom()`, preventing competing split rooms.
- Early arriving students wait in the lobby. Only the assigned teacher's arrival marks the session `IN_PROGRESS` and activates student admission into the live room.

---

## 4. Secure Realtime Scheduling & Outbox Architecture

```
  Primary Mutation (e.g. POST /api/admin/assign-student)
  │
  ├─► BEGIN TRANSACTION
  │     ├─► INSERT session / booking / availability
  │     ├─► INSERT scheduling_events (Outbox row: eventId, orgId, version...)
  │     └─► INSERT audit_logs
  ├─► COMMIT TRANSACTION
  │
  └─► afterResponse(drainOutbox({ orgId }))
        │
        ▼
  POST /publish (Bearer Secret) ──► Durable Object AvailabilityHub (idFromName(orgId))
                                       │
                                       ├─► Verify JWT Ticket (HS256, 2m expiry)
                                       └─► Broadcast to Org-Scoped WebSockets
```

### 4.1 Message Protocol
Every real-time event published through the outbox carries 8 mandatory fields:
```typescript
interface SchedulingEventMessage {
  eventId: string;
  orgId: string;
  teacherId?: string;
  actorId: string;
  type:
    | "availability.changed"
    | "time_off.changed"
    | "booking.created"
    | "booking.cancelled"
    | "session.changed"
    | "class.live"
    | "class.ended";
  aggregateId: string;
  committedAt: string;
  version: number;
}
```

### 4.2 Durable Object AvailabilityHub
- Partitioned strictly by `orgId` via `idFromName(orgId)`. Cross-tenant events are impossible.
- Validates signed JWT tickets (`/api/realtime/ticket`) with 2-minute expiration containing claims: `userId`, `orgId`, `role`, `teacherId`.
- Outbox publisher (`drainOutbox`) enforces a dead-letter limit of 5 retry attempts to prevent queue poisoning.
- Clients consume events via `useSchedulingRealtime`, which falls back to safety polling only when the socket is disconnected.

---

## 5. Visual System & Token Specifications

The user interface follows the Apple visionOS "Liquid Glass" design language:

```css
:root {
  /* Surfaces */
  --bg-app: #F5F7FA;
  --bg-dark: #090B0F;
  --surface-glass: rgba(28, 32, 40, 0.72);
  --border-glass: rgba(255, 255, 255, 0.16);
  --glass-blur: 24px;
  --glass-saturation: 160%;
  --glass-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);

  /* Accents & Roles */
  --accent: #0A84FF;
  --success: #30D158;
  --warning: #FF9F0A;
  --danger: #FF453A;
  --text-primary: #17202A;

  /* Geometry */
  --radius-control: 12px;
  --radius-card: 16px;
  --radius-dock: 22px;
  --touch-target-min: 44px;
  --class-action-min-height: 48px;
}
```

### Accessibility Fallbacks
- `@media (prefers-reduced-transparency: reduce)`: Replaces translucent blurred materials with opaque surfaces (`#1C2028`).
- `@media (prefers-reduced-motion: reduce)`: Disables translation travel and scale springs.
- Interactive controls enforce a minimum touch target size of $44 \times 44$ px with WCAG 2.2 AA compliant contrast ratios.

---

## 6. Staged Rollout & Feature Flag Strategy

To ensure zero-downtime adoption and risk mitigation, features are deployed across 5 progressive gates:

```
  Stage 1: P0 Security & Auth Guards ──► Stage 2: Canonical Action State
                                                   │
  Stage 4: Meeting Control Dock      ◄── Stage 3: Realtime Scheduling
         │
         ▼
  Stage 5: Breakouts, Whiteboard & Captions
```

1. **Stage 1 — P0 Security & Authorization (Immediate)**:
   - Centralized `session-access.ts` deployed fail-closed.
   - Elimination of link-possession token auto-minting.
   - Super admin protections active.
2. **Stage 2 — Canonical Class Action State & Navigation UI**:
   - `ClassActionButton` deployed across student and teacher dashboards.
   - T-60 boundary active. Navigation feedback and loading skeletons enabled.
3. **Stage 3 — Realtime Scheduling Outbox & Durable Objects**:
   - Outbox writer enabled inside transactions.
   - Cloudflare Durable Object `AvailabilityHub` activated with polling fallback.
4. **Stage 4 — Virtual Classroom 9-Position Dock**:
   - Meeting controls enabled with canonical desktop 9-position dock and mobile compact dock.
   - Teacher room-wide volume gain control active.
5. **Stage 5 — Collaboration Extensions (Provider Verified)**:
   - Interactive Whiteboard (`WhiteboardOverlay`) and Breakout Rooms enabled following live capacity tests.

---

## 7. Rollback & Disaster Recovery Playbook

If regressions occur in production, follow these isolated rollback paths:

1. **Breakout Rooms & Collaboration Recovery**:
   - Force-close active breakout rooms and return all students to the primary session via `POST /api/sessions/[id]/breakouts` (`action: "CLOSE_ALL"`).
   - Ensure all participants have returned to the main LiveKit room before disabling collaboration features or socket bridges.
2. **Realtime Socket Failure**:
   - Set environment variable `REALTIME_DISABLED=1`.
   - `useSchedulingRealtime` immediately drops WebSocket connections and engages client safety polling without requiring server redeployment.
3. **Meeting UI Regression**:
   - Revert `CustomVideoConference.tsx` component mount to the baseline fallback without rolling back database migrations or authorization rules. (This is a clean component mount revert, not an in-flight dock flag).
   - Preserves underlying LiveKit connection and call stability.
4. **Database Migration Recovery**:
   - Reversible rollback scripts are maintained for every migration:
     - `drizzle/rollback/0007_data_model_parity_rollback.sql`
     - `drizzle/rollback/0008_scheduling_events_version_rollback.sql`
   - Old database columns are maintained in nullable, read-compatible configurations for at least one release cycle.

---

## 8. Operational Telemetry & Alerting Thresholds

Production monitoring alerts trigger under the following conditions:

| Metric | Threshold | Severity | Recommended Action |
|---|---|---|---|
| **Denied Join Attempts** | $> 10$ in 5 min | P1 / Warning | Inspect potential unauthorized access or link expiration |
| **Cross-Tenant Access Attempts** | $> 0$ | P0 / Critical | Immediate security audit of actor and IP address |
| **Outbox Drain Lag** | $> 50$ pending rows | P1 / Warning | Trigger `POST /api/realtime/drain-outbox` and inspect DO health |
| **Dead-Letter Outbox Rows** | $> 0$ (`attempts >= 5`) | P1 / Warning | Inspect poisoned event payload in `scheduling_events` |
| **LiveKit Room / Session Mismatch** | $> 0$ | P1 / Warning | Validate canonical occurrence resolution in `class-room.ts` |
| **WebSocket Reconnect Spikes** | $> 25\%$ drop rate | P1 / Warning | Inspect Cloudflare network or DO instance eviction |
| **Caption Worker Failures** | $> 5$ in 5 min | P1 / Warning | Restart caption worker pool and inspect speech API quota |
| **Breakout Return Failures** | $> 0$ | P1 / Warning | Force-reassign orphaned students to main room via `POST /api/sessions/[id]/breakouts` |
| **Whiteboard DO Errors** | $> 10$ in 5 min | P1 / Warning | Evict corrupted Durable Object instance and verify snapshot storage |

> [!CAUTION]
> **Zero Logging of Credentials & Transcripts**  
> Under no circumstances may application logs, error traces, or telemetry records capture user passwords, LiveKit access tokens, Better Auth cookies, or private lesson audio/transcript data.
