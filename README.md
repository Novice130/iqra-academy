# 📖 Quran Learning Management System (Quran LMS)

> A production-ready, multi-tenant platform for teaching Qaidah, Quran reading, and Hifz (memorization) via live 1:1, group, and webinar sessions.

**Built with**: Next.js 16 · TypeScript · Drizzle ORM · Neon Postgres · Better Auth · Stripe · Cal.com · Jitsi · Resend · Web Push

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 15 App Router + Tailwind + shadcn/ui               │
│  └─ Server Components (default) + Client Islands            │
├─────────────────────────────────────────────────────────────┤
│                     API LAYER (23 routes)                    │
│  ├─ /api/auth/[...all]     → Better Auth                   │
│  ├─ /api/students/*        → Profiles, Bookings, Progress  │
│  ├─ /api/teachers/*        → Sessions, Feedback, Call Now  │
│  ├─ /api/sessions/*        → Join (Jitsi JWT), Extend      │
│  ├─ /api/chat/*            → Messages, Moderation          │
│  ├─ /api/admin/*           → Users, Refunds, Exports       │
│  ├─ /api/super/*           → Org Management                │
│  └─ /api/webhooks/*        → Stripe, Cal.com               │
├─────────────────────────────────────────────────────────────┤
│                   BUSINESS LOGIC LAYER                      │
│  ├─ rbac.ts      → Server-side role hierarchy              │
│  ├─ quota.ts     → Ledger-based class entitlements         │
│  ├─ stripe.ts    → Manual invoice subscriptions            │
│  ├─ jitsi.ts     → JWT room generation                     │
│  ├─ audit.ts     → Append-only audit logging               │
│  ├─ email.ts     → Transactional emails (Resend)           │
│  └─ push.ts      → Web Push notifications (VAPID)          │
├─────────────────────────────────────────────────────────────┤
│                      DATA LAYER                             │
│  Drizzle ORM (postgres.js) → Neon Postgres                  │
│  17 tables · Multi-tenant (org_id everywhere)               │
│  Ledger pattern · Soft deletes · Audit trail                │
└─────────────────────────────────────────────────────────────┘

       EXTERNAL SERVICES
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  Stripe  │ │  Cal.com │ │  Jitsi   │ │  Resend  │
  │ Payments │ │Scheduling│ │  Video   │ │  Email   │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 🎯 Core Features

| Feature | Description |
|---------|------------|
| **Multi-tenant** | Every org gets isolated data via `orgId` on every table |
| **4 Roles** | Student → Teacher → Org Admin → Super Admin (hierarchy) |
| **Session Types** | 1:1, Group (3), Webinar (20 students, muted) |
| **Pricing** | Free, Individual ($70/mo), Group ($50/mo), Siblings ($100/mo, 3 kids) |
| **Manual Invoice** | Stripe `send_invoice` — families pay on their schedule |
| **Quota System** | Ledger pattern: 4 classes/week, race-condition safe |
| **Live Classes** | Jitsi JWT rooms with teacher as moderator |
| **Call Now** | Teacher triggers Web Push → student joins Jitsi room |
| **Moderated Chat** | Teachers/admins can hide inappropriate messages |
| **Audio Feedback** | Teachers record Tajweed pronunciation feedback |
| **Progress Tracking** | Lesson completion + teacher approval |
| **Observer Emails** | Weekly digest to family members |
| **Impersonation** | Admins debug student issues as that user |
| **Coupons** | Percentage or fixed discount, synced to Stripe |
| **CSV Export** | Admins export users, bookings data |
| **Audit Logs** | Every sensitive action recorded with actor, IP, timestamp |

---

## 📁 Project Structure

```
quran-lms/
├── src/
│   ├── db/
│   │   └── schema.ts              # 17 tables + 8 enums (Drizzle ORM)
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...all]/     # Better Auth catch-all
│   │   │   ├── students/
│   │   │   │   ├── profiles/      # GET/POST student profile s
│   │   │   │   ├── bookings/      # GET/POST bookings (quota)
│   │   │   │   └── progress/      # GET progress records
│   │   │   ├── teachers/
│   │   │   │   ├── sessions/      # GET assigned sessions
│   │   │   │   ├── feedback/      # POST audio feedback
│   │   │   │   └── call-now/      # POST push notification
│   │   │   ├── sessions/[id]/
│   │   │   │   ├── join/          # GET Jitsi JWT
│   │   │   │   ├── extend/         # POST extend session
│   │   │   │   └── recording/     # POST toggle recording
│   │   │   ├── chat/
│   │   │   │   ├── messages/      # GET/POST chat
│   │   │   │   └── moderate/      # POST hide/unhide
│   │   │   ├── admin/
│   │   │   │   ├── users/         # GET/POST/PATCH users
│   │   │   │   ├── refunds/       # POST Stripe refunds
│   │   │   │   ├── impersonate/   # POST impersonation
│   │   │   │   ├── exports/       # GET CSV exports
│   │   │   │   ├── coupons/       # GET/POST coupons
│   │   │   │   └── observers/     # GET/POST observer emails
│   │   │   ├── super/orgs/        # GET/POST organizations
│   │   │   ├── webhooks/
│   │   │   │   ├── stripe/        # Stripe webhook handler
│   │   │   │   └── calcom/        # Cal.com webhook handler
│   │   │   └── health/            # Health check
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── auth.ts                # Better Auth + drizzleAdapter
│   │   ├── db.ts                  # Drizzle client (postgres.js)
│   │   ├── rbac.ts                # Role-based access control
│   │   ├── stripe.ts              # Stripe helpers
│   │   ├── jitsi.ts               # JWT room generation
│   │   ├── quota.ts               # Ledger-based quota
│   │   ├── audit.ts               # Audit logging
│   │   ├── email.ts               # Resend emails
│   │   ├── push.ts                # Web Push (VAPID)
│   │   ├── calcom.ts              # Cal.com types + verify
│   │   └── errors.ts              # Typed error handling
│   └── components/                # UI components (shadcn/ui)
├── drizzle.config.ts              # Drizzle Kit migration config
├── docs/
│   ├── integration-stripe.md      # Stripe setup guide
│   ├── integration-calcom.md      # Cal.com setup guide
│   ├── integration-jitsi.md       # Jitsi setup guide
│   └── deployment-runbook.md      # Staging → production
├── .env.example                   # All env vars documented
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Dockploy reference
├── README.md                      # ← You are here
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+** and **npm 10+**
- **PostgreSQL** (or a [Neon](https://neon.tech) database)

### 1. Clone and Install
```bash
git clone <repository-url>
cd quran-lms
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values (see .env.example for detailed comments)
```

### 3. Set Up Database
```bash
# Push schema to database (development — applies changes directly)
npx drizzle-kit push

# Or generate a migration file (production — versioned SQL)
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 💳 Pricing Tiers

| Tier | Price | Sessions | Type | Chat | Max Students |
|------|-------|----------|------|------|--------------|
| Free | $0 | Webinar only | Webinar (20) | ❌ | 20 (muted) |
| Individual | $70/mo | 4/week | 1:1 | ✅ | 1 |
| Group | $50/mo | 4/week | Group (3) | ✅ | 3 |
| Siblings | $100/mo | 4/week each | 1:1 | ✅ | 3 children |

Payment default: **Manual invoice** (Stripe `send_invoice`, 7-day due).

---

## 🔐 Security Model

1. **Server-side RBAC**: All role checks in `rbac.ts` — never trust the client
2. **Org-scoped queries**: `orgScope()` helper enforces data isolation
3. **Webhook verification**: Stripe (signature) + Cal.com (HMAC-SHA256)
4. **Audit logging**: Every sensitive action → `AuditLog` table (append-only)
5. **Soft deletes**: Users/orgs are never truly deleted
6. **JWT scoping**: Jitsi tokens are room-specific and time-limited (2h)
7. **Input validation**: Zod schemas on every API route

---

## 📚 For Junior Developers

Every function in this codebase has **TSDoc comments** explaining:
- **WHY** the code exists (business rule)
- **HOW** it works (technical explanation)
- **FAILURE MODES** (what can go wrong)

Key files to study:
1. `src/db/schema.ts` — Database design decisions (Drizzle schema)
2. `src/lib/rbac.ts` — How authorization works
3. `src/lib/quota.ts` — The ledger pattern
4. `src/lib/stripe.ts` — Payment integration patterns
5. `src/app/api/webhooks/stripe/route.ts` — Event-driven architecture

---

## 🏗️ Deployment (Dockploy)

See [docs/deployment-runbook.md](docs/deployment-runbook.md) for full instructions.

Quick deploy:
```bash
# Build Docker image
docker build -t quran-lms .

# Run with docker-compose
docker compose up -d
```

---

## 📖 Integration Guides

- [Stripe Setup](docs/integration-stripe.md) — Products, webhooks, manual invoices, coupons
- [Cal.com Setup](docs/integration-calcom.md) — Self-hosting, event types, webhook config
- [Jitsi Setup](docs/integration-jitsi.md) — JWT auth, room management, moderator permissions

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16 App Router | Server-first, React 19, API routes in one |
| Language | TypeScript 5 | Type safety catches bugs at compile time |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-first + accessible components |
| Auth | Better Auth | Server-side sessions, Drizzle adapter |
| ORM | Drizzle ORM | TypeScript-first, zero codegen, lightweight |
| Database | Neon Postgres | Serverless Postgres with connection pooling |
| Payments | Stripe | Industry standard, manual invoice support |
| Scheduling | Cal.com (self-hosted) | Open-source, full scheduling engine |
| Video | Jitsi (self-hosted) | Open-source, JWT-secured rooms |
| Email | Resend | Developer-first transactional email |
| Notifications | Web Push (VAPID) | No app install needed |
| Deploy | Docker + Dockploy | VPS-friendly, multi-project |

---

## 🔄 ORM Migration: Prisma → Drizzle

This project was originally built with Prisma ORM and was migrated to **Drizzle ORM** for the following reasons:

| Reason | Details |
|--------|---------|
| **No code generation step** | Prisma requires `prisma generate` on every schema change; Drizzle schemas are pure TypeScript — no build step needed |
| **Better Auth compatibility** | Better Auth's `drizzleAdapter` integrates more cleanly than the Prisma adapter, with `usePlural` table naming support |
| **Smaller bundle size** | Drizzle adds ~50KB vs Prisma's ~2MB engine binary, critical for serverless/edge deployments |
| **TypeScript-native** | Schema, queries, and migrations are all TypeScript — no DSL to learn |
| **Simpler Docker builds** | No need to copy `prisma/` folder or `.prisma/` engine into production images |
| **SQL-like API** | Drizzle's query builder maps directly to SQL, making complex queries more predictable |

---

## License

Private — All rights reserved.
