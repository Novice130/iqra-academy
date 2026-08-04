# Node Description Batch 8 of 14

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

- "auth_register_screen_dispose": "dispose()" | kind=code-symbol | source=apps/mobile/lib/screens/auth/register_screen.dart:L27 | neighbors=[register_screen.dart]
- "auth_register_screen_handleregister": "_handleRegister()" | kind=code-symbol | source=apps/mobile/lib/screens/auth/register_screen.dart:L34 | neighbors=[register_screen.dart]
- "auth_register_screen_registerscreen": "RegisterScreen" | kind=code-symbol | source=apps/mobile/lib/screens/auth/register_screen.dart:L13 | neighbors=[register_screen.dart]
- "auth_register_screen_registerscreenstate": "_RegisterScreenState" | kind=code-symbol | source=apps/mobile/lib/screens/auth/register_screen.dart:L20 | neighbors=[register_screen.dart]
- "availability_page_availabilitypage": "AvailabilityPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/availability/page.tsx:L8 | neighbors=[page.tsx]
- "availability_page_days": "DAYS" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/availability/page.tsx:L5 | neighbors=[page.tsx]
- "availability_page_slots": "SLOTS" | kind=code-symbol | source=apps/web/src/app/dashboard/teacher/availability/page.tsx:L6 | neighbors=[page.tsx]
- "availability_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/teachers/availability/route.ts:L8 | neighbors=[route.ts]
- "availability_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/teachers/availability/route.ts:L26 | neighbors=[route.ts]
- "billing_page_billingpage": "BillingPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/billing/page.tsx:L12 | neighbors=[page.tsx]
- "booking_booking_screen_bookingscreen": "BookingScreen" | kind=code-symbol | source=apps/mobile/lib/screens/booking/booking_screen.dart:L11 | neighbors=[booking_screen.dart]
- "booking_booking_screen_bookingscreenstate": "_BookingScreenState" | kind=code-symbol | source=apps/mobile/lib/screens/booking/booking_screen.dart:L18 | neighbors=[booking_screen.dart]
- "booking_booking_screen_handlebook": "_handleBook()" | kind=code-symbol | source=apps/mobile/lib/screens/booking/booking_screen.dart:L28 | neighbors=[booking_screen.dart]
- "booking_page_bookingpage": "BookingPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/booking/page.tsx:L26 | neighbors=[page.tsx]
- "booking_page_slots": "SLOTS" | kind=code-symbol | source=apps/web/src/app/dashboard/booking/page.tsx:L17 | neighbors=[page.tsx]
- "booking_page_tracks": "TRACKS" | kind=code-symbol | source=apps/web/src/app/dashboard/booking/page.tsx:L11 | neighbors=[page.tsx]
- "bookings_route_bookingschema": "bookingSchema" | kind=code-symbol | source=apps/web/src/app/api/students/bookings/route.ts:L19 | neighbors=[route.ts]
- "bookings_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/students/bookings/route.ts:L23 | neighbors=[route.ts]
- "bookings_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/students/bookings/route.ts:L67 | neighbors=[route.ts]
- "call_now_route_callnowschema": "callNowSchema" | kind=code-symbol | source=apps/web/src/app/api/teachers/call-now/route.ts:L18 | neighbors=[route.ts]
- "call_now_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/teachers/call-now/route.ts:L24 | neighbors=[route.ts]
- "chat_chat_screen_chatscreen": "ChatScreen" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L10 | neighbors=[chat_screen.dart]
- "chat_chat_screen_chatscreenstate": "_ChatScreenState" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L17 | neighbors=[chat_screen.dart]
- "chat_chat_screen_dispose": "dispose()" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L32 | neighbors=[chat_screen.dart]
- "chat_chat_screen_fetchmessages": "_fetchMessages()" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L38 | neighbors=[chat_screen.dart]
- "chat_chat_screen_initstate": "initState()" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L26 | neighbors=[chat_screen.dart]
- "chat_chat_screen_messagebubble": "_MessageBubble" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L224 | neighbors=[chat_screen.dart]
- "chat_chat_screen_scrolltobottom": "_scrollToBottom()" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L60 | neighbors=[chat_screen.dart]
- "chat_chat_screen_sendmessage": "_sendMessage()" | kind=code-symbol | source=apps/mobile/lib/screens/chat/chat_screen.dart:L72 | neighbors=[chat_screen.dart]
- "chat_page_chatpage": "ChatPage()" | kind=code-symbol | source=apps/web/src/app/dashboard/chat/page.tsx:L15 | neighbors=[page.tsx]
- "chat_page_message": "Message" | kind=code-symbol | source=apps/web/src/app/dashboard/chat/page.tsx:L7 | neighbors=[page.tsx]
- "components_animatedsections_animatedsections": "AnimatedSections()" | kind=code-symbol | source=apps/web/src/components/AnimatedSections.tsx:L10 | neighbors=[AnimatedSections.tsx]
- "components_fadeinonscroll_fadeinonscroll": "FadeInOnScroll()" | kind=code-symbol | source=apps/web/src/components/FadeInOnScroll.tsx:L16 | neighbors=[FadeInOnScroll.tsx]
- "components_fadeinonscroll_fadeinonscrollprops": "FadeInOnScrollProps" | kind=code-symbol | source=apps/web/src/components/FadeInOnScroll.tsx:L5 | neighbors=[FadeInOnScroll.tsx]
- "components_whatsappbutton_whatsappbutton": "WhatsAppButton()" | kind=code-symbol | source=apps/web/src/components/WhatsAppButton.tsx:L7 | neighbors=[WhatsAppButton.tsx]
- "config_api_config_apiconfig": "ApiConfig" | kind=code-symbol | source=apps/mobile/lib/config/api_config.dart:L7 | neighbors=[api_config.dart]
- "config_api_config_sessionextend": "sessionExtend()" | kind=code-symbol | source=apps/mobile/lib/config/api_config.dart:L29 | neighbors=[api_config.dart]
- "config_api_config_sessionjoin": "sessionJoin()" | kind=code-symbol | source=apps/mobile/lib/config/api_config.dart:L28 | neighbors=[api_config.dart]
- "config_routes_calculateselectedindex": "_calculateSelectedIndex()" | kind=code-symbol | source=apps/mobile/lib/config/routes.dart:L116 | neighbors=[routes.dart]
- "config_routes_mainshell": "MainShell" | kind=code-symbol | source=apps/mobile/lib/config/routes.dart:L79 | neighbors=[routes.dart]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-007.json

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
