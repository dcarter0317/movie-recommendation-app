# Reel design system

The shared visual language for every Reel screen. This file is the prose source
of truth. The **token values** live in [`src/app/globals.css`](../src/app/globals.css)
and that file is canonical for them; this file carries the names, the reasoning,
the contrast table, and the per component usage notes.

Governed by spec [0005](specs/0005-design-system-ui-foundation/index.md).

---

## Character

Cinematic, dark first, poster forward.

- **Dark by default**, light theme available. Movie poster art is the richest
  content the app has, so the canvas stays out of its way: a cool near black
  ground (`zinc` neutrals) lets the posters carry the color.
- **One warm accent**: amber. It reads as marquee lights and film awards, holds
  contrast on the dark ground, and is distinct from Letterboxd green and Trakt red.
- **Two families**: Geist Sans for everything you read and operate, Fraunces (a
  high contrast serif) for large display headings only. The serif evokes film
  titles and editorial film writing and gives the product a voice.
- **Restraint**: few surfaces, few shadows, hairline borders, generous space.
  The product should feel like a film app, not a dashboard.

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
- Fraunces (`font-display`) is used **only at `text-3xl` and larger**.

---

## Type scale

Tailwind's default size / line height scale, unchanged. Weights from Tailwind's
default set.

| Utility | Size / line height | Family | Typical use |
|---|---|---|---|
| `text-xs` | 0.75rem / 1rem | `font-sans` | captions, meta, badges |
| `text-sm` | 0.875rem / 1.25rem | `font-sans` | secondary text, controls |
| `text-base` | 1rem / 1.5rem | `font-sans` | body |
| `text-lg` | 1.125rem / 1.75rem | `font-sans` | lead paragraph |
| `text-xl` | 1.25rem / 1.75rem | `font-sans` | card titles, section subheads |
| `text-2xl` | 1.5rem / 2rem | `font-sans` | small headings |
| `text-3xl` | 1.875rem / 2.25rem | **`font-display`** | section headings |
| `text-4xl` | 2.25rem / 2.5rem | **`font-display`** | page headings |
| `text-5xl`+ | 3rem+ | **`font-display`** | hero / marketing |

- **Body / UI family**: Geist Sans, wired in the root layout as `--font-sans`
  (`next/font`, `display: "swap"`), exposed as the `font-sans` utility and set on
  `<html>` in `globals.css`.
- **Display family**: Fraunces, wired as `--font-display` (variable weight, no
  extra axes, `display: "swap"`), exposed as the `font-display` utility. Apply it
  explicitly on headings at `text-3xl` and up. Do not use it below that.
- Geist Mono was removed (it was wired but unused).

---

## Color tokens

Values are in `globals.css` under `:root` (light) and `.dark` (dark). Names
follow the shadcn `zinc` set plus four swipe hint colors. Every token name
appears in **both** theme blocks; a Vitest test
([`src/app/globals.tokens.test.ts`](../src/app/globals.tokens.test.ts)) enforces
that and that every name here exists in `globals.css`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#ffffff` | `#09090b` | page canvas |
| `--foreground` | `#09090b` | `#fafafa` | body text |
| `--card` / `--card-foreground` | `#ffffff` / `#09090b` | `#18181b` / `#fafafa` | raised surface + its text |
| `--popover` / `--popover-foreground` | `#ffffff` / `#09090b` | `#18181b` / `#fafafa` | overlays + their text |
| `--primary` | `#d97706` | `#fbbf24` | primary action, accent |
| `--primary-foreground` | `#1c1917` | `#1c1917` | text / icon on `--primary` |
| `--secondary` / `--secondary-foreground` | `#f4f4f5` / `#18181b` | `#27272a` / `#fafafa` | secondary button |
| `--muted` / `--muted-foreground` | `#f4f4f5` / `#52525b` | `#27272a` / `#a1a1aa` | subdued fills and text |
| `--accent` / `--accent-foreground` | `#f4f4f5` / `#18181b` | `#27272a` / `#fafafa` | hover fills |
| `--destructive` / `--destructive-foreground` | `#dc2626` / `#fafafa` | `#ef4444` / `#fafafa` | errors, destructive actions |
| `--border` / `--input` | `#e4e4e7` / `#e4e4e7` | `#27272a` / `#27272a` | hairlines, field borders |
| `--ring` | `#b45309` | `#fcd34d` | focus ring (a distinct amber from `--primary`) |
| `--like` | `#16a34a` | `#22c55e` | `SwipeCard` "like" drag hint |
| `--dislike` | `#dc2626` | `#ef4444` | `SwipeCard` "dislike" drag hint |
| `--seen` | `#2563eb` | `#3b82f6` | `SwipeCard` "seen" drag hint |
| `--skip` | `#52525b` | `#a1a1aa` | `SwipeCard` "skip" drag hint |
| `--radius` | `0.625rem` | `0.625rem` | base corner radius |

