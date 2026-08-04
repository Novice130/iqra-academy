# Node Description Batch 1 of 14

Graphify is running in assistant/skill mode (no API key). You are the host
assistant (Claude Code / Codex / Gemini CLI). Read the prompt below and write
your JSON answer to the answer file.

## Prompt

You are documenting nodes in a knowledge graph.
For each entry below, write ONE concise factual plain-language sentence
describing what it is or does. Use only the provided context.
For a code symbol (kind=code-symbol — a function, class, or constant),
describe what the function/symbol does based on its name, source location
and neighbors — e.g. "Resolves the configured ontology profile from graphify.yaml.".
For an entity node (any other kind — e.g. a person, place, event, object),
describe what the entity is and its role, grounded in its type, its
relations (neighbors) and the provided citations/evidence — e.g.
"Lady Carfax, a wealthy heiress who disappears en route to Lausanne.".
Ground entity descriptions in the citations/evidence when present; do not
speculate beyond the context, so a node with no supporting context may be
left out of the reply.
Write every description in English (en). Do not switch languages.
No marketing language.
Respond ONLY with a JSON object mapping each node id (as a string) to its
one-sentence description — no prose, no markdown fences.

- "db_schema": "schema.ts" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1 | neighbors=[route.ts, route.ts, route.ts, page.tsx, route.ts, route.ts]
- "commit:repo:github.com/Novice130/iqra-academy@8622df62560c7fdf82214af191e2d0dacd3455e7": "8622df6 feat: migrate Jitsi to self-hosted LiveKit and set up Daily.co referenc…" | kind=Commit | source=git | neighbors=[route.ts, route.ts, layout.tsx, page.tsx, login_screen.dart, register_screen.dart]
- "commit:repo:github.com/Novice130/iqra-academy@b0952793247667fb32c525891ca4ef6ce0b11a8e": "b095279 Ignore monorepo node_modules and Flutter build files" | kind=Commit | source=git | neighbors=[9d441eb Fix gitignore to remove 10k unc…, route.ts, route.ts, layout.tsx, page.tsx, page.tsx]
- "lib_db": "db.ts" | kind=code-symbol | source=apps/web/src/lib/db.ts:L1 | neighbors=[route.ts, route.ts, route.ts, page.tsx, route.ts, route.ts]
- "lib_db_db": "db" | kind=code-symbol | source=apps/web/src/lib/db.ts:L28 | neighbors=[route.ts, route.ts, route.ts, page.tsx, route.ts, route.ts]
- "drizzle_0000_jittery_weapon_omega": "0000_jittery_weapon_omega.sql" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, accounts, audit_logs, auth_sessions, bookings, chat_messages]
- "lib_rbac": "rbac.ts" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L1 | neighbors=[route.ts, route.ts, route.ts, route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "branch:repo:github.com/Novice130/iqra-academy#master": "master" | kind=Branch | source=git | neighbors=[024609b fix: use better-auth client for…, 0f09475 fix: revert build script to nex…, 0fdd936 fix: login page styling + googl…, 12c3a66 main website, 1abd235 fix: add dummy API keys for Str…, 2dd1542 Fix TypeScript build error and …]
- "lib_errors": "errors.ts" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L1 | neighbors=[route.ts, route.ts, route.ts, route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "db_schema_users": "users" | kind=code-symbol | source=apps/web/src/db/schema.ts:L232 | neighbors=[route.ts, route.ts, route.ts, route.ts, layout.tsx, page.tsx]
- "bookings_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/students/bookings/route.ts:L1 | neighbors=[bookingSchema, GET(), POST(), schema.ts, bookings, sessions]
- "users_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, studentProfiles, users]
- "lib_errors_handleapierror": "handleApiError()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L63 | neighbors=[route.ts, route.ts, route.ts, route.ts, route.ts, route.ts]
- "dashboard_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/page.tsx:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, 6bd808e Fix admin dashboard redirect, p…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, ActionCard(), DashboardPage()]
- "join_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/join/route.ts:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, 6765997 feat: Add @neondatabase/serverl…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings]
- "lib_audit": "audit.ts" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L1 | neighbors=[route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, route.ts, route.ts, route.ts]
- "call_now_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/teachers/call-now/route.ts:L1 | neighbors=[callNowSchema, POST(), schema.ts, sessions, users, db.ts]
- "db_schema_sessions": "sessions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L545 | neighbors=[route.ts, route.ts, route.ts, route.ts, page.tsx, schema.ts]
- "lib_rbac_requirerole": "requireRole()" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L177 | neighbors=[route.ts, route.ts, route.ts, route.ts, route.ts, route.ts]
- "drizzle_0000_jittery_weapon_omega_public_users": "public.users" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L392 | neighbors=[0000_jittery_weapon_omega.sql, accounts, audit_logs, auth_sessions, bookings, chat_messages]
- "lib_auth": "auth.ts" | kind=code-symbol | source=apps/web/src/lib/auth.ts:L1 | neighbors=[route.ts, page.tsx, 6765997 feat: Add @neondatabase/serverl…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, layout.tsx]
- "profiles_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/students/profiles/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, studentProfiles, subscriptions, audit.ts]
- "coupons_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/coupons/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, createCouponSchema, GET(), POST(), schema.ts]
- "db_seed": "seed.ts" | kind=code-symbol | source=apps/web/src/db/seed.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, chatRooms, defaultWeeklySlots]
- "messages_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/chat/messages/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, chatMessages, chatRooms, subscriptions]
- "stripe_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, subscriptions, audit.ts, logAudit()]
- "app_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/page.tsx:L1 | neighbors=[Courses(), CTA(), FAQ(), Footer(), Hero(), HowItWorks()]
- "drizzle_0000_jittery_weapon_omega_public_organizations": "public.organizations" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L393 | neighbors=[0000_jittery_weapon_omega.sql, audit_logs, bookings, chat_messages, chat_moderation_actions, chat_rooms]
- "feedback_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/teachers/feedback/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, sessions, teacherFeedback, feedbackSchema]
- "impersonate_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/impersonate/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, users, impersonateSchema, POST()]
- "lib_quota": "quota.ts" | kind=code-symbol | source=apps/web/src/lib/quota.ts:L1 | neighbors=[route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, page.tsx, schema.ts, bookings]
- "moderate_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/chat/moderate/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, chatMessages, chatModerationActions, audit.ts]
- "calcom_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/webhooks/calcom/route.ts:L1 | neighbors=[handleBookingCancelled(), handleBookingCreated(), handleBookingRescheduled(), POST(), schema.ts, bookings]
- "commit:repo:github.com/Novice130/iqra-academy@343f92b96a0c139fcb693a3a5926aee8892cb007": "343f92b Checkpoint from VS Code for cloud agent session" | kind=Commit | source=git | neighbors=[login_screen.dart, register_screen.dart, booking_screen.dart, master, 902adbc feat: rebuild landing page with…, api_config.dart]
- "db_schema_bookings": "bookings" | kind=code-symbol | source=apps/web/src/db/schema.ts:L596 | neighbors=[route.ts, route.ts, route.ts, page.tsx, schema.ts, seed.ts]
- "db_schema_studentprofiles": "studentProfiles" | kind=code-symbol | source=apps/web/src/db/schema.ts:L262 | neighbors=[route.ts, page.tsx, schema.ts, seed.ts, route.ts, quota.ts]
- "exports_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/exports/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, sessions, users]
- "scripts_clean_and_assign": "clean_and_assign.ts" | kind=code-symbol | source=apps/web/scripts/clean_and_assign.ts:L1 | neighbors=[6bd808e Fix admin dashboard redirect, p…, schema.ts, accounts, authSessions, bookings, defaultWeeklySlots]
- "students_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/page.tsx:L1 | neighbors=[6bd808e Fix admin dashboard redirect, p…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, lessonContent]
- "commit:repo:github.com/Novice130/iqra-academy@6765997b31b35d545503eb9915b4e438809e9442": "6765997 feat: Add @neondatabase/serverless driver for Cloudflare Workers, updat…" | kind=Commit | source=git | neighbors=[page.tsx, master, route.ts, 2ebb4d5 docs: Update deployment documen…, page.tsx, route.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-000.json

Keep each description factual and concise (one sentence). No markdown, no prose
outside the JSON object. It is acceptable to omit a node if context is
insufficient — but include every node you can ground confidently.

Example answer format:
```json
{
  "node_id_1": "Resolves the configured ontology profile from graphify.yaml.",
  "node_id_2": "Colonel James Barclay, an antagonist in The Crooked Man."
}
```
