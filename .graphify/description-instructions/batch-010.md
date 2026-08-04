# Node Description Batch 11 of 14

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

- "feedback_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/teachers/feedback/route.ts:L26 | neighbors=[route.ts]
- "health_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/health/route.ts:L8 | neighbors=[route.ts]
- "id_page_sessionroompage": "SessionRoomPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/session/[id]/page.tsx:L8 | neighbors=[page.tsx]
- "impersonate_route_impersonateschema": "impersonateSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/impersonate/route.ts:L17 | neighbors=[route.ts]
- "impersonate_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/impersonate/route.ts:L22 | neighbors=[route.ts]
- "instant_meeting_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/teachers/instant-meeting/route.ts:L17 | neighbors=[route.ts]
- "join_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/sessions/[id]/join/route.ts:L17 | neighbors=[route.ts]
- "landing_faq_faq": "FAQ()" | kind=code-symbol | source=apps/web/src/components/landing/FAQ.tsx:L63 | neighbors=[FAQ.tsx]
- "landing_faq_faqs": "FAQS" | kind=code-symbol | source=apps/web/src/components/landing/FAQ.tsx:L12 | neighbors=[FAQ.tsx]
- "landing_nav_nav": "Nav()" | kind=code-symbol | source=apps/web/src/components/landing/Nav.tsx:L14 | neighbors=[Nav.tsx]
- "lib_app_iqraacademyapp": "IqraAcademyApp" | kind=code-symbol | source=apps/mobile/lib/app.dart:L13 | neighbors=[app.dart]
- "lib_audit_auditaction": "AuditAction" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L29 | neighbors=[audit.ts]
- "lib_audit_auditlogparams": "AuditLogParams" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L56 | neighbors=[audit.ts]
- "lib_audit_logauditbatch": "logAuditBatch()" | kind=code-symbol | source=apps/web/src/lib/audit.ts:L102 | neighbors=[audit.ts]
- "lib_auth_session": "Session" | kind=code-symbol | source=apps/web/src/lib/auth.ts:L133 | neighbors=[auth.ts]
- "lib_calcom_calcomwebhookevent": "CalcomWebhookEvent" | kind=code-symbol | source=apps/web/src/lib/calcom.ts:L9 | neighbors=[calcom.ts]
- "lib_crm_crm_config": "CRM_CONFIG" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L38 | neighbors=[crm.ts]
- "lib_crm_crmcontactdata": "CrmContactData" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L51 | neighbors=[crm.ts]
- "lib_crm_crmdealdata": "CrmDealData" | kind=code-symbol | source=apps/web/src/lib/crm.ts:L61 | neighbors=[crm.ts]
- "lib_db_pool": "pool" | kind=code-symbol | source=apps/web/src/lib/db.ts:L27 | neighbors=[db.ts]
- "lib_errors_apperror_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L11 | neighbors=[AppError]
- "lib_errors_businessruleerror_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L44 | neighbors=[BusinessRuleError]
- "lib_errors_conflicterror_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L37 | neighbors=[ConflictError]
- "lib_errors_forbiddenerror_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L30 | neighbors=[ForbiddenError]
- "lib_errors_notfounderror_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/errors.ts:L23 | neighbors=[NotFoundError]
- "lib_livekit_livekit_config": "LIVEKIT_CONFIG" | kind=code-symbol | source=apps/web/src/lib/livekit.ts:L3 | neighbors=[livekit.ts]
- "lib_livekit_livekitroomparams": "LiveKitRoomParams" | kind=code-symbol | source=apps/web/src/lib/livekit.ts:L9 | neighbors=[livekit.ts]
- "lib_main_main": "main()" | kind=code-symbol | source=apps/mobile/lib/main.dart:L22 | neighbors=[main.dart]
- "lib_push_sendpushnotification": "sendPushNotification()" | kind=code-symbol | source=apps/web/src/lib/push.ts:L76 | neighbors=[push.ts]
- "lib_push_storedpushsubscription": "StoredPushSubscription" | kind=code-symbol | source=apps/web/src/lib/push.ts:L53 | neighbors=[push.ts]
- "lib_quota_getsiblingsquotastatus": "getSiblingsQuotaStatus()" | kind=code-symbol | source=apps/web/src/lib/quota.ts:L189 | neighbors=[quota.ts]
- "lib_quota_quotastatus": "QuotaStatus" | kind=code-symbol | source=apps/web/src/lib/quota.ts:L50 | neighbors=[quota.ts]
- "lib_rbac_authcontext": "AuthContext" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L39 | neighbors=[rbac.ts]
- "lib_rbac_issuperadmin": "isSuperAdmin()" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L226 | neighbors=[rbac.ts]
- "lib_rbac_role_hierarchy": "ROLE_HIERARCHY" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L62 | neighbors=[rbac.ts]
- "lib_rbac_userrole": "UserRole" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L32 | neighbors=[rbac.ts]
- "lib_stripe_pricing": "PRICING" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L65 | neighbors=[stripe.ts]
- "login_page_loginpage": "LoginPage()" | kind=code-symbol | source=apps/web/src/app/login/page.tsx:L13 | neighbors=[page.tsx]
- "logout_page_logoutpage": "LogoutPage()" | kind=code-symbol | source=apps/web/src/app/debug/logout/page.tsx:L7 | neighbors=[page.tsx]
- "messages_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/chat/messages/route.ts:L23 | neighbors=[route.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-010.json

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
