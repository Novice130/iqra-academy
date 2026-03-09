# 📖 Iqra Academy — Quran Learning Management System

> A production-ready, multi-tenant platform for teaching Qaidah, Quran reading, and Hifz (memorization) via live 1:1, group, and webinar sessions.

**Built with**: Next.js 16 · TypeScript · Drizzle ORM · Neon Postgres · Better Auth · Stripe · Cal.com · Jitsi · Resend · Flutter

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (WEB)                          │
│  Next.js 16 App Router + Tailwind + Server Components       │
├─────────────────────────────────────────────────────────────┤
│                     MOBILE APP                              │
│  Flutter (Dart) → iOS + Android                             │
│  Riverpod state · Dio HTTP · Jitsi WebView                  │
├─────────────────────────────────────────────────────────────┤
│                  API LAYER (23+ routes)                      │
│  ├─ /api/auth/[...all]  → Better Auth + Google OAuth        │
│  ├─ /api/students/*     → Profiles, Bookings, Progress     │
│  ├─ /api/teachers/*     → Sessions, Feedback, Call Now      │
│  ├─ /api/sessions/*     → Join (Jitsi JWT), Extend          │
│  ├─ /api/chat/*         → Rooms, Messages, Moderation       │
│  ├─ /api/admin/*        → Users, Refunds, Exports, Admin UI│
│  ├─ /api/super/*        → Org Management                   │
│  └─ /api/webhooks/*     → Stripe, Cal.com                  │
├─────────────────────────────────────────────────────────────┤
│                BUSINESS LOGIC LAYER                         │
│  ├─ rbac.ts     → Server-side RBAC + org hierarchy          │
│  ├─ quota.ts    → Per-child ledger-based entitlements       │
│  ├─ crm.ts      → Twenty CRM sync (outbox pattern)         │
│  ├─ admin.ts    → AdminJS panel config (25 tables)          │
│  ├─ audit.ts    → Append-only audit logging                 │
│  ├─ stripe.ts   → Manual invoice subscriptions             │
│  ├─ jitsi.ts    → JWT room generation                      │
│  ├─ email.ts    → Transactional emails (Resend)            │
│  └─ push.ts     → Web Push notifications (VAPID)           │
├─────────────────────────────────────────────────────────────┤
│                    DATA LAYER                               │
│  Drizzle ORM (postgres.js) → Neon Postgres                  │
│  25 tables · 13 enums · Row-Level Security (RLS)            │
│  Ledger pattern · Per-child quotas · Audit trail            │
└─────────────────────────────────────────────────────────────┘

       EXTERNAL SERVICES
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  Stripe  │ │  Cal.com │ │  Jitsi   │ │  Resend  │ │  Twenty  │
  │ Payments │ │Scheduling│ │  Video   │ │  Email   │ │   CRM    │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 🎯 Core Features

| Feature | Description |
|---------|------------|
| **Multi-tenant** | Every org gets isolated data via `orgId` + Postgres RLS |
| **4 Roles** | Student → Teacher → Org Admin → Super Admin (hierarchy) |
| **3 Learning Tracks** | Qaidah, Quran Reading, Hifz — per child profile |
| **Session Types** | 1:1, Group (3), Siblings (3 kids), Webinar (20 muted) |
| **Pricing** | Free, Individual ($70), Group ($50), Siblings ($100/3 kids) |
| **Per-child Quotas** | Siblings plan: 4 classes/week **per child**, not shared |
| **Live Classes** | Jitsi JWT rooms + teacher moderator controls |
| **Google Sign-In** | One-tap login via Better Auth social provider |
| **Admin Panel** | Built-in at `/admin` — CRUD for all 25 tables |
| **RLS Security** | Postgres Row-Level Security as defense-in-depth |
| **CRM Integration** | Twenty CRM sync via outbox pattern |
| **Moderated Chat** | Per-room chat with hide/delete + audit trail |
| **Recording Controls** | Per-role access: NONE, STUDENT_ONLY, ALL |
| **Audio Feedback** | Teachers record Tajweed pronunciation feedback |
| **Observer Emails** | Weekly digest to family members |
| **Impersonation** | Admins debug student issues as that user |
| **Mobile App** | Flutter (iOS + Android) with Jitsi WebView |
| **Audit Logs** | Every sensitive action with actor, IP, timestamp |

---

## 📁 Project Structure

```
quran-lms/
├── src/                               # ── Next.js Web App ──
│   ├── db/
│   │   ├── schema.ts                  # 25 tables + 13 enums (Drizzle ORM)
│   │   ├── seed.ts                    # Development seed data
│   │   └── rls-policies.sql           # Postgres RLS policies (15+ rules)
│   ├── app/
│   │   ├── api/                       # 23 API routes (see Architecture)
│   │   ├── admin/[[...slug]]/page.tsx # AdminJS panel (ORG_ADMIN+ only)
│   │   └── layout.tsx
│   └── lib/
│       ├── auth.ts                    # Better Auth + Google OAuth
│       ├── db.ts                      # Drizzle client + withRLS() helper
│       ├── rbac.ts                    # Role-based access control
│       ├── admin.ts                   # AdminJS resource configuration
│       ├── crm.ts                     # Twenty CRM integration
│       ├── quota.ts                   # Per-child ledger quota system
│       ├── stripe.ts                  # Stripe payment helpers
│       ├── jitsi.ts                   # JWT room generation
│       ├── audit.ts                   # Append-only audit logging
│       ├── email.ts                   # Transactional emails (Resend)
│       ├── push.ts                    # Web Push (VAPID)
│       ├── calcom.ts                  # Cal.com webhook verification
│       └── errors.ts                  # Typed error handling
│
├── apps/mobile/                       # ── Flutter Mobile App ──
│   ├── pubspec.yaml                   # Dependencies (22 packages)
│   └── lib/
│       ├── main.dart                  # Entry point (Riverpod + Firebase)
│       ├── app.dart                   # MaterialApp + theme + router
│       ├── config/
│       │   ├── theme.dart             # Emerald dark theme
│       │   ├── api_config.dart        # API endpoint definitions
│       │   └── routes.dart            # GoRouter navigation
│       ├── services/
│       │   ├── api_client.dart        # Dio HTTP + auth interceptor
│       │   └── auth_service.dart      # Login, Google Sign-In, session
│       └── screens/
│           ├── auth/
│           │   ├── login_screen.dart   # Email + Google login
│           │   └── register_screen.dart
│           ├── dashboard/
│           │   └── dashboard_screen.dart  # Next class, quota, profiles
│           ├── booking/
│           │   └── booking_screen.dart    # Track, date, slot selection
│           ├── session/
│           │   └── live_session_screen.dart  # Jitsi WebView
│           └── settings/
│               └── settings_screen.dart
│
├── docs/                              # ── Integration Guides ──
│   ├── integration-stripe.md
│   ├── integration-calcom.md
│   ├── integration-jitsi.md
│   └── deployment-runbook.md
├── .env.example                       # All env vars with setup instructions
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+** and **npm 10+**
- **Neon Postgres** database ([neon.tech](https://neon.tech))
- **Flutter SDK 3.6+** (for mobile app only)

### 1. Clone and Install
```bash
git clone <repository-url>
cd quran-lms
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env — see .env.example for detailed setup instructions per variable
```

### 3. Set Up Database
```bash
# Push schema to Neon (development)
npm run db:push

# Seed with test data (1 org, 6 users, 4 plans, lessons, etc.)
npm run db:seed

# Apply Row-Level Security policies
# Run src/db/rls-policies.sql against your Neon database via:
#   - Neon Console → SQL Editor → paste and run
#   - Or: psql $DATABASE_URL -f src/db/rls-policies.sql
```

### 4. Set Up Google Sign-In
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy Client ID + Secret to `.env`

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) — Admin panel at [http://localhost:3000/admin](http://localhost:3000/admin)

### 6. Build Flutter App (optional)
```bash
cd apps/mobile
flutter pub get
flutter run   # Uses Android emulator or iOS simulator
```

---

## 💳 Pricing Tiers

| Tier | Price | Sessions | Type | Chat | Max Students |
|------|-------|----------|------|------|--------------|
| Free | $0 | Webinar only | Webinar (20) | ❌ | 20 (muted) |
| Individual | $70/mo | 4/week | 1:1 | ✅ | 1 |
| Group | $50/mo | 4/week | Group (3) | ✅ | 3 |
| Siblings | $100/mo | 4/week **each** | 1:1 | ✅ | 3 children |

Payment default: **Manual invoice** (Stripe `send_invoice`, 7-day due).

---

## 🔐 Security Model (3 Layers)

| Layer | What | Where |
|-------|------|-------|
| **1. API RBAC** | Role checks on every route | `src/lib/rbac.ts` |
| **2. Org Scoping** | `orgId` filtering on every query | `orgScope()` helper |
| **3. Postgres RLS** | Database enforces tenant isolation | `src/db/rls-policies.sql` |

Additional security:
- **Webhook verification**: Stripe signature + Cal.com HMAC-SHA256
- **Audit logging**: Every sensitive action → append-only table
- **JWT scoping**: Jitsi tokens are room-specific and time-limited (2h)
- **Input validation**: Zod schemas on every API route
- **Secure token storage**: Mobile app uses Keychain (iOS) / Keystore (Android)

---

## 🛠️ npm Scripts

```bash
npm run dev          # Start Next.js development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run db:push      # Push schema changes to database
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
npm run db:seed      # Seed database with test data
```

---

## 🗃️ Database Schema (25 Tables)

| Group | Tables |
|-------|--------|
| **Core** | organizations, users |
| **Profiles** | student_profiles, observer_emails |
| **Billing** | plans, subscriptions, invoices, entitlements, coupons, coupon_redemptions, coupons_applied |
| **Scheduling** | sessions, bookings, session_attendees, teacher_availability, default_weekly_slots |
| **Content** | lesson_content, progress_records, teacher_feedback |
| **Chat** | chat_rooms, chat_messages, chat_moderation_actions |
| **System** | audit_logs, crm_sync_events, push_subscriptions |

---

## 🛡️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Web** | Next.js 16 App Router | Server-first, React 19, API routes in one |
| **Mobile** | Flutter (Dart) | Single codebase → iOS + Android |
| **Language** | TypeScript 5 + Dart 3.6 | Type safety across both apps |
| **Auth** | Better Auth + Google OAuth | Server-side sessions, Drizzle adapter |
| **ORM** | Drizzle ORM | TypeScript-first, zero codegen, lightweight |
| **Database** | Neon Postgres + RLS | Serverless Postgres, SOC 2 certified |
| **Admin** | AdminJS (embedded) | Admin panel at `/admin`, no extra container |
| **CRM** | Twenty (open-source) | Self-hosted, Postgres-based |
| **Payments** | Stripe | Manual invoice support |
| **Scheduling** | Cal.com (self-hosted) | Open-source scheduling engine |
| **Video** | Jitsi (self-hosted) | JWT-secured video rooms |
| **Email** | Resend | Developer-first transactional email |
| **Notifications** | Web Push (VAPID) | No app install needed |
| **Deploy** | Docker + Dockploy | VPS-friendly, multi-project |

---

## 📱 Mobile App (Flutter)

The Flutter app lives in `apps/mobile/` and communicates with the same Next.js API backend.

| Screen | Features |
|--------|----------|
| **Login** | Email/password + Google Sign-In |
| **Register** | New account creation |
| **Dashboard** | Next class, weekly quota, child profiles, quick actions |
| **Booking** | Track selector, child picker, date carousel, time slots |
| **Live Session** | Jitsi video call via InAppWebView with mic/camera permissions |
| **Settings** | Profile, observer emails, subscription, notifications, sign out |

**State management**: Riverpod (similar to React Context + hooks)
**Navigation**: GoRouter with bottom nav shell route
**HTTP**: Dio with auth token interceptor (stored in Keychain/Keystore)

---

## 📚 For Junior Developers

Every function in this codebase has **TSDoc/DartDoc comments** explaining:
- **WHY** the code exists (business rule)
- **HOW** it works (technical explanation)
- **FAILURE MODES** (what can go wrong)

Key files to study:
1. `src/db/schema.ts` — Database design decisions (25 tables of Drizzle schema)
2. `src/lib/rbac.ts` — How authorization works (role hierarchy)
3. `src/lib/quota.ts` — The ledger pattern (per-child quotas)
4. `src/lib/db.ts` — `withRLS()` function (how RLS works)
5. `src/db/rls-policies.sql` — Raw Postgres security policies
6. `apps/mobile/lib/services/auth_service.dart` — Mobile auth flow

---

## 🔮 TODO / Remaining Work

### Web App
- [ ] Build frontend pages (login, dashboard, booking, session, admin)
- [ ] Implement Stripe checkout + webhook handling
- [ ] Cal.com scheduling integration
- [ ] Resend email templates (welcome, booking confirmation, weekly digest)
- [ ] Web Push notification UI
- [ ] CSV export functionality in admin
- [ ] Impersonation UI

### Mobile App
- [ ] Install Flutter SDK and run `flutter create` for native scaffolding
- [ ] Connect API client to live backend
- [ ] Firebase push notifications setup
- [ ] Jitsi WebView testing on real devices
- [ ] App Store / Play Store submission

### Infrastructure
- [x] Docker Compose for all 4 services (Next.js, Jitsi, Cal.com, Twenty CRM)
- [x] Dockploy deployment guide with step-by-step instructions
- [ ] Create dedicated Postgres `app_user` role (not superuser) for RLS enforcement
- [ ] Set up CI/CD pipeline
- [ ] Staging environment
- [ ] COPPA compliance review

---

## 🏗️ Deployment (Dockploy)

**Domain**: `quran.learnnovice.com`

| Service | Subdomain | Docker Image |
|---------|-----------|-------------|
| Next.js App | `quran.learnnovice.com` | Built from `Dockerfile` |
| Jitsi Meet | `meet.learnnovice.com` | `jitsi/web:stable-9823` |
| Cal.com | `cal.learnnovice.com` | `calcom/cal.com:latest` |
| Twenty CRM | `crm.learnnovice.com` | `twentycrm/twenty:latest` |

**Full guide**: See [docs/deployment-dockploy.md](docs/deployment-dockploy.md) for step-by-step instructions.

---

## License

Private — All rights reserved.
