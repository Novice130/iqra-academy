/**
 * Prepare the design system's stylesheet for design-sync.
 *
 * This repo is a Next.js app, not a component library, so there is no `dist/`
 * to point `cfg.cssEntry` at. What there IS — and what every page actually
 * renders with — is the stylesheet Next compiles into `.next/static/css/`.
 * That file is the honest artifact to ship: Tailwind's emitted utilities, the
 * `@theme` palette, the `:root` design tokens from `globals.css`, the
 * `.card`/`.input`/`.call-*` component classes, and the `@font-face` rules
 * `next/font` generated for Geist.
 *
 * Two things stop it being usable as-is:
 *
 *   1. Its filename is content-hashed, so it changes on every build and can't
 *      be named in a committed config.
 *   2. Its font `url()`s are absolute server paths (`/_next/static/media/…`),
 *      which resolve to nothing outside the running app. The converter copies
 *      fonts by resolving each `url()` on disk *relative to the stylesheet*,
 *      so the rules have to point at real neighbouring files or every design
 *      silently falls back to a system font.
 *
 * So this writes a stable copy next to a `media/` directory of the real woff2
 * files, with the urls rewritten to match.
 *
 * Output lands in `apps/web/.ds-css/` rather than under `.design-sync/`: the
 * converter bounds `cfg.cssEntry` to the package root and silently SKIPS a
 * path outside it ("resolves outside the package"), which produces a bundle
 * with no styles at all rather than an error. It is derived and gitignored —
 * rerun this after any `npm run build`.
 *
 *   node .design-sync/prepare-css.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = join(ROOT, 'apps/web/.next/static');
const OUT = join(ROOT, 'apps/web/.ds-css');

const cssDir = join(NEXT, 'css');
let candidates;
try {
  candidates = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
} catch {
  console.error(`✗ ${cssDir} not found — run \`cd apps/web && npm run build\` first.`);
  process.exit(1);
}

// The app stylesheet is the one carrying our own tokens. Identify it by
// content, not by size: `@livekit/components-styles` ships its own chunk and a
// future dependency could easily be larger than ours.
const appCss = candidates
  .map((f) => ({ f, text: readFileSync(join(cssDir, f), 'utf8') }))
  .filter(({ text }) => text.includes('--bg-primary') && text.includes('--accent'))
  .sort((a, b) => b.text.length - a.text.length)[0];

if (!appCss) {
  console.error('✗ no compiled stylesheet contains the design tokens (--bg-primary/--accent).');
  console.error('  Checked:', candidates.join(', '));
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'media'), { recursive: true });

// Rewrite the absolute font urls and copy only the files actually referenced —
// `.next/static/media` also holds images from the marketing pages.
const referenced = new Set();
const css = appCss.text.replace(/url\(\/_next\/static\/media\/([^)]+)\)/g, (_, file) => {
  referenced.add(file);
  return `url(./media/${file})`;
});

let copied = 0;
for (const file of referenced) {
  const src = join(NEXT, 'media', file);
  try {
    statSync(src);
    copyFileSync(src, join(OUT, 'media', file));
    copied++;
  } catch {
    console.error(`  ! referenced font missing on disk: ${file}`);
  }
}

/*
 * Promote the font variables to `:root`.
 *
 * `next/font` does not define `--font-geist-sans` globally. It emits a
 * content-hashed class (`.__variable_246ccd{--font-geist-sans:…}`) that
 * `layout.tsx` puts on `<html>` — so inside the app the variable is
 * effectively global, and outside it is undefined. The stylesheet still says
 * `body{font-family:var(--font-geist-sans)}`, which means a design built with
 * this system would silently render in a fallback font with nothing to
 * indicate anything was wrong.
 *
 * Re-declaring the same values on `:root` makes the shipped stylesheet
 * self-sufficient. Values are read out of the generated classes rather than
 * hardcoded, because that hash changes on every build.
 */
const fontVars = [...css.matchAll(/\.__variable_[a-f0-9]+\{([^}]*)\}/g)]
  .map((m) => m[1].trim().replace(/;$/, ''))
  .filter(Boolean);

if (fontVars.length) {
  writeFileSync(join(OUT, 'styles.css'), `${css}\n:root{${fontVars.join(';')}}\n`);
  console.error(`✓ promoted ${fontVars.length} next/font variable(s) to :root`);
} else {
  writeFileSync(join(OUT, 'styles.css'), css);
  console.error('  ! no .__variable_* font classes found — check next/font is still in use');
}

console.error(`✓ ${appCss.f} → apps/web/.ds-css/styles.css (${Math.round(css.length / 1024)}KB)`);
console.error(`✓ ${copied}/${referenced.size} referenced font files → apps/web/.ds-css/media/`);
