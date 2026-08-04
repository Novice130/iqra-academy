# Node Description Batch 14 of 14

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

- "web_check_booking_run": "run()" | kind=code-symbol | source=apps/web/check-booking.ts:L8 | neighbors=[check-booking.ts]
- "web_check_role_run": "run()" | kind=code-symbol | source=apps/web/check-role.ts:L8 | neighbors=[check-role.ts]
- "web_clear_session_run": "run()" | kind=code-symbol | source=apps/web/clear-session.ts:L5 | neighbors=[clear-session.ts]
- "web_drizzle_config": "drizzle.config.ts" | kind=code-symbol | source=apps/web/drizzle.config.ts:L1 | neighbors=[8622df6 feat: migrate Jitsi to self-hos…]
- "web_eslint_config_compat": "compat" | kind=code-symbol | source=apps/web/eslint.config.mjs:L8 | neighbors=[eslint.config.mjs]
- "web_eslint_config_dirname": "__dirname" | kind=code-symbol | source=apps/web/eslint.config.mjs:L6 | neighbors=[eslint.config.mjs]
- "web_eslint_config_eslintconfig": "eslintConfig" | kind=code-symbol | source=apps/web/eslint.config.mjs:L12 | neighbors=[eslint.config.mjs]
- "web_eslint_config_filename": "__filename" | kind=code-symbol | source=apps/web/eslint.config.mjs:L5 | neighbors=[eslint.config.mjs]
- "web_next_config": "next.config.ts" | kind=code-symbol | source=apps/web/next.config.ts:L1 | neighbors=[nextConfig]
- "web_next_config_nextconfig": "nextConfig" | kind=code-symbol | source=apps/web/next.config.ts:L3 | neighbors=[next.config.ts]
- "web_open_next_config_config": "config" | kind=code-symbol | source=apps/web/open-next.config.ts:L3 | neighbors=[open-next.config.ts]
- "web_postcss_config": "postcss.config.mjs" | kind=code-symbol | source=apps/web/postcss.config.mjs:L1 | neighbors=[config]
- "web_postcss_config_config": "config" | kind=code-symbol | source=apps/web/postcss.config.mjs:L1 | neighbors=[postcss.config.mjs]
- "web_query_db_run": "run()" | kind=code-symbol | source=apps/web/query_db.ts:L5 | neighbors=[query_db.ts]
- "widgets_brand_logo_brandlogo": "BrandLogo" | kind=code-symbol | source=apps/mobile/lib/widgets/brand_logo.dart:L5 | neighbors=[brand_logo.dart]
- "widgets_brand_logo_brandwordmark": "BrandWordmark" | kind=code-symbol | source=apps/mobile/lib/widgets/brand_logo.dart:L42 | neighbors=[brand_logo.dart]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: /Users/abdulhannan/Documents/Phet/Quran learning/quran-lms/.graphify/description-instructions/batch-013.json

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
