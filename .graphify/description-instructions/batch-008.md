# Node Description Batch 9 of 14

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

- "config_routes_onitemtapped": "_onItemTapped()" | kind=code-symbol | source=apps/mobile/lib/config/routes.dart:L124 | neighbors=[routes.dart]
- "config_theme_iqratheme": "IqraTheme" | kind=code-symbol | source=apps/mobile/lib/config/theme.dart:L16 | neighbors=[theme.dart]
- "coupons_route_createcouponschema": "createCouponSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/coupons/route.ts:L19 | neighbors=[route.ts]
- "coupons_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/admin/coupons/route.ts:L30 | neighbors=[route.ts]
- "coupons_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/coupons/route.ts:L49 | neighbors=[route.ts]
- "daily_reference_daily_provider_createroomoptions": "CreateRoomOptions" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L1 | neighbors=[daily-provider.ts]
- "daily_reference_daily_provider_dailyvideoprovider_constructor": ".constructor()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L40 | neighbors=[DailyVideoProvider]
- "daily_reference_daily_provider_dailyvideoprovider_createroom": ".createRoom()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L44 | neighbors=[DailyVideoProvider]
- "daily_reference_daily_provider_dailyvideoprovider_deleteroom": ".deleteRoom()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L108 | neighbors=[DailyVideoProvider]
- "daily_reference_daily_provider_dailyvideoprovider_generatetoken": ".generateToken()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L80 | neighbors=[DailyVideoProvider]
- "daily_reference_daily_provider_dailyvideoprovider_getroom": ".getRoom()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L115 | neighbors=[DailyVideoProvider]
- "daily_reference_daily_provider_jointoken": "JoinToken" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L19 | neighbors=[daily-provider.ts]
- "daily_reference_daily_provider_tokenoptionsdaily": "TokenOptionsDaily" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L27 | neighbors=[daily-provider.ts]
- "daily_reference_daily_provider_videoroom": "VideoRoom" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/daily-provider.ts:L9 | neighbors=[daily-provider.ts]
- "daily_reference_dailyroom_dailycallframe": "DailyCallFrame()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/DailyRoom.tsx:L14 | neighbors=[DailyRoom.tsx]
- "daily_reference_dailyroom_dailyroom": "DailyRoom()" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/DailyRoom.tsx:L45 | neighbors=[DailyRoom.tsx]
- "daily_reference_dailyroom_dailyroomprops": "DailyRoomProps" | kind=code-symbol | source=apps/web/src/lib/video/daily-reference/DailyRoom.tsx:L9 | neighbors=[DailyRoom.tsx]
- "dashboard_dashboard_screen_childprofilecard": "_ChildProfileCard" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L314 | neighbors=[dashboard_screen.dart]
- "dashboard_dashboard_screen_dashboardscreen": "DashboardScreen" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L18 | neighbors=[dashboard_screen.dart]
- "dashboard_dashboard_screen_nextclasscard": "_NextClassCard" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L150 | neighbors=[dashboard_screen.dart]
- "dashboard_dashboard_screen_quickactionbutton": "_QuickActionButton" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L275 | neighbors=[dashboard_screen.dart]
- "dashboard_dashboard_screen_quotacard": "_QuotaCard" | kind=code-symbol | source=apps/mobile/lib/screens/dashboard/dashboard_screen.dart:L213 | neighbors=[dashboard_screen.dart]
- "dashboard_layout_dashboardlayout": "DashboardLayout()" | kind=code-symbol | source=apps/web/src/app/dashboard/layout.tsx:L17 | neighbors=[layout.tsx]
- "dashboard_layout_sidebaritem": "SidebarItem()" | kind=code-symbol | source=apps/web/src/app/dashboard/layout.tsx:L199 | neighbors=[layout.tsx]
- "dashboard_page_actioncard": "ActionCard()" | kind=code-symbol | source=apps/web/src/app/dashboard/page.tsx:L205 | neighbors=[page.tsx]
- "dashboard_page_dashboardpage": "DashboardPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/page.tsx:L18 | neighbors=[page.tsx]
- "dashboard_page_profilecard": "ProfileCard()" | kind=code-symbol | source=apps/web/src/app/dashboard/page.tsx:L214 | neighbors=[page.tsx]
- "dashboard_page_statcard": "StatCard()" | kind=code-symbol | source=apps/web/src/app/dashboard/page.tsx:L195 | neighbors=[page.tsx]
- "db_list_users_main": "main()" | kind=code-symbol | source=apps/web/src/db/list-users.ts:L10 | neighbors=[list-users.ts]
- "db_make_admin_main": "main()" | kind=code-symbol | source=apps/web/src/db/make-admin.ts:L11 | neighbors=[make-admin.ts]
- "db_schema_auditactionenum": "auditActionEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L171 | neighbors=[schema.ts]
- "db_schema_auditlogsrelations": "auditLogsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1182 | neighbors=[schema.ts]
- "db_schema_bookingsrelations": "bookingsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1099 | neighbors=[schema.ts]
- "db_schema_bookingstatusenum": "bookingStatusEnum" | kind=code-symbol | source=apps/web/src/db/schema.ts:L118 | neighbors=[schema.ts]
- "db_schema_chatmessagesrelations": "chatMessagesRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1145 | neighbors=[schema.ts]
- "db_schema_chatmoderationactionsrelations": "chatModerationActionsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1152 | neighbors=[schema.ts]
- "db_schema_chatroomsrelations": "chatRoomsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1139 | neighbors=[schema.ts]
- "db_schema_couponredemptions": "couponRedemptions" | kind=code-symbol | source=apps/web/src/db/schema.ts:L836 | neighbors=[schema.ts]
- "db_schema_couponredemptionsrelations": "couponRedemptionsRelations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L1168 | neighbors=[schema.ts]
- "db_schema_couponsapplied": "couponsApplied" | kind=code-symbol | source=apps/web/src/db/schema.ts:L450 | neighbors=[schema.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-008.json

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
