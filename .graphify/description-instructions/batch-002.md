# Node Description Batch 3 of 14

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
Write every description in English (en). Do not switch languages.
No marketing language.
Respond ONLY with a JSON object mapping each node id (as a string) to its
one-sentence description — no prose, no markdown fences.

- "db_make_admin": "make-admin.ts" | kind=code-symbol | source=apps/web/src/db/make-admin.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, main(), schema.ts, users, db.ts]
- "drizzle_0000_jittery_weapon_omega_public_student_profiles": "public.student_profiles" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L398 | neighbors=[0000_jittery_weapon_omega.sql, bookings, default_weekly_slots, entitlements, progress_records, session_attendees]
- "lib_admin": "admin.ts" | kind=code-symbol | source=apps/web/src/lib/admin.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, adminBranding, adminMeta, adminResources, canAccessAdmin()]
- "lib_auth_client": "auth-client.ts" | kind=code-symbol | source=apps/web/src/lib/auth-client.ts:L1 | neighbors=[page.tsx, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, authClient, page.tsx, page.tsx]
- "lib_calcom": "calcom.ts" | kind=code-symbol | source=apps/web/src/lib/calcom.ts:L1 | neighbors=[route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, CalcomWebhookEvent, CalcomWebhookPayload, mapCalcomEventType()]
- "lib_stripe_getstripe": "getStripe()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L44 | neighbors=[stripe.ts, createAutoChargeSubscription(), createManualInvoiceSubscription(), createStripeCoupon(), createStripeCustomer(), issueRefund()]
- "scripts_check_users": "check-users.ts" | kind=code-symbol | source=apps/web/scripts/check-users.ts:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, schema.ts, accounts, users, db.ts, db]
- "web_check_booking": "check-booking.ts" | kind=code-symbol | source=apps/web/check-booking.ts:L1 | neighbors=[b095279 Ignore monorepo node_modules an…, schema.ts, bookings, users, db.ts, db]
- "web_check_role": "check-role.ts" | kind=code-symbol | source=apps/web/check-role.ts:L1 | neighbors=[b095279 Ignore monorepo node_modules an…, schema.ts, authSessions, users, db.ts, db]
- "web_clear_session": "clear-session.ts" | kind=code-symbol | source=apps/web/clear-session.ts:L1 | neighbors=[b095279 Ignore monorepo node_modules an…, schema.ts, authSessions, users, db.ts, db]
- "web_query_db": "query_db.ts" | kind=code-symbol | source=apps/web/query_db.ts:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, schema.ts, studentProfiles, users, db.ts, db]
- "chat_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/chat/page.tsx:L1 | neighbors=[ChatPage(), Message, auth-client.ts, authClient, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "config_routes": "routes.dart" | kind=code-symbol | source=apps/mobile/lib/config/routes.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, _calculateSelectedIndex(), MainShell, _onItemTapped()]
- "daily_reference_daily_provider": "daily-provider.ts" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, CreateRoomOptions, DailyVideoProvider, JoinToken, TokenOptionsDaily, VideoRoom]
- "daily_reference_daily_provider_dailyvideoprovider": "DailyVideoProvider" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L35 | neighbors=[daily-provider.ts, .constructor(), .createRoom(), .deleteRoom(), .generateToken(), .getRoom()]
- "drizzle_0000_jittery_weapon_omega_public_sessions": "public.sessions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L399 | neighbors=[0000_jittery_weapon_omega.sql, bookings, chat_rooms, progress_records, session_attendees, teacher_feedback]
- "lib_errors_apperror": "AppError" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L10 | neighbors=[errors.ts, .constructor(), BusinessRuleError, ConflictError, ForbiddenError, NotFoundError]
- "lib_errors_businessruleerror": "BusinessRuleError" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L43 | neighbors=[route.ts, route.ts, errors.ts, AppError, .constructor(), route.ts]
- "lib_errors_forbiddenerror": "ForbiddenError" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L29 | neighbors=[route.ts, route.ts, errors.ts, AppError, .constructor(), route.ts]
- "lib_push": "push.ts" | kind=code-symbol | source=apps/web/src/lib/push.ts:L1 | neighbors=[route.ts, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, sendCallNowNotification(), sendPushNotification(), StoredPushSubscription]
- "lib_rbac_requireauth": "requireAuth()" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L148 | neighbors=[route.ts, rbac.ts, getAuthContext(), requireRole(), route.ts, route.ts]
- "session_live_session_screen": "live_session_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/session/live_session_screen.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, initState(), LiveSessionScreen, _LiveSessionScreenState, _loadSession()]
- "all_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/auth/[...all]/route.ts:L1 | neighbors=[{ GET, POST }, auth.ts, auth, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "availability_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/availability/page.tsx:L1 | neighbors=[AvailabilityPage(), DAYS, SLOTS, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "booking_booking_screen": "booking_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/booking/booking_screen.dart:L1 | neighbors=[BookingScreen, _BookingScreenState, _handleBook(), 343f92b Checkpoint from VS Code for clo…, b095279 Ignore monorepo node_modules an…]
- "booking_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/booking/page.tsx:L1 | neighbors=[BookingPage(), SLOTS, TRACKS, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "components_animatedsections": "AnimatedSections.tsx" | kind=code-symbol | source=apps/web/src/components/AnimatedSections.tsx:L1 | neighbors=[page.tsx, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, AnimatedSections(), FadeInOnScroll.tsx]
- "components_fadeinonscroll": "FadeInOnScroll.tsx" | kind=code-symbol | source=apps/web/src/components/FadeInOnScroll.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, AnimatedSections.tsx, FadeInOnScroll(), FadeInOnScrollProps]
- "config_api_config": "api_config.dart" | kind=code-symbol | source=apps/mobile/lib/config/api_config.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, ApiConfig, sessionExtend(), sessionJoin()]
- "db_schema_teacheravailability": "teacherAvailability" | kind=code-symbol | source=apps/web/src/db/schema.ts:L478 | neighbors=[route.ts, schema.ts, seed.ts, clean_and_assign.ts, create-users.ts]
- "drizzle_0000_jittery_weapon_omega_bookings": "bookings" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L53 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.sessions, public.student_profiles, public.users]
- "drizzle_0000_jittery_weapon_omega_progress_records": "progress_records" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L252 | neighbors=[0000_jittery_weapon_omega.sql, public.lesson_content, public.sessions, public.student_profiles, public.users]
- "id_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/session/[id]/page.tsx:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, 8622df6 feat: migrate Jitsi to self-hos…, SessionRoomPage(), LiveKitRoom.tsx, PreJoinScreen.tsx]
- "lib_auth_client_authclient": "authClient" | kind=code-symbol | source=apps/web/src/lib/auth-client.ts:L10 | neighbors=[page.tsx, auth-client.ts, page.tsx, page.tsx, page.tsx]
- "lib_email_getresend": "getResend()" | kind=code-symbol | source=apps/web/src/lib/email.ts:L42 | neighbors=[email.ts, sendPaymentReceipt(), sendSessionReminder(), sendWeeklyDigest(), sendWelcomeEmail()]
- "lib_errors_conflicterror": "ConflictError" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L36 | neighbors=[errors.ts, AppError, .constructor(), route.ts, route.ts]
- "login_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/login/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, auth-client.ts, authClient, LoginPage()]
- "privacy_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/privacy/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, metadata, PrivacyPage(), Section()]
- "register_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/register/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, auth-client.ts, authClient, RegisterPage()]
- "settings_settings_screen": "settings_screen.dart" | kind=code-symbol | source=apps/mobile/lib/screens/settings/settings_screen.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, _SectionHeader, _SettingsItem, SettingsScreen]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-002.json

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
