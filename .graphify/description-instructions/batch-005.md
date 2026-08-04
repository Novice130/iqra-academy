# Node Description Batch 6 of 14

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

- "lib_stripe_verifywebhooksignature": "verifyWebhookSignature()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L303 | neighbors=[stripe.ts, getStripe(), route.ts]
- "settings_page": "page.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/settings/page.tsx:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, SettingsPage()]
- "stripe_route_extractsubscriptionid": "extractSubscriptionId()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L29 | neighbors=[route.ts, handleInvoicePaid(), handlePaymentFailed()]
- "stripe_route_handleinvoicepaid": "handleInvoicePaid()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L88 | neighbors=[route.ts, extractSubscriptionId(), POST()]
- "stripe_route_handlepaymentfailed": "handlePaymentFailed()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L139 | neighbors=[route.ts, extractSubscriptionId(), POST()]
- "teacher_startinstantmeetingbutton": "StartInstantMeetingButton.tsx" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/StartInstantMeetingButton.tsx:L1 | neighbors=[2dd1542 Fix TypeScript build error and …, page.tsx, StartInstantMeetingButton()]
- "calcom_route_handlebookingcancelled": "handleBookingCancelled()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/calcom/route.ts:L106 | neighbors=[route.ts, POST()]
- "calcom_route_handlebookingcreated": "handleBookingCreated()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/calcom/route.ts:L58 | neighbors=[route.ts, POST()]
- "calcom_route_handlebookingrescheduled": "handleBookingRescheduled()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/calcom/route.ts:L137 | neighbors=[route.ts, POST()]
- "commit:repo:github.com/Novice130/iqra-academy@2e97a9c510e0be3348f94ac31d6c2d3cc864a2e6": "2e97a9c Initial commit from Create Next App" | kind=Commit | source=git | neighbors=[master, 12c3a66 main website]
- "db_rls_policies": "rls-policies.sql" | kind=code-symbol | source=apps/web/src/db/rls-policies.sql:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…]
- "db_schema_auditlogs": "auditLogs" | kind=code-symbol | source=apps/web/src/db/schema.ts:L917 | neighbors=[schema.ts, audit.ts]
- "db_schema_chatmoderationactions": "chatModerationActions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L783 | neighbors=[schema.ts, route.ts]
- "db_schema_coupons": "coupons" | kind=code-symbol | source=apps/web/src/db/schema.ts:L806 | neighbors=[route.ts, schema.ts]
- "db_schema_crmsyncevents": "crmSyncEvents" | kind=code-symbol | source=apps/web/src/db/schema.ts:L882 | neighbors=[schema.ts, crm.ts]
- "db_schema_entitlements": "entitlements" | kind=code-symbol | source=apps/web/src/db/schema.ts:L423 | neighbors=[schema.ts, quota.ts]
- "db_schema_invoices": "invoices" | kind=code-symbol | source=apps/web/src/db/schema.ts:L388 | neighbors=[page.tsx, schema.ts]
- "db_schema_teacherfeedback": "teacherFeedback" | kind=code-symbol | source=apps/web/src/db/schema.ts:L703 | neighbors=[schema.ts, route.ts]
- "drizzle_0000_jittery_weapon_omega_accounts": "accounts" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L14 | neighbors=[0000_jittery_weapon_omega.sql, public.users]
- "drizzle_0000_jittery_weapon_omega_auth_sessions": "auth_sessions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L41 | neighbors=[0000_jittery_weapon_omega.sql, public.users]
- "drizzle_0000_jittery_weapon_omega_coupons": "coupons" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L106 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations]
- "drizzle_0000_jittery_weapon_omega_lesson_content": "lesson_content" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L195 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations]
- "drizzle_0000_jittery_weapon_omega_observer_emails": "observer_emails" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L209 | neighbors=[0000_jittery_weapon_omega.sql, public.users]
- "drizzle_0000_jittery_weapon_omega_plans": "plans" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L234 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations]
- "drizzle_0000_jittery_weapon_omega_public_chat_messages": "public.chat_messages" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L404 | neighbors=[0000_jittery_weapon_omega.sql, chat_moderation_actions]
- "drizzle_0000_jittery_weapon_omega_public_chat_rooms": "public.chat_rooms" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L401 | neighbors=[0000_jittery_weapon_omega.sql, chat_messages]
- "drizzle_0000_jittery_weapon_omega_public_lesson_content": "public.lesson_content" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L427 | neighbors=[0000_jittery_weapon_omega.sql, progress_records]
- "drizzle_0000_jittery_weapon_omega_public_plans": "public.plans" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L439 | neighbors=[0000_jittery_weapon_omega.sql, subscriptions]
- "drizzle_0000_jittery_weapon_omega_push_subscriptions": "push_subscriptions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L268 | neighbors=[0000_jittery_weapon_omega.sql, public.users]
- "drizzle_0000_jittery_weapon_omega_users": "users" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L369 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations]
- "lib_admin_adminbranding": "adminBranding" | kind=code-symbol | source=apps/web/src/lib/admin.ts:L84 | neighbors=[admin.ts, page.tsx]
- "lib_admin_adminmeta": "adminMeta" | kind=code-symbol | source=apps/web/src/lib/admin.ts:L115 | neighbors=[admin.ts, page.tsx]
- "lib_admin_adminresources": "adminResources" | kind=code-symbol | source=apps/web/src/lib/admin.ts:L35 | neighbors=[admin.ts, page.tsx]
- "lib_admin_canaccessadmin": "canAccessAdmin()" | kind=code-symbol | source=apps/web/src/lib/admin.ts:L108 | neighbors=[admin.ts, page.tsx]
- "lib_calcom_calcomwebhookpayload": "CalcomWebhookPayload" | kind=code-symbol | source=apps/web/src/lib/calcom.ts:L18 | neighbors=[route.ts, calcom.ts]
- "lib_calcom_mapcalcomeventtype": "mapCalcomEventType()" | kind=code-symbol | source=apps/web/src/lib/calcom.ts:L58 | neighbors=[route.ts, calcom.ts]
- "lib_calcom_verifycalcomwebhook": "verifyCalcomWebhook()" | kind=code-symbol | source=apps/web/src/lib/calcom.ts:L39 | neighbors=[route.ts, calcom.ts]
- "lib_crm_synccancellationtocrm": "syncCancellationToCRM()" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L192 | neighbors=[crm.ts, twentyRequest()]
- "lib_crm_synccontacttocrm": "syncContactToCRM()" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L131 | neighbors=[crm.ts, twentyRequest()]
- "lib_crm_syncdelinquencytocrm": "syncDelinquencyToCRM()" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L224 | neighbors=[crm.ts, twentyRequest()]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-005.json

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
