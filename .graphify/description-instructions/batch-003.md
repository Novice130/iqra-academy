# Node Description Batch 4 of 14

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
LANGUAGE: each entry has a `lang=` marker giving the language of its source.
Write that entry's description in EXACTLY that language. Do not translate to
a single common language — match each node's source language individually.
No marketing language.
Respond ONLY with a JSON object mapping each node id (as a string) to its
one-sentence description — no prose, no markdown fences.

- "stripe_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L41 | neighbors=[route.ts, handleInvoicePaid(), handlePaymentFailed(), handleSubscriptionDeleted(), handleSubscriptionUpdated()] | lang=en
- "students_assignstudentmodal": "AssignStudentModal.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx:L1 | neighbors=[6bd808e Fix admin dashboard redirect, p…, AssignStudentModal(), StudentProfile, Teacher, page.tsx] | lang=en
- "terms_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/terms/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, metadata, Section(), TermsPage()] | lang=en
- "web_eslint_config": "eslint.config.mjs" | kind=code-symbol | source=apps/web/eslint.config.mjs:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, compat, __dirname, eslintConfig, __filename] | lang=en
- "widgets_brand_logo": "brand_logo.dart" | kind=code-symbol | source=apps/mobile/lib/widgets/brand_logo.dart:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, c560325 fix: use provided logo image ev…, ca6d513 feat: update branding and dashb…, BrandLogo, BrandWordmark] | lang=en
- "calcom_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/calcom/route.ts:L20 | neighbors=[route.ts, handleBookingCancelled(), handleBookingCreated(), handleBookingRescheduled()] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@c560325f23aad0124a042ee5b4a1d8993156ed3a": "c560325 fix: use provided logo image everywhere" | kind=Commit | source=git | neighbors=[master, 9d441eb Fix gitignore to remove 10k unc…, brand_logo.dart, ca6d513 feat: update branding and dashb…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@d06fc752033115b510860fb25c69cb28e6ceaa4d": "d06fc75 fix(db): remove ws polyfill in cloudflare workers to prevent Error 1101…" | kind=Commit | source=git | neighbors=[0f09475 fix: revert build script to nex…, master, 2dd1542 Fix TypeScript build error and …, db.ts] | lang=en
- "components_whatsappbutton": "WhatsAppButton.tsx" | kind=code-symbol | source=apps/web/src/components/WhatsAppButton.tsx:L1 | neighbors=[layout.tsx, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, WhatsAppButton()] | lang=en
- "daily_reference_dailyroom": "DailyRoom.tsx" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/DailyRoom.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, DailyCallFrame(), DailyRoom(), DailyRoomProps] | lang=en
- "db_schema_authsessions": "authSessions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L946 | neighbors=[schema.ts, clean_and_assign.ts, check-role.ts, clear-session.ts] | lang=en
- "db_schema_defaultweeklyslots": "defaultWeeklySlots" | kind=code-symbol | source=apps/web/src/db/schema.ts:L509 | neighbors=[schema.ts, seed.ts, clean_and_assign.ts, schedule_students.ts] | lang=en
- "db_schema_lessoncontent": "lessonContent" | kind=code-symbol | source=apps/web/src/db/schema.ts:L645 | neighbors=[schema.ts, seed.ts, page.tsx, page.tsx] | lang=en
- "db_schema_observeremails": "observerEmails" | kind=code-symbol | source=apps/web/src/db/schema.ts:L291 | neighbors=[schema.ts, seed.ts, route.ts, clean_and_assign.ts] | lang=en
- "db_schema_plans": "plans" | kind=code-symbol | source=apps/web/src/db/schema.ts:L321 | neighbors=[page.tsx, schema.ts, seed.ts, quota.ts] | lang=en
- "db_schema_progressrecords": "progressRecords" | kind=code-symbol | source=apps/web/src/db/schema.ts:L674 | neighbors=[schema.ts, page.tsx, clean_and_assign.ts, page.tsx] | lang=en
- "drizzle_0000_jittery_weapon_omega_chat_messages": "chat_messages" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L67 | neighbors=[0000_jittery_weapon_omega.sql, public.chat_rooms, public.organizations, public.users] | lang=en
- "drizzle_0000_jittery_weapon_omega_chat_moderation_actions": "chat_moderation_actions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L78 | neighbors=[0000_jittery_weapon_omega.sql, public.chat_messages, public.organizations, public.users] | lang=en
- "drizzle_0000_jittery_weapon_omega_default_weekly_slots": "default_weekly_slots" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L149 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.student_profiles, public.users] | lang=en
- "drizzle_0000_jittery_weapon_omega_invoices": "invoices" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L174 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.subscriptions, public.users] | lang=en
- "drizzle_0000_jittery_weapon_omega_public_subscriptions": "public.subscriptions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L412 | neighbors=[0000_jittery_weapon_omega.sql, coupons_applied, entitlements, invoices] | lang=en
- "drizzle_0000_jittery_weapon_omega_subscriptions": "subscriptions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L326 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.plans, public.users] | lang=en
- "drizzle_0000_jittery_weapon_omega_teacher_feedback": "teacher_feedback" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L357 | neighbors=[0000_jittery_weapon_omega.sql, public.sessions, public.student_profiles, public.users] | lang=en
- "landing_faq": "FAQ.tsx" | kind=code-symbol | source=apps/web/src/components/landing/FAQ.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, FAQ(), FAQS] | lang=en
- "landing_nav": "Nav.tsx" | kind=code-symbol | source=apps/web/src/components/landing/Nav.tsx:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, 8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, Nav()] | lang=en
- "lib_crm_twentyrequest": "twentyRequest()" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L83 | neighbors=[crm.ts, syncCancellationToCRM(), syncContactToCRM(), syncDelinquencyToCRM()] | lang=en
- "lib_livekit_generatelivekittoken": "generateLiveKitToken()" | kind=code-symbol | source=apps/web/src/lib/livekit.ts:L18 | neighbors=[route.ts, route.ts, route.ts, livekit.ts] | lang=en
- "lib_livekit_generateroomname": "generateRoomName()" | kind=code-symbol | source=apps/web/src/lib/livekit.ts:L62 | neighbors=[route.ts, route.ts, route.ts, livekit.ts] | lang=en
- "logout_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/debug/logout/page.tsx:L1 | neighbors=[b095279 Ignore monorepo node_modules an…, auth-client.ts, authClient, LogoutPage()] | lang=en
- "providers_student_provider": "student_provider.dart" | kind=code-symbol | source=apps/mobile/lib/providers/student_provider.dart:L1 | neighbors=[b095279 Ignore monorepo node_modules an…, refreshAll(), StudentNotifier, StudentState] | lang=en
- "src_middleware": "middleware.ts" | kind=code-symbol | source=apps/web/src/middleware.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, config, middleware()] | lang=en
- "video_livekitroom": "LiveKitRoom.tsx" | kind=code-symbol | source=apps/web/src/components/video/LiveKitRoom.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, page.tsx, LiveKitRoom(), LiveKitRoomProps] | lang=en
- "video_prejoinscreen": "PreJoinScreen.tsx" | kind=code-symbol | source=apps/web/src/components/video/PreJoinScreen.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, page.tsx, PreJoinScreen(), PreJoinScreenProps] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@024609b6f4c88acb9c96de2adc9426211b917db5": "024609b fix: use better-auth client for login/register redirects and add logo f…" | kind=Commit | source=git | neighbors=[master, cb6ac58 fix(ui): use correct logo image…, 3bde0be fix: point default orgId to exi…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@0f094752c5b28948c003b210ec3503190e480fb9": "0f09475 fix: revert build script to next build to prevent OpenNext infinite bui…" | kind=Commit | source=git | neighbors=[master, d06fc75 fix(db): remove ws polyfill in …, 6e0d58b fix: directly patch @noble/ciph…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@0fdd9367aecfd676e759c437516fbb3d817bae59": "0fdd936 fix: login page styling + google oauth sign-in" | kind=Commit | source=git | neighbors=[master, cd044a9 fix: add Better Auth tables and…, e3a6ea3 docs: update deployment guide —…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@12c3a66d3af0ee51271b32e957b726659345e9ee": "12c3a66 main website" | kind=Commit | source=git | neighbors=[master, 52f4f5d, 2e97a9c Initial commit from Create Next…] | lang=pt
- "commit:repo:github.com/Novice130/iqra-academy@1abd23591784362e977d43dc6f3b868fa75f3126": "1abd235 fix: add dummy API keys for Stripe/Resend/Google in Dockerfile" | kind=Commit | source=git | neighbors=[master, 6010f7f feat: add scroll animations, Wh…, 9c0321b fix: provide dummy BETTER_AUTH_…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@2ebb4d5c805b0eac1c02d0c441853a9483436b53": "2ebb4d5 docs: Update deployment documentation for Cloudflare Workers & LiveKit …" | kind=Commit | source=git | neighbors=[master, b0d12b3 fix: replace top-level return i…, 6765997 feat: Add @neondatabase/serverl…] | lang=en
- "commit:repo:github.com/Novice130/iqra-academy@36c3af92446c11129fd48fa2270ba8e91f6501b6": "36c3af9 feat: replace text logo with Iqra Academy image logo" | kind=Commit | source=git | neighbors=[master, 3bde0be fix: point default orgId to exi…, cd044a9 fix: add Better Auth tables and…] | lang=en

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-003.json

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
