# Iqra Academy — Task Checklist

Everything that's been built so far and what's remaining.

## Phase 1: Schema Foundation ✅

- [x] Drizzle ORM schema: 25 tables, 13 enums
- [x] Per-child quota system (Siblings plan: 4/week per child)
- [x] Seed script with test data (1 org, 6 users, 4 plans)
- [x] All 23 API routes fixed for new schema
- [x] TypeScript: 0 errors

## Phase 2: Integrations ✅

- [x] Google Sign-In (Better Auth + social provider)
- [x] Admin panel at `/admin` (AdminJS, 25 tables, 6 nav groups)
- [x] Postgres RLS policies (15+ rules, `withRLS()` helper)
- [x] Twenty CRM integration (replaced HubSpot, outbox pattern)
- [x] Flutter mobile app scaffold (14 Dart files)

## Phase 3a: Docker Deployment ✅

- [x] `.dockerignore`, improved `Dockerfile` with healthcheck
- [x] `docker-compose.yml` with 9 containers
- [x] `docs/deployment-dockploy.md` step-by-step guide
- [x] All env vars documented in `.env.example`

## Phase 3b: Web Frontend ✅

- [x] Landing page (hero, features, pricing, CTA)
- [x] Login page (email + Google Sign-In)
- [x] Register page (Google-first signup)
- [x] Dashboard layout (sidebar + auth guard)
- [x] Dashboard home (stats, profiles, quick actions)
- [x] Booking page (3-step wizard: track → date → slot)

## Phase 3c: UI Redesign ✅

- [x] Apple/Malewicz aesthetic: light mode, whitespace, subtle shadows
- [x] CSS design system with custom properties
- [x] All 7 files redesigned
- [x] TypeScript: 0 errors

## Phase 4: Remaining (TODO)

- [ ] Push schema and seed database (user has .env ready)
- [ ] Test app locally (`npm run dev`)
- [ ] Stripe checkout + webhook flow
- [ ] Cal.com scheduling integration
- [ ] Resend email templates
- [ ] Flutter SDK install + device testing
- [ ] CI/CD pipeline
- [ ] Staging + production deployment
