# Node Description Batch 7 of 14

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

- "lib_email_sendsessionreminder": "sendSessionReminder()" | kind=code-symbol | source=apps/web/src/lib/email.ts:L112 | neighbors=[email.ts, getResend()]
- "lib_email_sendweeklydigest": "sendWeeklyDigest()" | kind=code-symbol | source=apps/web/src/lib/email.ts:L163 | neighbors=[email.ts, getResend()]
- "lib_email_sendwelcomeemail": "sendWelcomeEmail()" | kind=code-symbol | source=apps/web/src/lib/email.ts:L67 | neighbors=[email.ts, getResend()]
- "lib_push_sendcallnownotification": "sendCallNowNotification()" | kind=code-symbol | source=apps/web/src/lib/push.ts:L134 | neighbors=[route.ts, push.ts]
- "lib_quota_consumequota": "consumeQuota()" | kind=code-symbol | source=apps/web/src/lib/quota.ts:L237 | neighbors=[route.ts, quota.ts]
- "lib_rbac_getauthcontext": "getAuthContext()" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L82 | neighbors=[rbac.ts, requireAuth()]
- "lib_rbac_orgscope": "orgScope()" | kind=code-symbol | source=apps/web/src/lib/rbac.ts:L216 | neighbors=[rbac.ts, route.ts]
- "lib_stripe_createautochargesubscription": "createAutoChargeSubscription()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L168 | neighbors=[stripe.ts, getStripe()]
- "lib_stripe_createmanualinvoicesubscription": "createManualInvoiceSubscription()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L139 | neighbors=[stripe.ts, getStripe()]
- "lib_stripe_createstripecustomer": "createStripeCustomer()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L95 | neighbors=[stripe.ts, getStripe()]
- "slug_page_adminpage": "AdminPage()" | kind=code-symbol | source=apps/web/src/app/admin/[[...slug]]/page.tsx:L28 | neighbors=[page.tsx, getTableCounts()]
- "slug_page_gettablecounts": "getTableCounts()" | kind=code-symbol | source=apps/web/src/app/admin/[[...slug]]/page.tsx:L242 | neighbors=[page.tsx, AdminPage()]
- "stripe_route_handlesubscriptiondeleted": "handleSubscriptionDeleted()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L179 | neighbors=[route.ts, POST()]
- "stripe_route_handlesubscriptionupdated": "handleSubscriptionUpdated()" | kind=code-symbol | source=apps/web/src/app/api/webhooks/stripe/route.ts:L150 | neighbors=[route.ts, POST()]
- "web_open_next_config": "open-next.config.ts" | kind=code-symbol | source=apps/web/open-next.config.ts:L1 | neighbors=[6765997 feat: Add @neondatabase/serverl…, config]
- "admin_route_get": "GET()" | kind=code-symbol | source=apps/web/src/app/api/debug/admin/route.ts:L6 | neighbors=[route.ts]
- "all_route_get_post": "{ GET, POST }" | kind=code-symbol | source=apps/web/src/app/api/auth/[...all]/route.ts:L27 | neighbors=[route.ts]
- "app_layout_geistmono": "geistMono" | kind=code-symbol | source=apps/web/src/app/layout.tsx:L11 | neighbors=[layout.tsx]
- "app_layout_geistsans": "geistSans" | kind=code-symbol | source=apps/web/src/app/layout.tsx:L6 | neighbors=[layout.tsx]
- "app_layout_metadata": "metadata" | kind=code-symbol | source=apps/web/src/app/layout.tsx:L16 | neighbors=[layout.tsx]
- "app_layout_rootlayout": "RootLayout()" | kind=code-symbol | source=apps/web/src/app/layout.tsx:L26 | neighbors=[layout.tsx]
- "app_page_courses": "Courses()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L284 | neighbors=[page.tsx]
- "app_page_cta": "CTA()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L697 | neighbors=[page.tsx]
- "app_page_faq": "FAQ()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L623 | neighbors=[page.tsx]
- "app_page_footer": "Footer()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L737 | neighbors=[page.tsx]
- "app_page_hero": "Hero()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L125 | neighbors=[page.tsx]
- "app_page_howitworks": "HowItWorks()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L380 | neighbors=[page.tsx]
- "app_page_landingpage": "LandingPage()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L25 | neighbors=[page.tsx]
- "app_page_metadata": "metadata" | kind=code-symbol | source=apps/web/src/app/page.tsx:L8 | neighbors=[page.tsx]
- "app_page_navbar": "Navbar()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L51 | neighbors=[page.tsx]
- "app_page_pricing": "Pricing()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L444 | neighbors=[page.tsx]
- "app_page_testimonials": "Testimonials()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L567 | neighbors=[page.tsx]
- "app_page_trustbar": "TrustBar()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L196 | neighbors=[page.tsx]
- "app_page_whychooseus": "WhyChooseUs()" | kind=code-symbol | source=apps/web/src/app/page.tsx:L213 | neighbors=[page.tsx]
- "assign_student_route_post": "POST()" | kind=code-symbol | source=apps/web/src/app/api/admin/assign-student/route.ts:L16 | neighbors=[route.ts]
- "auth_login_screen_dispose": "dispose()" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L31 | neighbors=[login_screen.dart]
- "auth_login_screen_handlegooglelogin": "_handleGoogleLogin()" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L50 | neighbors=[login_screen.dart]
- "auth_login_screen_handlelogin": "_handleLogin()" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L37 | neighbors=[login_screen.dart]
- "auth_login_screen_loginscreen": "LoginScreen" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L17 | neighbors=[login_screen.dart]
- "auth_login_screen_loginscreenstate": "_LoginScreenState" | kind=code-symbol | source=apps/mobile/lib/screens/auth/login_screen.dart:L24 | neighbors=[login_screen.dart]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-006.json

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
