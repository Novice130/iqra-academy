# Node Description Batch 5 of 14

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

- "commit:repo:github.com/Novice130/iqra-academy@3943ad34d65b7db696317bb11dc8bb6d518247c3": "3943ad3 chore: enable BETTER_AUTH_SECRET as build argument" | kind=Commit | source=git | neighbors=[master, 9c0321b fix: provide dummy BETTER_AUTH_…, 902adbc feat: rebuild landing page with…]
- "commit:repo:github.com/Novice130/iqra-academy@3bde0be6df01f68f1da523f2b0c9ba5db4d1a766": "3bde0be fix: point default orgId to existing organization ID to fix registration" | kind=Commit | source=git | neighbors=[36c3af9 feat: replace text logo with Iq…, master, 024609b fix: use better-auth client for…]
- "commit:repo:github.com/Novice130/iqra-academy@4151fbaa3b181c5fbac9bef6b8b48935b57ceafd": "4151fba fix(auth): middleware to check for Secure session cookie on production" | kind=Commit | source=git | neighbors=[master, b098c4a fix(build): lazy-init Stripe an…, cb6ac58 fix(ui): use correct logo image…]
- "commit:repo:github.com/Novice130/iqra-academy@43fa3c110d6d5fdf657699cc28c7dd01ba224783": "43fa3c1 fix: update build script for Cloudflare Workers Git CI automated deploy…" | kind=Commit | source=git | neighbors=[master, 663dae1 fix: pin @noble/ciphers to 2.1.…, b0d12b3 fix: replace top-level return i…]
- "commit:repo:github.com/Novice130/iqra-academy@52f4f5d073f0b81619ec3466dd0abe8dee3817a1": "52f4f5d" | kind=Commit | source=git | neighbors=[12c3a66 main website, master, 343f92b Checkpoint from VS Code for clo…]
- "commit:repo:github.com/Novice130/iqra-academy@6010f7f7c4b6e242f3e121c17e2abab66121a25e": "6010f7f feat: add scroll animations, WhatsApp button, privacy + terms pages" | kind=Commit | source=git | neighbors=[1abd235 fix: add dummy API keys for Str…, master, e3a6ea3 docs: update deployment guide —…]
- "commit:repo:github.com/Novice130/iqra-academy@663dae1a735d180a9b7a83c9b0ddc625061986b9": "663dae1 fix: pin @noble/ciphers to 2.1.1 to fix breaking package export subpath…" | kind=Commit | source=git | neighbors=[43fa3c1 fix: update build script for Cl…, master, 9d0c7b3 fix: force install @noble/ciphe…]
- "commit:repo:github.com/Novice130/iqra-academy@6e0d58bb4f06ec6d8ed7cbfd3369b19dd13268c8": "6e0d58b fix: directly patch @noble/ciphers exports map in cf-build.cjs instead …" | kind=Commit | source=git | neighbors=[master, 0f09475 fix: revert build script to nex…, 9d0c7b3 fix: force install @noble/ciphe…]
- "commit:repo:github.com/Novice130/iqra-academy@902adbc3e7f1bcda502c17a3ab7bf7f388235477": "902adbc feat: rebuild landing page with CITCD color palette + fix critical Tail…" | kind=Commit | source=git | neighbors=[343f92b Checkpoint from VS Code for clo…, master, 3943ad3 chore: enable BETTER_AUTH_SECRE…]
- "commit:repo:github.com/Novice130/iqra-academy@9c0321b09e44262da2f1fdb3de18a0b90a24f617": "9c0321b fix: provide dummy BETTER_AUTH_SECRET in Dockerfile for foolproof build" | kind=Commit | source=git | neighbors=[3943ad3 chore: enable BETTER_AUTH_SECRE…, master, 1abd235 fix: add dummy API keys for Str…]
- "commit:repo:github.com/Novice130/iqra-academy@9d0c7b330d2f1f1b1888110d52917354dab1006d": "9d0c7b3 fix: force install @noble/ciphers 2.1.1 in cf-build script to bypass Cl…" | kind=Commit | source=git | neighbors=[663dae1 fix: pin @noble/ciphers to 2.1.…, master, 6e0d58b fix: directly patch @noble/ciph…]
- "commit:repo:github.com/Novice130/iqra-academy@9d441eb0cf7fc57195d6b7477823961fdec27ea0": "9d441eb Fix gitignore to remove 10k uncommitted files" | kind=Commit | source=git | neighbors=[master, b095279 Ignore monorepo node_modules an…, c560325 fix: use provided logo image ev…]
- "commit:repo:github.com/Novice130/iqra-academy@b098c4a08f5af4b165faddf48052104db0398183": "b098c4a fix(build): lazy-init Stripe and Resend SDKs to prevent Docker build cr…" | kind=Commit | source=git | neighbors=[4151fba fix(auth): middleware to check …, master, ca6d513 feat: update branding and dashb…]
- "commit:repo:github.com/Novice130/iqra-academy@b0d12b347a410fa4a651c8d80ac3d92f0cb2b6af": "b0d12b3 fix: replace top-level return in postinstall script with process.exit(0…" | kind=Commit | source=git | neighbors=[2ebb4d5 docs: Update deployment documen…, master, 43fa3c1 fix: update build script for Cl…]
- "commit:repo:github.com/Novice130/iqra-academy@cb6ac58316f45e5b8395d3f450b6dab2f65db8b6": "cb6ac58 fix(ui): use correct logo image everywhere and fix auth redirect" | kind=Commit | source=git | neighbors=[024609b fix: use better-auth client for…, master, 4151fba fix(auth): middleware to check …]
- "commit:repo:github.com/Novice130/iqra-academy@cd044a9870028caaa25870305ad552baaf4b9c17": "cd044a9 fix: add Better Auth tables and default orgId for user registration" | kind=Commit | source=git | neighbors=[0fdd936 fix: login page styling + googl…, master, 36c3af9 feat: replace text logo with Iq…]
- "commit:repo:github.com/Novice130/iqra-academy@e3a6ea33303d47b850d0a6420aea6112369296f7": "e3a6ea3 docs: update deployment guide — single Dokploy project for all services" | kind=Commit | source=git | neighbors=[6010f7f feat: add scroll animations, Wh…, master, 0fdd936 fix: login page styling + googl…]
- "config_theme": "theme.dart" | kind=code-symbol | source=apps/mobile/lib/config/theme.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, IqraTheme]
- "db_schema_accounts": "accounts" | kind=code-symbol | source=apps/web/src/db/schema.ts:L969 | neighbors=[schema.ts, check-users.ts, clean_and_assign.ts]
- "db_schema_chatmessages": "chatMessages" | kind=code-symbol | source=apps/web/src/db/schema.ts:L760 | neighbors=[schema.ts, route.ts, route.ts]
- "db_schema_chatrooms": "chatRooms" | kind=code-symbol | source=apps/web/src/db/schema.ts:L735 | neighbors=[schema.ts, seed.ts, route.ts]
- "db_schema_organizations": "organizations" | kind=code-symbol | source=apps/web/src/db/schema.ts:L209 | neighbors=[schema.ts, seed.ts, route.ts]
- "drizzle_0000_jittery_weapon_omega_audit_logs": "audit_logs" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L30 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.users]
- "drizzle_0000_jittery_weapon_omega_chat_rooms": "chat_rooms" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L88 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.sessions]
- "drizzle_0000_jittery_weapon_omega_coupon_redemptions": "coupon_redemptions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L99 | neighbors=[0000_jittery_weapon_omega.sql, public.coupons, public.users]
- "drizzle_0000_jittery_weapon_omega_coupons_applied": "coupons_applied" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L126 | neighbors=[0000_jittery_weapon_omega.sql, public.coupons, public.subscriptions]
- "drizzle_0000_jittery_weapon_omega_crm_sync_events": "crm_sync_events" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L136 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.users]
- "drizzle_0000_jittery_weapon_omega_entitlements": "entitlements" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L163 | neighbors=[0000_jittery_weapon_omega.sql, public.student_profiles, public.subscriptions]
- "drizzle_0000_jittery_weapon_omega_public_coupons": "public.coupons" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L408 | neighbors=[0000_jittery_weapon_omega.sql, coupon_redemptions, coupons_applied]
- "drizzle_0000_jittery_weapon_omega_session_attendees": "session_attendees" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L280 | neighbors=[0000_jittery_weapon_omega.sql, public.sessions, public.student_profiles]
- "drizzle_0000_jittery_weapon_omega_sessions": "sessions" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L289 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.users]
- "drizzle_0000_jittery_weapon_omega_student_profiles": "student_profiles" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L313 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.users]
- "drizzle_0000_jittery_weapon_omega_teacher_availability": "teacher_availability" | kind=code-symbol | source=apps/web/drizzle/0000_jittery_weapon_omega.sql:L343 | neighbors=[0000_jittery_weapon_omega.sql, public.organizations, public.users]
- "health_route": "route.ts" | kind=code-symbol | source=apps/web/src/app/api/health/route.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…, b095279 Ignore monorepo node_modules an…, GET()]
- "lib_app": "app.dart" | kind=code-symbol | source=apps/mobile/lib/app.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, IqraAcademyApp]
- "lib_email_sendpaymentreceipt": "sendPaymentReceipt()" | kind=code-symbol | source=apps/web/src/lib/email.ts:L219 | neighbors=[email.ts, getResend(), route.ts]
- "lib_main": "main.dart" | kind=code-symbol | source=apps/mobile/lib/main.dart:L1 | neighbors=[343f92b Checkpoint from VS Code for clo…, 8622df6 feat: migrate Jitsi to self-hos…, main()]
- "lib_quota_getquotastatus": "getQuotaStatus()" | kind=code-symbol | source=apps/web/src/lib/quota.ts:L87 | neighbors=[route.ts, page.tsx, quota.ts]
- "lib_stripe_createstripecoupon": "createStripeCoupon()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L248 | neighbors=[route.ts, stripe.ts, getStripe()]
- "lib_stripe_issuerefund": "issueRefund()" | kind=code-symbol | source=apps/web/src/lib/stripe.ts:L214 | neighbors=[stripe.ts, getStripe(), route.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-004.json

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
