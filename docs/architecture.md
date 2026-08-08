# Architecture

What runs where, as of 2026-08-06. The previous version of this page described
four Docker containers on a VPS managed by Dockploy, with Jitsi for video —
none of which has been true for a long time.

## Deployment

```
                    ┌───────────────────────────────┐
                    │   Cloudflare Workers          │
                    │   novicetutor.com             │
                    │   Next.js via @opennextjs      │
                    └───────────┬───────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐   ┌──────────▼─────────┐   ┌─────────▼────────┐
│ Neon Postgres  │   │  LiveKit Cloud     │   │ Stripe / Resend  │
│ (serverless)   │   │  (SFU + TURN)      │   │                  │
└────────────────┘   └────────────────────┘   └──────────────────┘
```

One Next.js app at `apps/web`, deployed to Cloudflare Workers with
`@opennextjs/cloudflare` and Wrangler (`npm run deploy:cf`). There is no VPS,
no Docker, and no container orchestration anywhere in the live system.

- **Database** — Neon Postgres. Every DB-touching route or page must be wrapped
  in one of two entry points (`src/lib/db.ts`), because Workers cannot reuse a
  connection pool across requests: **`withDb()`** for anything that opens a
  transaction (WebSocket pool), **`withHttpDb()`** for handlers that only read
  and write rows (one `fetch` per query, no pool). Getting this wrong is not a
  type error — transactions throw at runtime under the HTTP driver. Choosing
  the pool everywhere is what caused two outages: see `worker-limits.md`.
- **Large files** — R2 (`novicetutor-app`), streamed by a route handler. A
  Workers static asset is capped at 25 MiB, and the Worker has 128 MB of
  memory, so nothing big may be buffered. See `worker-limits.md`.
- **Auth** — Better Auth, cookie sessions. `session.user.role` is always
  undefined (no `additionalFields` configured) — read the role from the `users`
  table. Email verification and Google sign-in are wired but not enabled.
- **Video** — LiveKit Cloud. See `integration-livekit.md`, which also covers
  what moving to a self-hosted SFU would involve.
- **Payments** — Stripe. **Email** — Resend.
- **Mobile** — `apps/mobile`, Flutter: a WebView shell over the site, plus FCM
  push and native screen capture. APKs are served from R2. See `mobile-app.md`.

## Schema

Drizzle ORM, `apps/web/src/db/schema.ts`, ~30 tables. Multi-tenant: nearly
everything carries `orgId`, and there is one org today
(`seed_org_iqra_academy`). Roles are STUDENT, TEACHER, ORG_ADMIN, SUPER_ADMIN,
enforced through `requireAuth` / `requireRole` in `src/lib/rbac.ts`.

Migrations are hand-written scripts run against Neon, not `drizzle-kit push` —
see the deploy notes for why that tool misbehaves against this database.

## What is aspirational, not live

Worth knowing before you trust a file:

- **Cal.com** — `src/lib/calcom.ts` and `/api/webhooks/calcom` exist and are
  written, but nothing in the product calls out to Cal.com. Booking and
  teacher availability are still mock UI.
- **Twenty CRM** — `src/lib/crm.ts` exists; same story.
- **Push notifications** — `src/lib/push.ts` and the `push_subscriptions` table
  exist and are unused. Everything in the app is polling. This is the main
  thing the mobile app is meant to unlock.
- **RLS** — `src/db/rls-policies.sql` is present; authorisation in practice is
  done in application code.
