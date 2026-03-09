# Iqra Academy — Architecture & Implementation Plan

## Deployment Architecture

```
                    ┌──────────────────────────────────┐
                    │          DOCKPLOY (VPS)           │
                    │  (manages all Docker containers)  │
                    ├──────────────────────────────────┤
                    │                                    │
 quran.learnnovice.com ───→  🌐 Next.js App (:3000)    │
                    │                                    │
 cal.learnnovice.com ────→  📅 Cal.com (:3001)          │
                    │                                    │
 meet.learnnovice.com ───→  📹 Jitsi Meet (:8443)      │
                    │                                    │
 crm.learnnovice.com ────→  📊 Twenty CRM (:3002)      │
                    │                                    │
                    └──────────────────────────────────┘
                                    │
                                    ▼
                    ☁️ Neon Postgres (managed, external)
                    ☁️ Stripe (managed, external)
                    ☁️ Resend (managed, external)
```

## Self-Hosted Services (4)

| Service | Purpose | Docker Image |
|---------|---------|-------------|
| Next.js App | Web app + API + admin | Built from `Dockerfile` |
| Jitsi Meet | Video calls (4 containers) | `jitsi/*:stable-9823` |
| Cal.com | Scheduling & booking | `calcom/cal.com:latest` |
| Twenty CRM | Contact management | `twentycrm/twenty:latest` |

## Managed Services (3)

| Service | Purpose | Provider |
|---------|---------|----------|
| Neon Postgres | Database + RLS | neon.tech |
| Stripe | Payments | stripe.com |
| Resend | Email | resend.com |

## Flutter App

Lives at `apps/mobile/` inside the monorepo. Docker ignores it via `.dockerignore`. You build it locally with `flutter run`.

## Neon Database Branching

**Recommended setup:**
- `main` branch → production database
- `dev` branch → development database (isolated, copy-on-write)

Create a dev branch in Neon Console → Branches → Create Branch.
Use the dev branch connection string in your local `.env`.

## Key Files

| File | Purpose |
|------|---------|
| `src/db/schema.ts` | 25 tables + 13 enums |
| `src/db/rls-policies.sql` | 15+ Postgres RLS policies |
| `src/lib/auth.ts` | Better Auth + Google OAuth |
| `src/lib/rbac.ts` | Role hierarchy |
| `src/lib/db.ts` | Drizzle client + `withRLS()` |
| `src/lib/admin.ts` | AdminJS configuration |
| `src/lib/crm.ts` | Twenty CRM sync |
| `docker-compose.yml` | All 9 containers |
| `.env.example` | Every env var documented |
