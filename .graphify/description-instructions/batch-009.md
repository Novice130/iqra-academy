# Node Description Batch 10 of 14

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

- "db_schema_couponsappliedrelations": "couponsAppliedRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1083 | neighbors=[schema.ts]
- "db_schema_couponsrelations": "couponsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1162 | neighbors=[schema.ts]
- "db_schema_crmsynceventsrelations": "crmSyncEventsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1177 | neighbors=[schema.ts]
- "db_schema_crmsynctypeenum": "crmSyncTypeEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L161 | neighbors=[schema.ts]
- "db_schema_dayofweekenum": "dayOfWeekEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L136 | neighbors=[schema.ts]
- "db_schema_defaultweeklyslotsrelations": "defaultWeeklySlotsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1093 | neighbors=[schema.ts]
- "db_schema_entitlementsrelations": "entitlementsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1072 | neighbors=[schema.ts]
- "db_schema_invoicesrelations": "invoicesRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1077 | neighbors=[schema.ts]
- "db_schema_invoicestatusenum": "invoiceStatusEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L126 | neighbors=[schema.ts]
- "db_schema_lessoncontentrelations": "lessonContentRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1121 | neighbors=[schema.ts]
- "db_schema_observeremailsrelations": "observerEmailsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1158 | neighbors=[schema.ts]
- "db_schema_organizationsrelations": "organizationsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1011 | neighbors=[schema.ts]
- "db_schema_paymentmethodenum": "paymentMethodEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L104 | neighbors=[schema.ts]
- "db_schema_plansrelations": "plansRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1058 | neighbors=[schema.ts]
- "db_schema_plantierenum": "planTierEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L110 | neighbors=[schema.ts]
- "db_schema_progressrecordsrelations": "progressRecordsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1126 | neighbors=[schema.ts]
- "db_schema_pushsubscriptions": "pushSubscriptions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L854 | neighbors=[schema.ts]
- "db_schema_pushsubscriptionsrelations": "pushSubscriptionsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1173 | neighbors=[schema.ts]
- "db_schema_recordingaccessenum": "recordingAccessEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L150 | neighbors=[schema.ts]
- "db_schema_sessionattendees": "sessionAttendees" | kind=code-symbol | source=apps/web/src/db/schema.ts:L621 | neighbors=[schema.ts]
- "db_schema_sessionattendeesrelations": "sessionAttendeesRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1116 | neighbors=[schema.ts]
- "db_schema_sessionsrelations": "sessionsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1106 | neighbors=[schema.ts]
- "db_schema_sessionstatusenum": "sessionStatusEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L81 | neighbors=[schema.ts]
- "db_schema_sessiontypeenum": "sessionTypeEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L70 | neighbors=[schema.ts]
- "db_schema_studentprofilesrelations": "studentProfilesRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1047 | neighbors=[schema.ts]
- "db_schema_subscriptionsrelations": "subscriptionsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1063 | neighbors=[schema.ts]
- "db_schema_subscriptionstatusenum": "subscriptionStatusEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L90 | neighbors=[schema.ts]
- "db_schema_teacheravailabilityrelations": "teacherAvailabilityRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1088 | neighbors=[schema.ts]
- "db_schema_teacherfeedbackrelations": "teacherFeedbackRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1133 | neighbors=[schema.ts]
- "db_schema_trackenum": "trackEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L57 | neighbors=[schema.ts]
- "db_schema_userroleenum": "userRoleEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L44 | neighbors=[schema.ts]
- "db_schema_usersrelations": "usersRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1030 | neighbors=[schema.ts]
- "db_schema_verifications": "verifications" | kind=code-symbol | source=apps/web/src/db/schema.ts:L995 | neighbors=[schema.ts]
- "db_seed_seed": "seed()" | kind=code-symbol | source=apps/web/src/db/seed.ts:L70 | neighbors=[seed.ts]
- "drizzle_0000_jittery_weapon_omega_organizations": "organizations" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L220 | neighbors=[0000_jittery_weapon_omega.sql]
- "drizzle_0000_jittery_weapon_omega_verifications": "verifications" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L383 | neighbors=[0000_jittery_weapon_omega.sql]
- "exports_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/admin/exports/route.ts:L17 | neighbors=[route.ts]
- "extend_route_extendschema": "extendSchema" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/extend/route.ts:L18 | neighbors=[route.ts]
- "extend_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/extend/route.ts:L22 | neighbors=[route.ts]
- "feedback_route_feedbackschema": "feedbackSchema" | kind=code-symbol | source=apps/web/src/app/api/teachers/feedback/route.ts:L17 | neighbors=[route.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-009.json

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
