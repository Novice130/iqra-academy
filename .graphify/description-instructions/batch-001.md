# Node Description Batch 2 of 14

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

- "slug_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/admin/[[...slug]]/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, users, admin.ts, adminBranding]
- "teacher_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/page.tsx:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, sessions]
- "assign_student_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/assign-student/route.ts:L1 | neighbors=[POST(), schema.ts, bookings, sessions, studentProfiles, users]
- "extend_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/extend/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, sessions, extendSchema, POST()]
- "instant_meeting_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/teachers/instant-meeting/route.ts:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, schema.ts, sessions, users, POST(), db.ts]
- "orgs_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/super/orgs/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, organizations, db.ts, db]
- "schedule_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/schedule/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, bookings, sessions, users]
- "availability_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/teachers/availability/route.ts:L1 | neighbors=[GET(), POST(), schema.ts, teacherAvailability, db.ts, db]
- "lib_crm": "crm.ts" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, crmSyncEvents, CRM_CONFIG, CrmContactData]
- "lib_errors_notfounderror": "NotFoundError" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L22 | neighbors=[route.ts, route.ts, route.ts, route.ts, route.ts, route.ts]
- "lib_stripe": "stripe.ts" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, route.ts, createAutoChargeSubscription(), createManualInvoiceSubscription(), createStripeCoupon()]
- "observers_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/observers/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, observerEmails, db.ts, db]
- "recording_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/recording/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, sessions, db.ts, db]
- "refunds_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/admin/refunds/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, audit.ts, getClientIp(), logAudit(), errors.ts]
- "lib_auth_auth": "auth" | kind=code-symbol | source=apps/web/src/lib/auth.ts:L47 | neighbors=[route.ts, page.tsx, layout.tsx, page.tsx, auth.ts, rbac.ts]
- "progress_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/students/progress/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, studentProfiles, db.ts, db]
- "sessions_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/teachers/sessions/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, sessions, db.ts, db]
- "billing_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/billing/page.tsx:L1 | neighbors=[BillingPage(), schema.ts, invoices, plans, subscriptions, auth.ts]
- "commit:repo:github.com/Novice130/iqra-academy@2dd15421138f0dee1ff12d4c0e15e5624cc9de55": "2dd1542 Fix TypeScript build error and deploy latest worker" | kind=Commit | source=git | neighbors=[master, 6bd808e Fix admin dashboard redirect, p…, layout.tsx, page.tsx, route.ts, route.ts]
- "dashboard_layout": "layout.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/layout.tsx:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, DashboardLayout(), SidebarItem(), schema.ts]
- "lib_audit_logaudit": "logAudit()" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L82 | neighbors=[route.ts, route.ts, route.ts, route.ts, route.ts, audit.ts]
- "progress_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/progress/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, schema.ts, lessonContent, progressRecords, studentProfiles]
- "scripts_create_users": "create-users.ts" | kind=code-symbol | source=apps/web/scripts/create-users.ts:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, schema.ts, studentProfiles, teacherAvailability, users, auth.ts]
- "db_schema_subscriptions": "subscriptions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L356 | neighbors=[page.tsx, route.ts, page.tsx, schema.ts, seed.ts, quota.ts]
- "lib_audit_getclientip": "getClientIp()" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L132 | neighbors=[route.ts, route.ts, route.ts, route.ts, route.ts, audit.ts]
- "scripts_schedule_students": "schedule_students.ts" | kind=code-symbol | source=apps/web/scripts/schedule_students.ts:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, schema.ts, bookings, defaultWeeklySlots, sessions, studentProfiles]
- "services_api_client": "api_client.dart" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, ApiClient, clearToken(), delete(), get()]
- "chat_chat_screen": "chat_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L1 | neighbors=[ChatScreen, _ChatScreenState, dispose(), _fetchMessages(), initState(), _MessageBubble]
- "dashboard_dashboard_screen": "dashboard_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, ca6d513 feat: update branding and dashb…, _ChildProfileCard, DashboardScreen]
- "lib_db_withrls": "withRLS()" | kind=code-symbol | source=apps/web/src/lib/db.ts:L33 | neighbors=[route.ts, route.ts, page.tsx, db.ts, route.ts, route.ts]
- "lib_livekit": "livekit.ts" | kind=code-symbol | source=apps/web/src/lib/livekit.ts:L1 | neighbors=[route.ts, 6765997 feat: Add @neondatabase/serverl…, 8622df6 feat: migrate Jitsi to self-hos…, route.ts, route.ts, generateLiveKitToken()]
- "services_auth_service": "auth_service.dart" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, AuthNotifier, AuthState, _checkSession(), signIn()]
- "auth_login_screen": "login_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L1 | neighbors=[dispose(), _handleGoogleLogin(), _handleLogin(), LoginScreen, _LoginScreenState, 343f92b Checkpoint from VS Code for clo…]
- "lib_email": "email.ts" | kind=code-symbol | source=apps/web/src/lib/email.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, getResend(), sendPaymentReceipt(), sendSessionReminder(), sendWeeklyDigest()]
- "admin_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/debug/admin/route.ts:L1 | neighbors=[GET(), schema.ts, users, db.ts, db, 8622df6 feat: migrate Jitsi to self-hos…]
- "app_layout": "layout.tsx" | kind=code-symbol | source=apps/web/src/app/layout.tsx:L1 | neighbors=[geistMono, geistSans, metadata, RootLayout(), WhatsAppButton.tsx, 8622df6 feat: migrate Jitsi to self-hos…]
- "auth_register_screen": "register_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/auth/register_screen.dart:L1 | neighbors=[dispose(), _handleRegister(), RegisterScreen, _RegisterScreenState, 343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…]
- "commit:repo:github.com/Novice130/iqra-academy@6bd808e855f078bf50173afc2cb0abb6584e0aed": "6bd808e Fix admin dashboard redirect, purge fake data, assign class to Masad Sh…" | kind=Commit | source=git | neighbors=[2dd1542 Fix TypeScript build error and …, route.ts, master, page.tsx, clean_and_assign.ts, AssignStudentModal.tsx]
- "commit:repo:github.com/Novice130/iqra-academy@ca6d513cc3cbde12c047c1d3667f0c41cae6a09d": "ca6d513 feat: update branding and dashboard experience" | kind=Commit | source=git | neighbors=[b098c4a fix(build): lazy-init Stripe an…, login_screen.dart, register_screen.dart, master, c560325 fix: use provided logo image ev…, dashboard_screen.dart]
- "db_list_users": "list-users.ts" | kind=code-symbol | source=apps/web/src/db/list-users.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, main(), schema.ts, users, db.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-001.json

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
