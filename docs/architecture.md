# Architecture

What runs where, as of 2026-10-12. Until then the site ran on Cloudflare
Workers through `@opennextjs/cloudflare`; the notes from that era are in
`archive/worker-limits.md` and no longer describe the live system.

## Deployment

```
  Browser ──► Cloudflare (DNS + proxy, CDN, DDoS)
                    │  HTTPS, Full (strict)
                    ▼
        ┌──────────────────────────────────────────────┐
        │  Hetzner VPS — Docker Compose                │
        │                                              │
        │  caddy :443 ─┬─ /api/realtime/ws ─► realtime │
        │              └─ everything else ──► web      │
        │                                              │
        │  web       Next.js standalone, Node 24       │
        │  realtime  WebSocket hub + outbox timer      │
        └───────┬──────────────────────────────────────┘
                │
     ┌──────────┼───────────────────────┐
     ▼          ▼                       ▼
 Neon Postgres  LiveKit Cloud      Stripe / Resend
 (pooled TCP)   (SFU + TURN)
```

One Next.js app at `apps/web`, built into a Docker image by GitHub Actions,
pushed to GHCR and pulled by a single VPS. Three containers, defined in
`deploy/docker-compose.yml`; `web` and `realtime` are the same image started
with different commands. How to set the server up, deploy, roll back and cut
over is in [deploy-vps.md](deploy-vps.md).

- **Edge** — Cloudflare stays in front as DNS and proxy. Caddy terminates TLS
  with a Cloudflare Origin CA certificate and only believes forwarding headers
  from Cloudflare's address ranges, so the client IP in `x-forwarded-for` is
  the real one. The visitor's timezone comes from Cloudflare's `cf-timezone`
  header (the "Add visitor location headers" managed transform).
- **Web** — stock `node server.js` from Next's standalone output. No custom
  server, no bundle patching. It is one long-lived process, so module-level
  state (the database pool) persists across requests, and work deferred past
  the response simply keeps running.
- **Realtime** — a small sidecar that owns the scheduling WebSocket
  (`/api/realtime/ws`), because a Next route handler cannot answer a 101. It
  holds one hub per `orgId` in memory, which is correct for exactly one
  instance: running two would split subscribers between them. The app publishes
  to it over the compose network (`POST /publish`, authenticated with
  `REALTIME_SECRET`). The sidecar also runs the once-a-minute timer that calls
  `/api/realtime/drain-outbox`, retrying events whose first publish failed.
- **Database** — Neon Postgres over `postgres.js`, one pool per process against
  Neon's pooled endpoint. `withDb()` and `withHttpDb()` in `src/lib/db.ts`
  still wrap every route and page, but they are now only compatibility
  wrappers: both resolve to the same pool and transactions work inside either.
  The split mattered on Workers, where a pool could not outlive a request.
  Moving the database later is a change of `DATABASE_URL`.
- **Large files** — the Android APKs and desktop installers sit in
  `/opt/novicetutor/downloads` on the server, mounted read-only into `web` and
  streamed by `/api/app-download/[file]`. See `publishing-builds.md`.
- **Auth** — Better Auth, cookie sessions. `session.user.role` is always
  undefined (no `additionalFields` configured) — read the role from the `users`
  table. Email verification and Google sign-in are wired but not enabled.
- **Video** — LiveKit Cloud. See `integration-livekit.md`, which also covers
  what moving to a self-hosted SFU would involve.
- **Payments** — Stripe. **Email** — Resend.
- **Mobile** — `apps/mobile`, Flutter: a WebView shell over the site, plus FCM
  push and native screen capture. See `mobile-app.md`.

## Schema

Drizzle ORM, `apps/web/src/db/schema.ts`, ~30 tables. Multi-tenant: nearly
everything carries `orgId`, and there is one org today
(`seed_org_iqra_academy`). Roles are STUDENT, TEACHER, ORG_ADMIN, SUPER_ADMIN,
enforced through `requireAuth` / `requireRole` in `src/lib/rbac.ts`.

Migrations are hand-written scripts run against Neon, not `drizzle-kit push` —
see the deploy notes for why that tool misbehaves against this database.

How to apply (the journal is intentionally NOT the source of truth —
`meta/_journal.json` tracks only the original `0000` snapshot, so
`drizzle-kit migrate` would silently skip `0001+`; do NOT rely on it):

```bash
# In order, against the target Neon branch:
psql $DATABASE_URL -f apps/web/drizzle/0001_session_attendance.sql
# ... 0002 ... 0008 in numeric order, then:
psql $DATABASE_URL -f apps/web/drizzle/0009_drop_users_org_default.sql
```

Rollback scripts live beside them in `apps/web/drizzle/rollback/` and are
lossy where noted (enum values cannot be removed; dropped columns lose data).
A rollback is only "tested" once it has run forward+back+forward on an
isolated branch with the output pasted into the review record.

## What is aspirational, not live

Worth knowing before you trust a file:

- **Cal.com** — `src/lib/calcom.ts` and `/api/webhooks/calcom` exist and are
  written, but nothing in the product calls out to Cal.com. Booking and
  teacher availability are still mock UI.
- **Twenty CRM** — `src/lib/crm.ts` was never called and was removed
  (2026-10-26). The `crm_sync_events` table is still in the schema, unused.
- **Push notifications** — `src/lib/push.ts` and the `push_subscriptions` table
  exist and are unused. Everything in the app is polling. This is the main
  thing the mobile app is meant to unlock.
- **RLS** — `src/db/rls-policies.sql` is present; authorisation in practice is
  done in application code.
