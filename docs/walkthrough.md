# Iqra Academy — What's Been Built (Walkthrough)

## Overview

| Phase | What | Status |
|-------|------|--------|
| 1 | Schema (25 tables, 13 enums, seed, API fixes) | ✅ |
| 2 | Google Sign-In, Admin Panel, RLS, Twenty CRM, Flutter | ✅ |
| 3a | Docker (9 containers, Dockploy guide) | ✅ |
| 3b | Web frontend (6 pages) | ✅ |
| 3c | Apple/Malewicz UI redesign | ✅ |

## Database (25 Tables)

| Group | Tables |
|-------|--------|
| Core | `organizations`, `users` |
| Profiles | `student_profiles`, `observer_emails` |
| Billing | `plans`, `subscriptions`, `invoices`, `entitlements`, `coupons`, `coupon_redemptions`, `coupons_applied` |
| Scheduling | `sessions`, `bookings`, `session_attendees`, `teacher_availability`, `default_weekly_slots` |
| Content | `lesson_content`, `progress_records`, `teacher_feedback` |
| Chat | `chat_rooms`, `chat_messages`, `chat_moderation_actions` |
| System | `audit_logs`, `crm_sync_events`, `push_subscriptions` |

## Security (3 Layers)

1. **API RBAC** — Role checks on every route (`src/lib/rbac.ts`)
2. **Org Scoping** — `orgId` filtering on every query
3. **Postgres RLS** — Database enforces tenant isolation (`src/db/rls-policies.sql`)

## Auth

- Better Auth library with Drizzle adapter
- Google OAuth via social provider
- Session cookies (web) + secure storage (mobile)

## Admin Panel

- AdminJS embedded at `/admin`
- 25 tables across 6 navigation groups
- ORG_ADMIN and SUPER_ADMIN access only

## CRM Integration

- Twenty CRM (open-source, replaces HubSpot)
- Outbox pattern for reliable sync
- REST API calls to `/people` and `/notes`

## Docker Deployment

- 9 containers: Next.js, 4× Jitsi, Cal.com, 3× Twenty CRM
- 4 subdomains: quran, meet, cal, crm (.learnnovice.com)
- Full step-by-step guide in `docs/deployment-dockploy.md`

## Web Pages (Apple/Malewicz Design)

| Page | Path | Description |
|------|------|-------------|
| Landing | `/` | Hero, features, how-it-works, pricing, CTA |
| Login | `/login` | Email + Google Sign-In |
| Register | `/register` | Google-first signup form |
| Dashboard | `/dashboard` | Stats, next class, profiles |
| Booking | `/dashboard/booking` | 3-step wizard |
| Admin | `/admin` | CRUD for all 25 tables |

## Flutter Mobile App

14 Dart files at `apps/mobile/` with:
- Riverpod state management
- Dio HTTP + auth interceptor
- GoRouter navigation with bottom nav
- Google Sign-In
- Jitsi via InAppWebView
- Emerald dark theme (to be updated to match web redesign)

## Verification

- TypeScript: **0 errors** across all phases
- Flutter: SDK not installed — files scaffolded only
