# design-sync notes

Synced to the **Novice Tutor** project (`59e7520c-0de7-41f3-bfb5-d648c769f304`).
First sync: 2026-08-13.

## This repo is an app, not a component library

`apps/web` is a Next.js application: `private: true`, no `main`/`module`/
`exports`, no `dist/`. There is nothing to bundle, so this is deliberately a
**tokens-and-CSS-only** sync — `window.NoviceTutor` is an empty bundle and no
component previews are produced. That was the user's explicit choice
(2026-08-13) after being shown the alternatives.

Two reasons it isn't worth revisiting casually:

- The components worth having (`components/video/*` — VideoTile,
  CallControlBar, PeoplePanel, VolumeSlider) all read a live LiveKit `Room`
  from context. Previewing them means authoring a mock Room, and a mock that
  drifts from the real one makes every preview lie.
- `components/landing/*` is Next-router-coupled.

Genuinely standalone if this is ever revisited: `Spinner`, `WhatsAppButton`,
`CopyLinkButton`, `FadeInOnScroll`, `LocalTime`. That would need a new library
entry (`src/design-system.ts`) plus an esbuild step this repo doesn't have.

## The build sequence

The stylesheet has to be prepared before the converter runs:

```sh
cd apps/web && npm run build && cd ../..     # produces .next/static/css/*
node .design-sync/prepare-css.mjs            # → apps/web/.ds-css/
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules node_modules --out ./ds-bundle --no-render-check
```

- **`--node-modules` must be the repo root**, not `apps/web/node_modules`. This
  is a hoisted npm workspace and react lives only at the root; the package's
  own `node_modules` is sparse and the build dies with "react not found".
- `pkg` is `web` and resolves through the workspace symlink
  `node_modules/web -> ../apps/web`, so the converter's package root is
  `apps/web`.
- `srcDir` points at `.ds-css` on purpose. It is a real directory containing no
  `.tsx`/`.jsx`, which is what routes the converter into its tokens-only branch
  (`[ZERO_MATCH] … treating as tokens-only DS`). Point it at `src` and it will
  synthesize an entry from all 20 app components instead.
- `--no-render-check` is correct here and needs no browser: the render check
  screenshots component preview cards and there are none. Playwright is not
  installed. User signed off 2026-08-13.

## Two traps `prepare-css.mjs` exists to fix

Both are silent — they produce a plausible bundle that renders wrong.

1. **`cfg.cssEntry` is bounded to the package root.** A path outside it is
   *skipped with a warning, not an error* — the build "succeeds" and ships a
   bundle with no styles at all. That is why the prepared CSS is written to
   `apps/web/.ds-css/` and not under `.design-sync/`.
2. **`next/font` does not define its variables globally.** It emits a
   content-hashed class (`.__variable_246ccd{--font-geist-sans:…}`) that
   `layout.tsx` puts on `<html>`. The stylesheet still says
   `body{font-family:var(--font-geist-sans)}`, so outside the app the variable
   is undefined and everything falls back to a system font with no error.
   `prepare-css.mjs` re-declares those values on `:root`, reading them out of
   the generated classes rather than hardcoding the hash.

It also rewrites the absolute font urls (`/_next/static/media/…`) to relative
ones and copies the 11 referenced woff2 files, because the converter resolves
`@font-face` urls on disk relative to the stylesheet.

## The finding that shaped the conventions header

The shipped stylesheet is a **Tailwind JIT build of one application**, so it
contains only the utilities that application uses. Verified against the build:
`bg-sage`, `text-gold`, `border-cream` are **absent** — the `@theme` palette
exists as CSS variables but was never compiled into colour utilities.

That is why `.design-sync/conventions.md` tells the design agent to take colour
from `var(--*)` via inline `style` and use utilities only for layout, spacing
and type. It matches how the codebase is actually written; here it is also the
only thing that renders.

Same mechanism bites individual tokens: `--color-gold-dark` is declared in
`globals.css`'s `@theme` but unreferenced, so Tailwind never emits it. The
header documents it as unavailable.

## Known warns (expected — not new)

- `[ZERO_MATCH] no component exports — treating as tokens-only DS` — the
  intended path, see above.
- `[NO_DIST] no built entry — synthesizing from 0 src files` — follows from
  `srcDir` pointing at `.ds-css`. Harmless.
- `[RENDER_SKIPPED] render check did not run (--no-render-check)` — 0 previews.
- `[CSS_RUNTIME]` fired only on the first attempt, when `cssEntry` was being
  skipped for the containment reason above. It must NOT appear now; if it
  returns, the prepared CSS is not being picked up.

## Re-sync risks

- **The stylesheet is derived from a production build.** Skip
  `npm run build` + `prepare-css.mjs` and you re-upload whatever
  `apps/web/.ds-css/` held last, silently. `.ds-css/` is gitignored, so on a
  fresh clone the build simply fails until it is regenerated — that failure is
  the safe direction.
- **The Next CSS filename is content-hashed.** `prepare-css.mjs` selects by
  content (a file defining `--bg-primary` and `--accent`), not by name or size,
  so a new dependency shipping a larger stylesheet won't hijack it. If the
  token names in `globals.css` are ever renamed, update that selector too.
- **`@livekit/components-styles` ships its own chunk** (`--lk-*` variables) and
  is deliberately excluded — it is vendor call-UI theming, not Novice Tutor's
  design language.
- **The conventions header names real classes and tokens** and was validated
  against the build. Re-validate on every sync: `globals.css` changing, or a
  utility falling out of use, can make a documented name vanish from the JIT
  output without any error.
- The design agent gets no components. If someone reports "it isn't using our
  components", that is this scope decision, not a bug.