`--ring` is a different amber from `--primary` (700 in light, 300 in dark) so a
focused primary button stays legible without a per case judgment.

### WCAG AA contrast table

Targets: **4.5:1** for body text, **3:1** for large text (`text-3xl`+), UI
indicators, and the focus ring. Ratios are computed by the unit tested
`contrastRatio()` helper ([`src/lib/contrast.ts`](../src/lib/contrast.ts)) from
the token hex values and asserted in both themes by
[`src/lib/contrast.test.ts`](../src/lib/contrast.test.ts).

| Pair | Target | Light | Dark |
|---|---|---|---|
| `--foreground` on `--background` | 4.5 | 19.90 | 19.06 |
| `--card-foreground` on `--card` | 4.5 | 19.90 | 16.97 |
| `--primary-foreground` on `--primary` | 4.5 | 5.49 | 10.48 |
| `--secondary-foreground` on `--secondary` | 4.5 | 16.12 | 14.27 |
| `--accent-foreground` on `--accent` | 4.5 | 16.12 | 14.27 |
| `--muted-foreground` on `--background` | 4.5 | 7.73 | 7.76 |
| `--muted-foreground` on `--card` | 4.5 | 7.73 | 6.91 |
| `--destructive` on `--background` | 4.5 | 4.83 | 5.29 |
| `--destructive` on `--card` | 4.5 | 4.83 | 4.71 |
| `--ring` on `--background` | 3 | 5.02 | 13.80 |
| `--ring` on `--card` | 3 | 5.02 | 12.29 |
| `--primary` on `--background` (large text / UI only) | 3 | 3.19 | 11.92 |
| `--like` on `--background` | 3 | 3.30 | 8.73 |
| `--dislike` on `--background` | 3 | 4.83 | 5.29 |
| `--seen` on `--background` | 3 | 5.17 | 5.41 |
| `--skip` on `--background` | 3 | 7.73 | 7.76 |

**Known limit**: `--primary` as text on `--background` is 3.19:1 in light mode,
which passes 3:1 (large text and UI) but **not** 4.5:1 for body size text. Do not
use the `link` button variant or bare `text-primary` for body size link text in
light mode until a dedicated `--link` token lands (spec 0005 Follow-up). Amber on
a button (`--primary-foreground` on `--primary`) is unaffected and passes.

Decorative hairlines (`--border` on `--background` or `--card`) are ~1.3:1 and are
**not** required to meet 3:1: they are never the only indicator of a component's
boundary or state (fills, text, and focus rings carry that). They are not in the
asserted table.

---

## Spacing, radius, breakpoints

- **Spacing**: Tailwind's default 0.25rem step scale (`gap-1` = 0.25rem,
  `gap-2` = 0.5rem, ...). Layout helpers (`Stack`, `Cluster`) take a spacing key
  from the set `1 | 2 | 3 | 4 | 6 | 8`.
