# Reel design system

The shared visual language for every Reel screen. This file is the prose source
of truth. The **token values** live in [`src/app/globals.css`](../src/app/globals.css)
and that file is canonical for them; this file carries the names, the reasoning,
the contrast table, and the per component usage notes.

Governed by spec [0005](specs/0005-design-system-ui-foundation/index.md). Revised
2026-09-07 to the modern cinematic direction (see the spec's `**Updated**` line).

---

## Character

Modern, cinematic, dark first, poster forward. It should read like a streaming
app, and let the poster art carry the color.

- **Dark by default**, light theme available. Movie poster art is the richest
  content the app has, so the canvas stays out of its way: a near black ground
  (`zinc` neutrals, `#0a0a0a` on dark) lets the posters carry the color.
- **Neutral primary action.** The primary call to action is a high contrast
  neutral pill: near white on dark, near black on light (`--primary`). It signals
  through shape, size, and contrast, the way `Watch now` does in a streaming app,
  not through a brand color.
- **Amber, held back.** Amber is `--rating`: star ratings, scores, and inline
  emphasis such as a "more" link. It also drives the focus ring (`--ring`). It is
  never the fill of a primary button any more.
- **One family**: Geist Sans for everything. There is no serif. Headings at
  `text-3xl` and larger carry hierarchy through `font-semibold` and
  `tracking-tight`.
- **Warmth from the art, not the canvas.** Two utility recipes carry the
  cinematic feel: a warm poster scrim gradient behind titles, and a frosted glass
  panel that floats over poster art. See [Surface recipes](#surface-recipes).
- **Restraint**: few surfaces, few shadows, hairline borders, generous space,
  generous corner radius (`--radius` is `1rem`).

## Build mandate

- Compose from the tokens and the component set below. Do not invent type sizes,
  colors, or spacing per screen.
- No raw hex colors and no raw pixel font sizes in JSX. Colors come from the
  `--color-*` tokens (via `bg-*` / `text-*` / `border-*` utilities), type from
  the scale.
- Every interactive element is reachable by keyboard, shows a visible
  `:focus-visible` ring built from `--ring`, respects the operating system
  "reduce motion" setting, and meets the contrast targets in the table below in
  both themes.
- Amber is `text-rating` (or `bg-rating` for a filled star). Do not reach for the
  `link` button variant styled as a primary call to action.

---

## Type scale

Tailwind's default size / line height scale, unchanged. Weights from Tailwind's
default set. One family: Geist Sans.

| Utility | Size / line height | Weight for headings | Typical use |
|---|---|---|---|
| `text-xs` | 0.75rem / 1rem | | captions, meta, badges |
| `text-sm` | 0.875rem / 1.25rem | | secondary text, controls |
| `text-base` | 1rem / 1.5rem | | body |
| `text-lg` | 1.125rem / 1.75rem | | lead paragraph |
| `text-xl` | 1.25rem / 1.75rem | | card titles, section subheads |
| `text-2xl` | 1.5rem / 2rem | | small headings |
| `text-3xl` | 1.875rem / 2.25rem | `font-semibold tracking-tight` | section headings |
| `text-4xl` | 2.25rem / 2.5rem | `font-semibold tracking-tight` | page headings |
| `text-5xl`+ | 3rem+ | `font-semibold tracking-tight` | hero / marketing |

- **One family**: Geist Sans, wired in the root layout as `--font-sans`
  (`next/font`, `display: "swap"`), exposed as the `font-sans` utility and set on
  `<html>` in `globals.css`.
- **No display face.** `--font-display` is defined in `globals.css` as an alias
  of `var(--font-sans)`, so an existing `font-display` utility still resolves,
  but it is the same font. Headings at `text-3xl` and up use
  `font-semibold tracking-tight` for hierarchy.
- Geist Mono and Fraunces were both removed (wired once, now unused).

---

## Color tokens

Values are in `globals.css` under `:root` (light) and `.dark` (dark). Names
follow the shadcn `zinc` set plus `--rating` and four swipe hint colors. Every
token name appears in **both** theme blocks; a Vitest test
([`src/app/globals.tokens.test.ts`](../src/app/globals.tokens.test.ts)) enforces
that and that every name here exists in `globals.css`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | page canvas |
| `--foreground` | `#09090b` | `#fafafa` | body text |
| `--card` / `--card-foreground` | `#fafafa` / `#09090b` | `#161618` / `#fafafa` | raised surface + its text |
| `--popover` / `--popover-foreground` | `#ffffff` / `#09090b` | `#1c1c1f` / `#fafafa` | overlays + their text |
| `--primary` | `#18181b` | `#fafafa` | primary action pill; neutral, high contrast |
| `--primary-foreground` | `#fafafa` | `#18181b` | text / icon on `--primary` |
| `--rating` | `#b45309` | `#fbbf24` | star ratings, scores, inline emphasis / "more" links |
| `--secondary` / `--secondary-foreground` | `#f4f4f5` / `#18181b` | `#242427` / `#fafafa` | secondary button, inactive genre chip |
| `--muted` / `--muted-foreground` | `#f4f4f5` / `#52525b` | `#242427` / `#a1a1aa` | subdued fills and text |
| `--accent` / `--accent-foreground` | `#f4f4f5` / `#18181b` | `#242427` / `#fafafa` | neutral hover fills (shadcn primitives read this) |
| `--destructive` / `--destructive-foreground` | `#dc2626` / `#fafafa` | `#ef4444` / `#fafafa` | errors, destructive actions |
| `--border` / `--input` | `#e4e4e7` / `#e4e4e7` | `#2a2a2e` / `#2a2a2e` | hairlines, field borders |
| `--ring` | `#b45309` | `#fcd34d` | focus ring (amber, distinct from the neutral `--primary`) |
| `--like` | `#16a34a` | `#22c55e` | `SwipeCard` "like" drag hint |
| `--dislike` | `#dc2626` | `#ef4444` | `SwipeCard` "dislike" drag hint |
| `--seen` | `#2563eb` | `#3b82f6` | `SwipeCard` "seen" drag hint |
| `--skip` | `#52525b` | `#a1a1aa` | `SwipeCard` "skip" drag hint |
| `--radius` | `1rem` | `1rem` | base corner radius (pill / rounded card language) |

`--rating` and `--ring` share the light value (`#b45309`, amber 700); they are
different roles (emphasis vs focus) that happen to want the same shade there.
`--accent` stays a neutral hover fill because the shadcn primitives lean on it
for hover and expanded states.

### WCAG AA contrast table

Targets: **4.5:1** for body text, **3:1** for large text (`text-3xl`+), UI
indicators, and the focus ring. Ratios are computed by the unit tested
`contrastRatio()` helper ([`src/lib/contrast.ts`](../src/lib/contrast.ts)) from
the token hex values and asserted in both themes by
[`src/lib/contrast.test.ts`](../src/lib/contrast.test.ts).

| Pair | Target | Light | Dark |
|---|---|---|---|
| `--foreground` on `--background` | 4.5 | 19.90 | 18.97 |
| `--card-foreground` on `--card` | 4.5 | 19.06 | 17.31 |
| `--primary-foreground` on `--primary` | 4.5 | 16.97 | 16.97 |
| `--secondary-foreground` on `--secondary` | 4.5 | 16.12 | 14.83 |
| `--accent-foreground` on `--accent` | 4.5 | 16.12 | 14.83 |
| `--muted-foreground` on `--background` | 4.5 | 7.73 | 7.72 |
| `--muted-foreground` on `--card` | 4.5 | 7.41 | 7.05 |
| `--destructive` on `--background` | 4.5 | 4.83 | 5.26 |
| `--destructive` on `--card` | 4.5 | 4.63 | 4.80 |
| `--ring` on `--background` | 3 | 5.02 | 13.73 |
| `--ring` on `--card` | 3 | 4.81 | 12.53 |
| `--rating` on `--background` | 3 | 5.02 | 11.86 |
| `--rating` on `--card` | 3 | 4.81 | 10.83 |
| `--like` on `--background` | 3 | 3.30 | 8.69 |
| `--dislike` on `--background` | 3 | 4.83 | 5.26 |
| `--seen` on `--background` | 3 | 5.17 | 5.38 |
| `--skip` on `--background` | 3 | 7.73 | 7.72 |

**On `--rating` for text**: it clears 4.5:1 on both `--background` and `--card` in
both themes as computed above, so it is safe for the small "6.2" score and a
"more" link. It is still asserted only at the 3:1 target (it is a UI accent, not
the body text color); if a future value change drops it below 4.5:1, stop using
it for body size text rather than weakening the target.

Decorative hairlines (`--border` on `--background` or `--card`) are ~1.3:1 and are
**not** required to meet 3:1: they are never the only indicator of a component's
boundary or state (fills, text, and focus rings carry that). They are not in the
asserted table.

---

## Surface recipes

Two token bound utility recipes, not new tokens. They carry the cinematic feel
without adding colors to the parity table.

- **Warm poster scrim.** A gradient layer over the lower part of a poster so a
  title sits legibly on the art:
  `bg-gradient-to-t from-background via-background/80 to-transparent`. Used by
  `MovieCard` (title strip) and the `SwipeCard` face. Optional extra depth: a
  low opacity, heavily blurred copy of the poster behind the canvas for a color
  bleed; the gradient alone is the baseline.
- **Frosted glass panel.** For a panel that floats over poster art (the
  `SwipeCard` action bar, an over poster info panel):
  `bg-card/70 backdrop-blur-xl border border-border/60 rounded-3xl`. Where
  `backdrop-filter` is unsupported it falls back to a solid `--card`, which is
  fine.

---

## Spacing, radius, breakpoints

- **Spacing**: Tailwind's default 0.25rem step scale (`gap-1` = 0.25rem,
  `gap-2` = 0.5rem, ...). Layout helpers (`Stack`, `Cluster`) take a spacing key
  from the set `1 | 2 | 3 | 4 | 6 | 8`.
- **Radius**: base `--radius` is `1rem`. shadcn's derived scale is available:
  `--radius-sm` (`* 0.6`), `--radius-md` (`* 0.8`), `--radius-lg` (`= --radius`),
  `--radius-xl` (`* 1.4`), `--radius-2xl` (`* 1.8`), `--radius-3xl` (`* 2.2`),
  `--radius-4xl` (`* 2.6`). Cards use `rounded-xl` to `rounded-3xl`; inputs use
  `rounded-lg`; buttons and genre chips are `rounded-full` pills.
- **Breakpoints**: Tailwind defaults, unchanged (`sm` 40rem, `md` 48rem,
  `lg` 64rem, `xl` 80rem, `2xl` 96rem). `PageContainer` gutters step at `sm` and
  `lg`.

---

## Motion

Named tokens (in `globals.css`, `@theme` block, theme independent):

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | `150ms` | hover, small state changes |
| `--motion-base` | `250ms` | card transitions, the swipe fling |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | the app decelerate curve (overrides Tailwind's default `ease-out`) |

Swipe threshold constants (in [`src/components/movie/reaction.ts`](../src/components/movie/reaction.ts)):

| Constant | Value | Meaning |
|---|---|---|
| `SWIPE_DISTANCE_THRESHOLD` | `120` (px) | drag distance past which a fling commits |
| `SWIPE_VELOCITY_THRESHOLD` | `500` (px/s) | drag speed past which a short flick commits |

**Reduce motion**: `globals.css` has a `@media (prefers-reduced-motion: reduce)`
backstop that near zeroes animation and transition durations globally.
Components that animate in JS (`SwipeCard`) also branch on `useReducedMotion()`
from `motion/react`: with reduce motion on, drag is disabled, the card changes
with no fling animation, and the button and keyboard paths still work. Tests stub
`window.matchMedia` in the Vitest setup file.

---

## Component usage notes

Primitives (shadcn source in `src/components/ui/`), feedback and layout helpers
(`src/components/`), and the bespoke movie components (`src/components/movie/`).
`src/components/` is shared cross feature UI and is a deliberate exception to the
folder by feature rule (spec 0005 Follow-up: record in `AGENTS.md`).

| Component | Where | Note |
|---|---|---|
| `Button` | `ui/button.tsx` | shadcn source. `rounded-full` pill. Variants `default` (neutral `--primary`), `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes `sm` / `default` / `lg` / `icon`. Focus ring is the shared `--ring` pattern. `default` is the primary call to action; for amber emphasis text use `text-rating`, not `link`. |
| `Card` | `ui/card.tsx` | shadcn source. Compose `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`; do not dump everything in `CardContent`. `--card` surface, hairline ring, `rounded-xl` (scales with `--radius`). For a panel over poster art use the frosted glass recipe. |
| `Input` | `ui/input.tsx` | shadcn source. `--input` border, `--ring` focus ring. Always pair with a `Label`. |
| `Label` | `ui/label.tsx` | shadcn source. `htmlFor` the input id. |
| `Badge` | `ui/badge.tsx` | shadcn source. `rounded-full` pill. `secondary` is an inactive genre chip, `default` (neutral `--primary`) is an active chip, `outline` / `destructive` as needed. Use for genre tags and counts; never a styled `span`. |
| `Skeleton` | `ui/skeleton.tsx` | shadcn source. `--muted` block, pulse. Use for loading placeholders; never a custom `animate-pulse` div. Static under reduce motion (CSS backstop). |
| `Toast` | `ui/sonner.tsx` | `sonner` wrapper from `npx shadcn add sonner`. `<Toaster />` is mounted once at the root layout with `position="top-center"` and `richColors={false}`. Call `toast(...)` from `sonner`. |
| `EmptyState` | `components/empty-state.tsx` | Server component. Centered block for empty or exhausted lists: optional `icon`, required `title`, optional `description` and `action`. |
| `Spinner` | `components/spinner.tsx` | Server component. `role="status"`, sizes `sm` / `md` / `lg` (rem based), optional visually hidden `label`. Renders static dots when reduce motion is on. |
| `PageContainer` | `components/page-container.tsx` | Server component. `max-w-6xl` default; `width="prose"` narrower for reading views, `width="wide"` for marketing. Gutter `px-4 sm:px-6 lg:px-8`. Renders `<main>` by default (`as="div"` to nest). |
| `Stack` | `components/stack.tsx` | Server component. Vertical flex, `gap` from `1 \| 2 \| 3 \| 4 \| 6 \| 8`, optional `align`. No logic. |
| `Cluster` | `components/cluster.tsx` | Server component. Horizontal flex wrap, same `gap` set, optional `align`. No logic. |
| `Poster` | `components/movie/poster.tsx` | Server component. TMDB image at a locked 2:3 ratio through `next/image`, `rounded-2xl`; skeleton while loading; labelled fallback tile when `path` is undefined or `next/image` fires `onError`. URL from `posterUrl(path, size)`. |
| `MovieCard` | `components/movie/movie-card.tsx` | Client component. `Poster` (`rounded-2xl`) + title + year + optional genre `Badge` pills as one focusable element (link when `href`, button when `onSelect`); `:focus-visible` ring; Enter / Space activate. The title strip may sit on the warm poster scrim recipe. |
| `SwipeCard` | `components/movie/swipe-card.tsx` | Client component. Uncontrolled; caller sets `key={movie.id}` to reset. Card face `rounded-3xl` with the poster scrim under the title; the four reaction buttons sit in a frosted glass pill bar. Drag + buttons + arrow keys all resolve through `reactionForDrag` / one shared direction map (right = like, left = dislike, up = seen, down = skip). Fires `onReact` once per card; ignores later input. Directional color hint from the swipe tokens while dragging. After a reaction: focus moves to the card root (`role="group"`, `aria-label`) and an `aria-live="polite"` region names the reaction. Honors `prefers-reduced-motion`. |
| `ThemeToggle` | `components/theme-toggle.tsx` | Client component. Cycles dark -> light -> system; persists via `next-themes`. Sun / moon / monitor icon from `lucide-react`; accessible label. Renders a stable placeholder until mounted so it does not hydration mismatch on the static marketing pages. |
| `ThemeProvider` | `components/theme-provider.tsx` | Client component. Wraps `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`). Mounted in the root layout; `<html>` carries `suppressHydrationWarning`. No hand written no flash script (`next-themes` injects its own). |

The reference bottom tab bar and signed in app shell are **not** in this set;
features 6 and 7 build them on these tokens.
