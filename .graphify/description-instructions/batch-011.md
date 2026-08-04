# Node Description Batch 12 of 14

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

- "messages_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/chat/messages/route.ts:L67 | neighbors=[route.ts]
- "messages_route_sendmessageschema": "sendMessageSchema" | kind=code-symbol | source=apps/web/src/app/api/chat/messages/route.ts:L17 | neighbors=[route.ts]
- "moderate_route_moderateschema": "moderateSchema" | kind=code-symbol | source=apps/web/src/app/api/chat/moderate/route.ts:L17 | neighbors=[route.ts]
- "moderate_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/chat/moderate/route.ts:L24 | neighbors=[route.ts]
- "observers_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/admin/observers/route.ts:L24 | neighbors=[route.ts]
- "observers_route_observerschema": "observerSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/observers/route.ts:L17 | neighbors=[route.ts]
- "observers_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/observers/route.ts:L42 | neighbors=[route.ts]
- "orgs_route_createorgschema": "createOrgSchema" | kind=code-symbol | source=apps/web/src/app/api/super/orgs/route.ts:L17 | neighbors=[route.ts]
- "orgs_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/super/orgs/route.ts:L25 | neighbors=[route.ts]
- "orgs_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/super/orgs/route.ts:L42 | neighbors=[route.ts]
- "privacy_page_metadata": "metadata" | kind=code-symbol | source=apps/web/src/app/privacy/page.tsx:L4 | neighbors=[page.tsx]
- "privacy_page_privacypage": "PrivacyPage()" | kind=code-symbol | source=apps/web/src/app/privacy/page.tsx:L10 | neighbors=[page.tsx]
- "privacy_page_section": "Section()" | kind=code-symbol | source=apps/web/src/app/privacy/page.tsx:L168 | neighbors=[page.tsx]
- "profiles_route_createprofileschema": "createProfileSchema" | kind=code-symbol | source=apps/web/src/app/api/students/profiles/route.ts:L21 | neighbors=[route.ts]
- "profiles_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/students/profiles/route.ts:L31 | neighbors=[route.ts]
- "profiles_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/students/profiles/route.ts:L60 | neighbors=[route.ts]
- "progress_page_progresspage": "ProgressPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/progress/page.tsx:L12 | neighbors=[page.tsx]
- "progress_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/students/progress/route.ts:L16 | neighbors=[route.ts]
- "providers_student_provider_refreshall": "refreshAll()" | kind=code-symbol | source=apps/mobile/lib/providers/student_provider.dart:L40 | neighbors=[student_provider.dart]
- "providers_student_provider_studentnotifier": "StudentNotifier" | kind=code-symbol | source=apps/mobile/lib/providers/student_provider.dart:L33 | neighbors=[student_provider.dart]
- "providers_student_provider_studentstate": "StudentState" | kind=code-symbol | source=apps/mobile/lib/providers/student_provider.dart:L5 | neighbors=[student_provider.dart]
- "recording_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/recording/route.ts:L22 | neighbors=[route.ts]
- "recording_route_recordingschema": "recordingSchema" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/recording/route.ts:L16 | neighbors=[route.ts]
- "refunds_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/refunds/route.ts:L22 | neighbors=[route.ts]
- "refunds_route_refundschema": "refundSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/refunds/route.ts:L15 | neighbors=[route.ts]
- "register_page_registerpage": "RegisterPage()" | kind=code-symbol | source=apps/web/src/app/register/page.tsx:L12 | neighbors=[page.tsx]
- "schedule_page_days": "DAYS" | kind=code-symbol | source=apps/web/src/app/dashboard/schedule/page.tsx:L9 | neighbors=[page.tsx]
- "schedule_page_hours": "HOURS" | kind=code-symbol | source=apps/web/src/app/dashboard/schedule/page.tsx:L10 | neighbors=[page.tsx]
- "schedule_page_props": "Props" | kind=code-symbol | source=apps/web/src/app/dashboard/schedule/page.tsx:L12 | neighbors=[page.tsx]
- "schedule_page_schedulepage": "SchedulePage()" | kind=code-symbol | source=apps/web/src/app/dashboard/schedule/page.tsx:L16 | neighbors=[page.tsx]
- "scripts_check_users_check": "check()" | kind=code-symbol | source=apps/web/scripts/check-users.ts:L6 | neighbors=[check-users.ts]
- "scripts_clean_and_assign_run": "run()" | kind=code-symbol | source=apps/web/scripts/clean_and_assign.ts:L5 | neighbors=[clean_and_assign.ts]
- "scripts_create_users_accountstocreate": "accountsToCreate" | kind=code-symbol | source=apps/web/scripts/create-users.ts:L9 | neighbors=[create-users.ts]
- "scripts_create_users_main": "main()" | kind=code-symbol | source=apps/web/scripts/create-users.ts:L21 | neighbors=[create-users.ts]
- "scripts_schedule_students_run": "run()" | kind=code-symbol | source=apps/web/scripts/schedule_students.ts:L7 | neighbors=[schedule_students.ts]
- "services_api_client_apiclient": "ApiClient" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L16 | neighbors=[api_client.dart]
- "services_api_client_cleartoken": "clearToken()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L55 | neighbors=[api_client.dart]
- "services_api_client_delete": "delete()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L81 | neighbors=[api_client.dart]
- "services_api_client_get": "get()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L66 | neighbors=[api_client.dart]
- "services_api_client_hastoken": "hasToken()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L60 | neighbors=[api_client.dart]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-011.json

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