- **Radius**: base `--radius` is `0.625rem`. shadcn's derived scale is available:
  `--radius-sm` (`* 0.6`), `--radius-md` (`* 0.8`), `--radius-lg` (`= --radius`),
  `--radius-xl` (`* 1.4`), `--radius-2xl` (`* 1.8`), `--radius-3xl` (`* 2.2`),
  `--radius-4xl` (`* 2.6`). Cards and inputs use `rounded-lg`; pills and the
  swipe card use `rounded-xl` or larger.
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
| `Button` | `ui/button.tsx` | shadcn source. Variants `default` (amber), `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes `sm` / `default` / `lg` / `icon`. Focus ring is the shared `--ring` pattern. Do not use `link` for body size text in light mode (see contrast note). |
| `Card` | `ui/card.tsx` | shadcn source. Compose `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`; do not dump everything in `CardContent`. `--card` surface. |
| `Input` | `ui/input.tsx` | shadcn source. `--input` border, `--ring` focus ring. Always pair with a `Label`. |
| `Label` | `ui/label.tsx` | shadcn source. `htmlFor` the input id. |
| `Badge` | `ui/badge.tsx` | shadcn source. Variants `default` / `secondary` / `outline` / `destructive`. Use for genre tags and counts; never a styled `span`. |
| `Skeleton` | `ui/skeleton.tsx` | shadcn source. `--muted` block, pulse. Use for loading placeholders; never a custom `animate-pulse` div. Static under reduce motion (CSS backstop). |
| `Toast` | `ui/sonner.tsx` | `sonner` wrapper from `npx shadcn add sonner`. `<Toaster />` is mounted once at the root layout with `position="top-center"` and `richColors={false}`. Call `toast(...)` from `sonner`. |
| `EmptyState` | `components/empty-state.tsx` | Server component. Centered block for empty or exhausted lists: optional `icon`, required `title`, optional `description` and `action`. |
| `Spinner` | `components/spinner.tsx` | Server component. `role="status"`, sizes `sm` / `md` / `lg` (rem based), optional visually hidden `label`. Renders static dots when reduce motion is on. |
| `PageContainer` | `components/page-container.tsx` | Server component. `max-w-6xl` default; `width="prose"` narrower for reading views, `width="wide"` for marketing. Gutter `px-4 sm:px-6 lg:px-8`. Renders `<main>` by default (`as="div"` to nest). |
| `Stack` | `components/stack.tsx` | Server component. Vertical flex, `gap` from `1 \| 2 \| 3 \| 4 \| 6 \| 8`, optional `align`. No logic. |
| `Cluster` | `components/cluster.tsx` | Server component. Horizontal flex wrap, same `gap` set, optional `align`. No logic. |
| `Poster` | `components/movie/poster.tsx` | Server component. TMDB image at a locked 2:3 ratio through `next/image`; skeleton while loading; labelled fallback tile when `path` is undefined or `next/image` fires `onError`. URL from `posterUrl(path, size)`. |
| `MovieCard` | `components/movie/movie-card.tsx` | Client component. Poster + title + year + optional genre `Badge`s as one focusable element (link when `href`, button when `onSelect`); `:focus-visible` ring; Enter / Space activate. |
| `SwipeCard` | `components/movie/swipe-card.tsx` | Client component. Uncontrolled; caller sets `key={movie.id}` to reset. Drag + four buttons + arrow keys, all resolving through `reactionForDrag` / one shared direction map (right = like, left = dislike, up = seen, down = skip). Fires `onReact` once per card; ignores later input. Directional color hint from the swipe tokens while dragging. After a reaction: focus moves to the card root (`role="group"`, `aria-label`) and an `aria-live="polite"` region names the reaction. Honors `prefers-reduced-motion`. |
| `ThemeToggle` | `components/theme-toggle.tsx` | Client component. Cycles dark -> light -> system; persists via `next-themes`. Sun / moon / monitor icon from `lucide-react`; accessible label. Renders a stable placeholder until mounted so it does not hydration mismatch on the static marketing pages. |
| `ThemeProvider` | `components/theme-provider.tsx` | Client component. Wraps `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`). Mounted in the root layout; `<html>` carries `suppressHydrationWarning`. No hand written no flash script (`next-themes` injects its own). |
