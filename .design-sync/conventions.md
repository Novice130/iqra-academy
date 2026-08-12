# Novice Tutor — how to build with this design system

Novice Tutor is a Quran-learning LMS: teachers run live video classes with
students, plus scheduling, billing and progress tracking. The look is warm and
calm — cream paper, sage green, restrained gold — not a typical SaaS blue.

**This system ships styles, not components.** There is no component library to
import: `window.NoviceTutor` is empty by design. What you get is the compiled
stylesheet the product itself renders with — its tokens, its fonts, and its
component classes. Build with plain JSX plus the vocabulary below.

## Setup

No provider, no wrapper, no theme object. Load `styles.css` and you have
everything; `body` already carries the background, text colour and font.

This system is **light only** — it has no dark theme and no dark-mode tokens.
Build light and do not reach for `dark:` variants; the single one present in
the stylesheet comes from a dependency, not from this design system.

## The one rule that matters: colour comes from tokens, not utilities

The stylesheet is a **Tailwind JIT build of one application**, so it contains
only the utilities that application happens to use. The brand palette is
defined as `@theme` colours, but `bg-sage`, `text-gold`, `border-cream` and
friends **were never compiled and will silently do nothing.**

So:

- **Layout, spacing, size, typography → Tailwind utilities.** The common set is
  present: `flex`, `grid-cols-2`, `gap-4`, `p-6`, `mb-4`, `w-full`,
  `max-w-5xl`, `items-center`, `justify-between`, `text-sm`, `font-semibold`,
  `rounded-lg`, `overflow-x-auto`, plus `md:`/`lg:` and `hover:` variants.
- **Every colour, border, radius and shadow → an inline `style` reading a CSS
  variable.** `style={{ color: 'var(--text-primary)' }}`, never `text-charcoal`.

That is not a stylistic preference — it is the only thing that renders.

## Tokens

| Token | Use |
|---|---|
| `--bg-primary` | page background (warm off-white) |
| `--bg-secondary` | subtle fills, striped rows |
| `--bg-elevated` | cards and panels (white) |
| `--text-primary` | body and headings |
| `--text-secondary` | supporting copy |
| `--text-tertiary` | labels, captions, table headers |
| `--accent` / `--accent-hover` | sage green — primary actions |
| `--accent-light` | tinted accent background |
| `--border` / `--border-focus` | hairlines; focus ring |
| `--radius` | standard corner (10px) |
| `--shadow-sm` / `--shadow-md` | resting / raised elevation |

Brand palette, for when a raw colour is wanted:
`--color-sage`, `--color-sage-dark`, `--color-sage-light`, `--color-cream`,
`--color-gold`, `--color-warm-bg`, `--color-charcoal`, `--color-gray`.

(The source also declares `--color-gold-dark`, but Tailwind only emits theme
variables the app actually uses and that one is unreferenced, so it is **not**
in the shipped stylesheet. Use `--color-gold` and darken it yourself.)

Fonts are Geist and Geist Mono, already wired to `--font-geist-sans` and
`--font-geist-mono` and applied to `body`.

## Component classes

Real classes in the stylesheet — prefer them over rebuilding the look:

- `.card` — the standard surface (elevated background, hairline border,
  `--radius`, `--shadow-sm`). Almost every panel in the product is one.
- `.btn-primary`, `.btn-secondary` — the two button treatments.
- `.input` — text fields and selects.
- App-shell family (native/mobile chrome): `.app-shell`, `.app-titlebar`,
  `.app-title`, `.app-tabbar`, `.app-tab`, `.app-avatar`, `.app-sheet` with
  `.app-sheet-head` / `-list` / `-link` / `-name` / `-email` / `-grip` /
  `-scrim` / `-signout`.
- Call-screen family: `.call-surface`, `.call-control-bar`.
- Motion: `.animate-in`, `.fade-in-hidden`, `.fade-in-visible`.

## Where the truth is

Read `_ds/<folder>/styles.css` and the `_ds_bundle.css` it imports before
styling anything unusual — that file is the product's actual compiled CSS, and
it is authoritative over this summary.

## An idiomatic screen

```jsx
<div className="p-6 lg:p-10 max-w-5xl">
  <h1 className="text-2xl font-bold tracking-tight"
      style={{ color: 'var(--text-primary)' }}>
    Today's classes
  </h1>
  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
    Three students are booked this morning.
  </p>

  <section className="card mt-6">
    <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-tertiary)' }}>
        Schedule
      </h2>
    </div>
    <div className="flex items-center justify-between p-5">
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
        Qaidah · 6:00 PM
      </span>
      <button className="btn-primary">Join</button>
    </div>
  </section>
</div>
```

Note the split: utilities carry the layout, `style` carries every colour, and
`.card` / `.btn-primary` carry the components. Follow that and it looks like
Novice Tutor.
