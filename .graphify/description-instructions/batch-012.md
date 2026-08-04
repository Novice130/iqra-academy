# Node Description Batch 13 of 14

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

- "services_api_client_patch": "patch()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L76 | neighbors=[api_client.dart]
- "services_api_client_post": "post()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L71 | neighbors=[api_client.dart]
- "services_api_client_settoken": "setToken()" | kind=code-symbol | source=apps/mobile/lib/services/api_client.dart:L50 | neighbors=[api_client.dart]
- "services_auth_service_authnotifier": "AuthNotifier" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L43 | neighbors=[auth_service.dart]
- "services_auth_service_authstate": "AuthState" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L14 | neighbors=[auth_service.dart]
- "services_auth_service_checksession": "_checkSession()" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L55 | neighbors=[auth_service.dart]
- "services_auth_service_signin": "signIn()" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L81 | neighbors=[auth_service.dart]
- "services_auth_service_signinwithgoogle": "signInWithGoogle()" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L159 | neighbors=[auth_service.dart]
- "services_auth_service_signout": "signOut()" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L213 | neighbors=[auth_service.dart]
- "services_auth_service_signup": "signUp()" | kind=code-symbol | source=apps/mobile/lib/services/auth_service.dart:L117 | neighbors=[auth_service.dart]
- "session_live_session_screen_initstate": "initState()" | kind=code-symbol | source=apps/mobile/lib/screens/session/live_session_screen.dart:L37 | neighbors=[live_session_screen.dart]
- "session_live_session_screen_livesessionscreen": "LiveSessionScreen" | kind=code-symbol | source=apps/mobile/lib/screens/session/live_session_screen.dart:L23 | neighbors=[live_session_screen.dart]
- "session_live_session_screen_livesessionscreenstate": "_LiveSessionScreenState" | kind=code-symbol | source=apps/mobile/lib/screens/session/live_session_screen.dart:L31 | neighbors=[live_session_screen.dart]
- "session_live_session_screen_loadsession": "_loadSession()" | kind=code-symbol | source=apps/mobile/lib/screens/session/live_session_screen.dart:L42 | neighbors=[live_session_screen.dart]
- "sessions_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/teachers/sessions/route.ts:L16 | neighbors=[route.ts]
- "settings_page_settingspage": "SettingsPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/settings/page.tsx:L9 | neighbors=[page.tsx]
- "settings_settings_screen_sectionheader": "_SectionHeader" | kind=code-symbol | source=apps/mobile/lib/screens/settings/settings_screen.dart:L180 | neighbors=[settings_screen.dart]
- "settings_settings_screen_settingsitem": "_SettingsItem" | kind=code-symbol | source=apps/mobile/lib/screens/settings/settings_screen.dart:L201 | neighbors=[settings_screen.dart]
- "settings_settings_screen_settingsscreen": "SettingsScreen" | kind=code-symbol | source=apps/mobile/lib/screens/settings/settings_screen.dart:L18 | neighbors=[settings_screen.dart]
- "src_middleware_config": "config" | kind=code-symbol | source=apps/web/src/middleware.ts:L24 | neighbors=[middleware.ts]
- "src_middleware_middleware": "middleware()" | kind=code-symbol | source=apps/web/src/middleware.ts:L4 | neighbors=[middleware.ts]
- "students_assignstudentmodal_assignstudentmodal": "AssignStudentModal()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx:L18 | neighbors=[AssignStudentModal.tsx]
- "students_assignstudentmodal_studentprofile": "StudentProfile" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx:L6 | neighbors=[AssignStudentModal.tsx]
- "students_assignstudentmodal_teacher": "Teacher" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/AssignStudentModal.tsx:L12 | neighbors=[AssignStudentModal.tsx]
- "students_page_teacherstudentspage": "TeacherStudentsPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/students/page.tsx:L14 | neighbors=[page.tsx]
- "teacher_page_statcard": "StatCard()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/page.tsx:L231 | neighbors=[page.tsx]
- "teacher_page_teacherdashboard": "TeacherDashboard()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/page.tsx:L15 | neighbors=[page.tsx]
- "teacher_startinstantmeetingbutton_startinstantmeetingbutton": "StartInstantMeetingButton()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/StartInstantMeetingButton.tsx:L6 | neighbors=[StartInstantMeetingButton.tsx]
- "terms_page_metadata": "metadata" | kind=code-symbol | source=apps/web/src/app/terms/page.tsx:L4 | neighbors=[page.tsx]
- "terms_page_section": "Section()" | kind=code-symbol | source=apps/web/src/app/terms/page.tsx:L210 | neighbors=[page.tsx]
- "terms_page_termspage": "TermsPage()" | kind=code-symbol | source=apps/web/src/app/terms/page.tsx:L10 | neighbors=[page.tsx]
- "users_route_createuserschema": "createUserSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L19 | neighbors=[route.ts]
- "users_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L34 | neighbors=[route.ts]
- "users_route_patch": "PATCH()" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L116 | neighbors=[route.ts]
- "users_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L79 | neighbors=[route.ts]
- "users_route_updateuserschema": "updateUserSchema" | kind=code-symbol | source=apps/web/src/app/api/admin/users/route.ts:L26 | neighbors=[route.ts]
- "video_livekitroom_livekitroom": "LiveKitRoom()" | kind=code-symbol | source=apps/web/src/components/video/LiveKitRoom.tsx:L16 | neighbors=[LiveKitRoom.tsx]
- "video_livekitroom_livekitroomprops": "LiveKitRoomProps" | kind=code-symbol | source=apps/web/src/components/video/LiveKitRoom.tsx:L11 | neighbors=[LiveKitRoom.tsx]
- "video_prejoinscreen_prejoinscreen": "PreJoinScreen()" | kind=code-symbol | source=apps/web/src/components/video/PreJoinScreen.tsx:L10 | neighbors=[PreJoinScreen.tsx]
- "video_prejoinscreen_prejoinscreenprops": "PreJoinScreenProps" | kind=code-symbol | source=apps/web/src/components/video/PreJoinScreen.tsx:L5 | neighbors=[PreJoinScreen.tsx]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-012.json

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
