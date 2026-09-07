# 0005. Design system and UI foundation

**Date**: 2026-09-07
**Status**: In Progress
**Updated**: 2026-09-07 — reconciled AC-4, build plan steps 1 and 2, and the dependency list with the current shadcn CLI (`shadcn@4`: preset plus `--base` model, no `--style` / `--base-color` init flags). The pinned token table is unchanged and stays canonical for values.
**Updated**: 2026-09-07 — re-skin to the modern cinematic movie-app direction (dark near-black canvas, warm poster-scrim gradient, frosted-glass panels over poster art, pill buttons and genre chips, larger corner radius). Token *values* change, no component API or behavior changes: `--primary` flips from amber to a neutral high-contrast pill color, amber moves to a new `--rating` token (stars, scores, inline emphasis), `--radius` goes `0.625rem` → `1rem`, Fraunces is dropped for one sans family (Geist Sans, heading hierarchy from weight and tracking), and `docs/design.md` gains glass-panel and poster-scrim recipes. Every acceptance criterion, the parity / contrast / focus-ring gates, and the shadcn `zinc` + `radix-nova` base are unchanged. The old `--primary` light-mode 3.19:1 contrast limit is resolved (`--primary` is now neutral; `--rating` is the amber emphasis color).

## Summary

This sets the visual language and the base set of components every screen of Reel will use, so onboarding, the feed, and search feel like one product. The direction is modern and cinematic, dark first (dark background by default, light theme available): a near black canvas (the `zinc` palette), a neutral high contrast primary action (a white pill on dark, a near black pill on light) so it reads like a streaming app, amber held back for star ratings and inline emphasis (the `--rating` token), one clean sans family (Geist Sans) with heading hierarchy carried by weight and tracking rather than a second face, generous corner radius, and two documented surface recipes: a warm poster scrim gradient and a frosted glass panel that floats over poster art. Movie poster art carries the color; the canvas stays out of its way. It writes a human readable `docs/design.md` as the prose source of truth, defines the exact token values in `src/app/globals.css` (which is canonical for the values), initializes shadcn/ui (a CLI that copies accessible component source into the repo; `shadcn@4` also adds a small `shadcn` runtime package for its shared Tailwind CSS), and builds a thin set of primitives plus three bespoke movie components: `Poster`, `MovieCard`, and the `SwipeCard` (the like / dislike / seen / skip card used in onboarding). Every interactive component is keyboard operable, shows a visible focus ring, respects the operating system "reduce motion" setting, and meets WCAG AA color contrast (the readability standard) in both themes. No database work and no API endpoints: this feature is tokens, components, and a doc.

## Requirements

**User stories**:
- As a person building a Reel screen, I want a documented set of tokens and components so that I compose pages instead of inventing type, color, and spacing each time.
- As a user, I want the product to look like one coherent film app and to work fully with a keyboard so that I can use it however I need to.
- As a user, I want to swipe through movies (or press buttons, or use arrow keys) to teach the app my taste, and I want that to work even with animations turned off.
- As a user, I want to choose a light or dark theme and have it remembered.

**Acceptance criteria** (each is independently checkable):

- **AC-1**: `docs/design.md` exists and documents: the type scale (Geist Sans for everything, the Tailwind size / weight / line height steps, and the rule that headings at `text-3xl` and up carry hierarchy through `font-semibold` and `tracking-tight`, with no separate display family), the full color token set with light and dark values (including `--rating`) plus a WCAG AA contrast table, the spacing / radius / breakpoint scales, the two surface recipes (the warm poster scrim gradient and the frosted glass panel, written as token bound utility recipes, not new tokens), the motion conventions (the named duration and easing tokens, the swipe threshold constants, the `prefers-reduced-motion` rule), and a short usage note for every component in the initial set.
- **AC-2**: `src/app/globals.css` defines every token from `docs/design.md` as a raw custom property under both `:root` (light) and `.dark` (dark), including `--rating`, with `--radius` set to `1rem`, an `@theme inline` block mapping the `--color-*` scale onto them (with `--color-rating`) and a `@custom-variant dark`; the old `@media (prefers-color-scheme)` block is removed. The `:root` and `.dark` blocks declare identical token name sets, and a Vitest test parses `globals.css` and asserts that parity plus that every token named in `docs/design.md` exists in it. The shadcn CLI writes its own scaffold into `globals.css` at init (oklch values, a `--sidebar-*` and `--chart-*` set, a `--radius-*` scale, and `@import` lines for `tailwindcss`, `tw-animate-css`, and `shadcn/tailwind.css`); the build replaces the scaffold token *values* with the pinned table (kept as hex, or the same colors written as oklch, `globals.css` stays canonical either way), keeps whatever `@import` lines the CLI needs, and for each scaffold-only token (`--sidebar-*`, `--chart-*`, the extra `--radius-*` steps) either removes it or keeps it and documents it in `docs/design.md`. The parity test checks `:root` / `.dark` name-set symmetry and that every documented token exists in `globals.css` (documented tokens are a subset of the file, not an exact match).
- **AC-3**: Theme switching works: the app defaults to dark, a `ThemeToggle` control cycles dark, light, and system, the choice persists across reloads, and there is no theme flash on first paint. `ThemeToggle` renders a stable placeholder until mounted so it does not hydration mismatch on the static marketing pages.
- **AC-4**: shadcn/ui is initialized against the current CLI (`shadcn@4`): `components.json` is present with `rsc: true`, `tsx: true`, `iconLibrary: "lucide"`, `tailwind.cssVariables: true`, `tailwind.config: ""` (Tailwind v4 has no config file), `tailwind.baseColor: "zinc"`, `style: "radix-nova"` (the current CLI's combined base-plus-preset style id; the Radix primitive base is the intent, matching Option 1, and is selected with `--base radix`), and the `@/` path aliases (`components`, `utils`, `ui`, `lib`, `hooks`). The CLI also writes `rtl`, `menuColor`, `menuAccent`, and `registries` fields; their values are not load bearing and are left at the CLI defaults. `Button`, `Card`, `Input`, `Label`, `Badge`, and `Skeleton` are generated into `src/components/ui/`, and once `globals.css` carries the pinned token values (AC-2) their computed colors equal the documented token values in both themes: the `Button` `default` variant is the neutral `--primary` pill (not amber), `Badge` and `Button` pills read `rounded-full`, and `--accent` stays the neutral hover fill the shadcn primitives expect (amber lives only in `--rating` and `--ring`).
- **AC-5**: The feedback components `Toast` (generated by `npx shadcn add sonner`, its `<Toaster />` mounted once at root with `position="top-center"` and `richColors={false}`), `EmptyState`, and `Spinner` (`role="status"`, static when reduce motion is on), and the layout helpers `PageContainer` (`max-w-6xl`, responsive gutter, a `width` prop), `Stack`, and `Cluster`, are built and render with the project tokens.
- **AC-6**: `Poster` renders a TMDB image at a locked 2:3 aspect ratio through `next/image` (with `image.tmdb.org` allowed in `next.config`), shows a skeleton while the image loads, and shows a labelled fallback tile both when a movie has no poster path and when `next/image` raises `onError` at runtime.
- **AC-7**: `MovieCard` shows a movie's poster, title, and year, is a single focusable element with a visible `:focus-visible` ring, and is activated by Enter or Space.
- **AC-8**: `SwipeCard` accepts a `like`, `dislike`, `seen`, or `skip` reaction three ways: a pointer or touch drag that flings past the threshold in the mapped direction (right = like, left = dislike, up = seen, down = skip); an on screen button for each of the four; and an arrow key for each (handled on the card root, which `preventDefault`s the four arrows; no window listener). All three paths resolve direction through one pure `reactionForDrag` / shared map, so they cannot disagree. Every control is reachable and operable by keyboard with a visible focus ring, and each reaction calls the `onReact` callback exactly once; a second input on the same card is ignored. After a reaction fires, `SwipeCard` moves focus to its own root (`role="group"` with an `aria-label`) and announces the reaction through an `aria-live="polite"` region; focus across successive cards is the caller's responsibility.
- **AC-9**: `SwipeCard` respects `prefers-reduced-motion` (detected with `useReducedMotion()` from `motion/react`, plus a CSS `@media` backstop): drag is disabled, the card changes with no fling animation, and the button and keyboard paths still work.
- **AC-10**: Every interactive component in the set exposes a visible `:focus-visible` indicator built from the `--ring` token (still a distinct amber, now clearly separate from the neutral `--primary`) with `ring-2 ring-offset-2 ring-offset-background`, and every token pair in `docs/design.md`'s contrast table meets its target (4.5:1 for body text, 3:1 for large text, UI borders, and the focus ring) in both themes, checked by a unit tested `contrastRatio()` helper against the token values. The pairs include `--primary-foreground` on `--primary` (now neutral on neutral) at 4.5:1 and `--rating` on `--background` and on `--card` at 3:1. The former `--primary` light-mode 3.19:1 limit no longer applies.
- **AC-11**: Vitest plus Testing Library tests cover: the pure `reactionForDrag(offset, velocity)` function (each direction, the distance and velocity thresholds, diagonal resolution, sub threshold returns nothing); the `SwipeCard` button and arrow key paths (one `onReact` per reaction, a second input ignored, focus moved to root after a reaction, the reduce motion branch renders with no drag transform); and a render / smoke test for each bespoke and composed component (`Poster`, `MovieCard`, `SwipeCard`, `EmptyState`, `Spinner`, `ThemeToggle`, `PageContainer`, `Stack`, `Cluster`). The pointer drag fling is checked in `/check verify` with Playwright, not in the unit suite. A `matchMedia` stub lives in the Vitest setup file.

## Options considered

### Option 1: Token layer in Tailwind v4 (`:root` / `.dark` values, `@theme inline` mapping) plus shadcn/ui primitives plus a few bespoke movie components

Define the design language as concrete token values in `globals.css`, keep `docs/design.md` as the prose source of truth, initialize shadcn/ui for the primitives, and hand build `Poster`, `MovieCard`, and `SwipeCard`. Use `motion` (the library formerly called Framer Motion), imported through `LazyMotion` with the `domAnimation` feature bundle, for the swipe drag and fling, and `next-themes` for light / dark switching. Visual direction chosen from first principles: cinematic, dark first, poster forward.

**Pros**:
- Builds directly on the CSS and component base that spec 0001 already fixed (Tailwind v4 plus shadcn/ui); nothing is relitigated.
- shadcn primitives are owned source built on Radix, so focus handling, roles, and keyboard behavior come mostly for free and stay editable in the repo.
- `motion` is the proven fit for exactly this drag / fling / reduce motion interaction; hand rolling pointer physics is subtle and error prone. `LazyMotion` keeps the shipped bundle small.
- Suits the Tracer Bullet approach: a thin real thread (init, then tokens, then one primitive, then theme switching) proves the whole styling pipeline before the component set is thickened.

**Cons**:
- Several new dependency lines (`motion`, `next-themes`, `sonner`, and what `shadcn@4 init` pulls in: `radix-ui`, `class-variance-authority`, `cn`, `tw-animate-css`, `lucide-react`, and a `shadcn` runtime package).
- The token set is specified in two files (`globals.css` values, `docs/design.md` prose plus the contrast table); a parity test keeps the names aligned but not the prose.
- `SwipeCard` is real interaction code to own and test; a stock primitive would not carry that cost.

### Option 2: shadcn/ui defaults with minimal customization, no bespoke components yet, CSS only motion, system driven theming

Initialize shadcn/ui, accept its stock neutral theme almost as is, skip `docs/design.md`, use CSS transitions only, let `prefers-color-scheme` drive the theme with no in app control, and leave `Poster` / `MovieCard` / `SwipeCard` for feature 7.

**Pros**:
- Fastest to stand up and the fewest dependencies.
- Least surface to maintain now.

**Cons**:
- Generic look; nothing marks it as a film product.
- The swipe drag becomes hand rolled pointer math later, in a feature that also has to build the deck around it.
- No written design doc, which the scope explicitly asks for.
- Defers the swipe card that this feature exists to seed, so feature 7 inherits an unpinned keyboard and accessibility story.

### Option 3: Adopt a full component library with a built in design system (MUI, Mantine, or Chakra)

Replace shadcn/ui with a batteries included React component library that ships its own theming system.

**Pros**:
- Large accessible component surface out of the box, themable through a documented API.
- Less to build for the long tail of components (dialogs, menus, date pickers).

**Cons**:
- Contradicts spec 0001, which fixed Tailwind v4 plus shadcn/ui as the UI base.
- A heavy runtime dependency with its own styling engine that competes with Tailwind.
- Leaving it later is a real migration, not a refactor.

### Option 4: Hand build every component on Tailwind v4, no shadcn/ui

Write all primitives and bespoke components from scratch on the token layer, with no component library at all.

**Pros**:
- Total control over markup and behavior; zero component dependencies.
- Tokens and components exactly as designed, nothing to override.

**Cons**:
- Re implementing accessible primitives (focus management, dialogs, menus) from scratch is the classic "reinventing the hard parts" trap.
- Slow, and shadcn already gives editable owned source, so the control benefit is mostly already available.
- Only worth it if shadcn genuinely cannot express the design, which it can.

## Decision

**Chosen option**: Option 1: token layer in Tailwind v4 plus shadcn/ui primitives plus a few bespoke movie components.

Initialize shadcn/ui for a thin primitive set, define a concrete `zinc` based semantic token set in `globals.css` (mirrored in prose by `docs/design.md`) with a neutral high contrast `--primary` (a white pill on dark, a near black pill on light), amber confined to `--rating` (stars, scores, inline emphasis) and `--ring` (focus), a `1rem` base radius for the pill and rounded card language, one sans family (Geist Sans, no serif display face), and two token bound surface recipes (a warm poster scrim gradient and a frosted glass panel). Hand build `Poster`, `MovieCard`, and `SwipeCard`, use `motion` through `LazyMotion` for the swipe interaction and `next-themes` for light / dark switching, and commit to a modern cinematic dark first visual direction that reads like a streaming app while letting poster art carry the color.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

No persistent data. This feature adds no entities, no columns, and no migration. The components read movie fields that already exist on the `movies` table (spec 0002 and spec 0003): `poster_path`, `title`, the year derived from `release_date` (spec 0003's `release_year`), `overview`, and genre labels. The `SwipeCard` produces a reaction value in memory and hands it to its caller through `onReact`; persisting a swipe reaction is feature 7's `swipe_reactions` work, not this feature's.

**Design tokens** (canonical values live here and in `globals.css`; `docs/design.md` carries the prose and the contrast table). Names follow the shadcn `zinc` set; values are hex unless noted.

| Token | Light (`:root`) | Dark (`.dark`) | Note |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | page canvas (near black on dark) |
| `--foreground` | `#09090b` | `#fafafa` | body text |
| `--card` / `--card-foreground` | `#fafafa` / `#09090b` | `#161618` / `#fafafa` | raised surface, slightly separated from the canvas |
| `--popover` / `--popover-foreground` | `#ffffff` / `#09090b` | `#1c1c1f` / `#fafafa` | overlays |
| `--primary` | `#18181b` (near black) | `#fafafa` (near white) | primary action pill (`Watch now`, `Subscribe now`); neutral, high contrast |
| `--primary-foreground` | `#fafafa` | `#18181b` | text / icon on `--primary` |
| `--rating` | `#b45309` (amber 700) | `#fbbf24` (amber 400) | star ratings, scores, inline emphasis / "more" links (was `--primary`) |
| `--secondary` / `--secondary-foreground` | `#f4f4f5` / `#18181b` | `#242427` / `#fafafa` | secondary button, inactive genre chip |
| `--muted` / `--muted-foreground` | `#f4f4f5` / `#52525b` | `#242427` / `#a1a1aa` | subdued text and fills |
| `--accent` / `--accent-foreground` | `#f4f4f5` / `#18181b` | `#242427` / `#fafafa` | neutral hover fills (shadcn primitives rely on this; not amber) |
| `--destructive` / `--destructive-foreground` | `#dc2626` / `#fafafa` | `#ef4444` / `#fafafa` | errors, destructive |
| `--border` / `--input` | `#e4e4e7` / `#e4e4e7` | `#2a2a2e` / `#2a2a2e` | hairlines, field borders |
| `--ring` | `#b45309` (amber 700) | `#fcd34d` (amber 300) | focus ring, now clearly distinct from the neutral `--primary` |
| `--like` | `#16a34a` | `#22c55e` | SwipeCard "like" hint |
| `--dislike` | `#dc2626` | `#ef4444` | SwipeCard "dislike" hint |
| `--seen` | `#2563eb` | `#3b82f6` | SwipeCard "seen" hint |
| `--skip` | `#52525b` | `#a1a1aa` | SwipeCard "skip" hint |
| `--radius` | `1rem` | `1rem` | base corner radius (pill / rounded card language) |

Motion tokens (same both themes): `--motion-fast: 150ms`, `--motion-base: 250ms`, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.

`:root` and `.dark` still declare an identical token name set (the parity test enforces it); `--rating` is added to both. `--color-rating` is added to the `@theme inline` map. `--radius` moves to `1rem` in both blocks; the derived `--radius-*` scale in `@theme inline` is unchanged (it is all `calc()` on `--radius`).

**Surface recipes** (documented in `docs/design.md`, built from tokens and Tailwind opacity modifiers, not new tokens):

- **Warm poster scrim**: a `bg-gradient-to-t from-background via-background/80 to-transparent` layer over the lower part of a poster so a title sits on the art. Used by `MovieCard` and the `SwipeCard` face. Optionally a low opacity, heavily blurred copy of the poster behind the canvas for a color bleed; the gradient alone is the baseline.
- **Frosted glass panel**: `bg-card/70 backdrop-blur-xl border border-border/60 rounded-3xl` for panels that float over poster art (the `SwipeCard` action bar, an over-poster info panel). Falls back to a solid `--card` where `backdrop-filter` is unsupported.

**Type scale**: Tailwind's default size / line height scale unchanged. Geist Sans (already wired) is the one family for everything. There is no serif display face: headings at `text-3xl` and larger carry hierarchy through `font-semibold` and `tracking-tight`. `--font-display` stays defined in `@theme inline` as an alias of `var(--font-sans)` so any existing `font-display` utility keeps resolving; Fraunces is removed from `src/app/layout.tsx` and is not added as a font. Geist Mono stays removed.

**State transitions**:

`SwipeCard` interaction state (one card, not the deck):

```
idle ──drag start──▶ dragging ──release past threshold──▶ exiting ──▶ (unmounts; caller advances via key={movie.id})
  ▲                     │
  └──release below threshold (spring back, dragSnapToOrigin)──┘

button press or arrow key ──▶ exiting        (skips dragging)
prefers-reduced-motion ──▶ idle ──▶ exiting  (no dragging state, no animation)
```

`ThemeToggle` cycles `dark → light → system → dark`; `next-themes` persists the selection and resolves `system` from `prefers-color-scheme`.

**Component API surface** (no HTTP endpoints; this is the prop contract and the render mode each component commits to). Shared type `MovieSummary` lives in `src/components/movie/types.ts`: `{ id: string; title: string; year: number | undefined; posterPath: string | undefined; genres?: string[]; overview?: string }`.

| Component | Mode | Key props | Behavior |
|---|---|---|---|
| `Poster` | Server | `path: string \| undefined` (req), `alt: string` (req), `size?: PosterSize` (default `w500`), `sizes?: string`, `priority?: boolean` | `next/image` at locked 2:3; skeleton while loading; labelled fallback tile when `path` is undefined or `onError` fires. URL from `posterUrl(path, size)` |
| `MovieCard` | Client | `movie: MovieSummary` (req), `href?: string`, `onSelect?: () => void` | One focusable element (link when `href`, button when `onSelect`); `:focus-visible` ring; Enter / Space activate. Poster plus title plus year plus optional genre `Badge`s. Client because of the dual link / handler API |
| `SwipeCard` | Client | `movie: MovieSummary` (req; `overview`, `genres` used), `onReact: (r: Reaction) => void` (req) | Uncontrolled; caller must set `key={movie.id}` to reset. Drag (via `LazyMotion` + `domAnimation`) plus four buttons plus arrow keys, all resolving through `reactionForDrag` / one shared direction map; fires `onReact` once per card; directional color hint from the swipe tokens while dragging; focus to root plus `aria-live` announce after a reaction. Honors `prefers-reduced-motion` |
| `ThemeToggle` | Client | none | Cycles dark / light / system; persists via `next-themes`; renders a stable placeholder until mounted. Sun / moon / monitor icon from `lucide-react`; accessible label |
| `ThemeProvider` | Client | `children` | Wraps `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`). Mounted in the root layout; `<html>` gets `suppressHydrationWarning`. No hand written no flash script (next-themes injects its own) |
| `Button` `Card` `Input` `Label` `Badge` `Skeleton` | shadcn defaults | shadcn/ui API | Generated into `src/components/ui/`, restyled by the project tokens |
| `Toast` (`sonner`) | Client wrapper | `sonner` API | `npx shadcn add sonner` generates the `useTheme()` → `<Toaster />` wrapper; mounted once at root, `position="top-center"`, `richColors={false}` |
| `EmptyState` | Server | `icon?: ReactNode`, `title: string` (req), `description?: string`, `action?: ReactNode` | Static block for empty / exhausted lists |
| `Spinner` | Server | `size?: "sm" \| "md" \| "lg"` (rem based), `label?: string` | `role="status"`; static dots when reduce motion is on |
| `PageContainer` | Server | `children`, `as?: "main" \| "div"` (default `main`), `width?: "default" \| "prose" \| "wide"` | `max-w-6xl` default (`prose` narrower for reading views, `wide` for marketing); gutter `px-4 sm:px-6 lg:px-8` |
| `Stack` / `Cluster` | Server | `gap?: 1 \| 2 \| 3 \| 4 \| 6 \| 8` (spacing keys), `align?` | Vertical stack / horizontal wrap helpers; no logic |

`PosterSize = "w185" | "w342" | "w500" | "w780" | "original"`; `POSTER_SIZES` and `posterUrl(path, size)` live in `src/lib/tmdb/images.ts`, building `` `${IMAGE_BASE_URL}${size}${path}` `` from spec 0003's `IMAGE_BASE_URL` (`https://image.tmdb.org/t/p/`). `Reaction = "like" | "dislike" | "seen" | "skip"`; `reactionForDrag(offset, velocity)` lives in `src/components/movie/reaction.ts`.

**Re-skin notes per component** (visual only; every prop contract, render mode, and behavior above is unchanged, and the `docs/design.md` usage-note table is rewritten to match):

| Component | Re-skin |
|---|---|
| `Button` | `default` variant is the neutral `--primary` pill, `rounded-full`; `secondary` / `outline` / `ghost` follow. Amber emphasis text uses `text-rating`, never the `link` variant styled as a CTA. `icon` size stays square with `rounded-full`. |
| `Badge` | Pill (`rounded-full`). `secondary` is an inactive genre chip (muted fill), `default` is the active chip (solid `--primary` on its foreground). Never a styled `span`. |
| `Card` | `rounded-3xl`, `--card` surface, hairline `--border`. The frosted glass panel recipe is the over-poster variant; document it on this row. |
| `Poster` | Poster corners go `rounded-2xl` (was `rounded-lg`); the 2:3 lock, skeleton, and fallback tile are unchanged. The fallback tile matches the new radius. |
| `MovieCard` | Poster `rounded-2xl`; title and year sit on the warm poster scrim recipe at the card foot; genre `Badge`s are pills. One focus stop and Enter / Space activation unchanged. |
| `SwipeCard` | Card face `rounded-3xl` with the poster scrim under the title; the four reaction buttons sit in a frosted glass pill bar (`bg-card/70 backdrop-blur-xl rounded-full`). Drag hint tints still come from `--like` / `--dislike` / `--seen` / `--skip`. All interaction, focus, announce, and reduce-motion behavior unchanged. |
| `Spinner` `EmptyState` `PageContainer` `Stack` `Cluster` `ThemeToggle` | Inherit the larger radius and the neutral primary; no other change. The reference bottom tab bar is **not** in this set (features 6 and 7 build the app shell on these tokens). |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `Poster` renders an image | Poster URL | `posterUrl(path, size)` in `src/lib/tmdb/images.ts`, from `movies.poster_path` (spec 0003) and `IMAGE_BASE_URL` |
| `Poster` picks image vs fallback | "show fallback" | `path` is undefined / empty (null `movies.poster_path`), or `next/image` `onError` |
| `MovieCard` / `SwipeCard` meta | Title, year, overview, genres | `movies` columns (spec 0002, spec 0003); passed in as `MovieSummary` by the caller, not queried here |
| `SwipeCard` drag | Reaction from a drag | `reactionForDrag(offset, velocity)` using `SWIPE_DISTANCE_THRESHOLD = 120` px and `SWIPE_VELOCITY_THRESHOLD = 500` px/s (this spec), dominant axis wins, sign picks direction |
| `SwipeCard` buttons / keys | Reaction from a button or key | The one direction map: right / ArrowRight = like, left / ArrowLeft = dislike, up / ArrowUp = seen, down / ArrowDown = skip |
| `SwipeCard` drag hint color | Directional tint | `--like` / `--dislike` / `--seen` / `--skip` tokens |
| `ThemeToggle` | Active theme, persisted choice | `next-themes` (`localStorage`); `system` resolved from `prefers-color-scheme` |
| Any component | Focus ring appearance | `--ring` token with `ring-2 ring-offset-2 ring-offset-background` |
| Any component | Motion on or off | `useReducedMotion()` from `motion/react`, plus the CSS `@media (prefers-reduced-motion: reduce)` backstop |
| Contrast audit | Pass / fail per token pair | `contrastRatio()` helper (unit tested) against the token hex values |

**Key invariants**:
- `:root` and `.dark` in `globals.css` declare identical token name sets; the Vitest parity test enforces it, and that every token named in `docs/design.md` exists.
- `globals.css` is canonical for token values; `docs/design.md` is canonical for the prose and the contrast table.
- `reactionForDrag` and the one direction map are the single source of direction resolution for drag, buttons, and keys; they cannot disagree.
- `SwipeCard` calls `onReact` exactly once per mounted card, whatever the input path; later input on the same card is ignored.
- Every interactive element is reachable by Tab and shows a `:focus-visible` ring built from `--ring`.
- No component sets a raw hex color or a raw pixel font size in JSX; colors and type come from tokens or token bound utilities.
- Amber appears only through `--rating` (emphasis, stars, scores) and `--ring` (focus); `--primary` is neutral and `--accent` is a neutral hover fill. The glass and scrim treatments are token bound utility recipes, not hardcoded colors.
- There is one font family (`--font-sans`, Geist Sans). `--font-display` resolves to it; no second face is loaded.
- `motion` is imported only inside `SwipeCard`, only through `LazyMotion` with `domAnimation`, never at the layout level.
- `ThemeProvider` and the `sonner` `<Toaster />` are client components mounted in the root layout in a way that does not force the `(marketing)` route group dynamic (spec 0001 constraint); `ThemeToggle` renders a stable pre mount placeholder.

**Security model**:

Not applicable. Every component here is presentational. `SwipeCard.onReact` is a callback the caller wires to its own authorized Server Action (feature 7); this feature neither reads nor writes user data and adds no auth surface.

**Configuration required**:

No new environment variables. Non env changes:
- `next.config.ts` gains `images.remotePatterns` with `{ protocol: "https", hostname: "image.tmdb.org" }`.
- New dependencies added directly: `motion`, `next-themes`, `sonner`.
- Dependencies pulled in by `shadcn@4 init`: `radix-ui` (the single umbrella package, not per-primitive `@radix-ui/react-*`), `class-variance-authority`, `cn` (the CLI's class-merge helper; `src/lib/utils.ts` re-exports `cn` from it), `tw-animate-css`, `lucide-react`, and a `shadcn` runtime package (`globals.css` gains `@import "shadcn/tailwind.css"` and `@import "tw-animate-css"`). Exact versions follow whatever the CLI resolves at init time.
- The Vitest setup file gains a `window.matchMedia` stub (jsdom has none), needed by `useReducedMotion()` and the `ThemeToggle` tests.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: `reactionForDrag({x: 140, y: 10}, {x: 200, y: 0})` returns `"like"`; the left arrow key calls `onReact("dislike")` once; the "seen" button calls `onReact("seen")` once. Verifies **AC-8**.
- Threshold: `reactionForDrag({x: 90, y: 0}, {x: 100, y: 0})` returns nothing (below both thresholds); `{x: 30, y: 0}` with `{x: 900, y: 0}` returns `"like"` (velocity path). Verifies **AC-8**.
- Reduce motion: with `prefers-reduced-motion: reduce`, `SwipeCard` renders with no drag transform, and the button and key paths still call `onReact`. Verifies **AC-9**.
- Single fire and focus: after the first reaction, a second key press does not call `onReact` again, and focus has moved to the card root. Verifies **AC-8**.
- Theme: toggling to light writes the choice; a reload restores light with no flash of dark; the toggle shows its placeholder before mount. Verifies **AC-3**.
- Poster fallback: `Poster` with `path={undefined}` and `Poster` whose image fires `onError` both render the labelled fallback tile, not a broken image. Verifies **AC-6**.
- Token parity: the Vitest test fails if a token is added to `:root` but not `.dark`, or named in `docs/design.md` but absent from `globals.css`. Verifies **AC-2**.
- Contrast: `contrastRatio()` for each documented pair (`--foreground`/`--background`, `--primary-foreground`/`--primary`, `--muted-foreground`/`--background`, `--rating`/`--background` and `/--card`, `--ring`/both backgrounds) meets its target in both themes. Verifies **AC-10**.
- Focus: `MovieCard` and each `SwipeCard` control show one visible `:focus-visible` ring when tabbed to. Verifies **AC-7**, **AC-10**.

## Build plan

**Re-skin pass (2026-09-07 revision, do this first since steps 1 to 11 already shipped).** The build is already on disk; this pass re-skins it to the direction above without touching any component API or behavior:

- **R1. Tokens.** In `src/app/globals.css`: flip `--primary` / `--primary-foreground` to the neutral values, add `--rating` to `:root` and `.dark` and `--color-rating` to `@theme inline`, set `--radius` to `1rem` in both blocks, and apply the darkened / adjusted `--background`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--border`, `--input` values from the token table. Keep the name sets identical. Point `--font-display` at `var(--font-sans)`.
- **R2. Fonts.** Remove the Fraunces import and its `variable` wiring from `src/app/layout.tsx`. Confirm nothing else imports it.
- **R3. `docs/design.md`.** Rewrite the Character, Type scale, Color tokens, and Component usage sections to match: one sans family with the weight / tracking heading rule, the `--rating` row, the two surface recipes (warm poster scrim, frosted glass panel), and the per-component re-skin notes. Recompute the WCAG AA contrast table from the new hex (drop the old `--primary` 3.19:1 known limit; add `--rating` on `--background` and on `--card`, and `--primary-foreground` on `--primary`).
- **R4. Component class bindings.** Update only Tailwind class strings: `Button` and `Badge` to `rounded-full` with the neutral `default` variant, `Card` / `Poster` / `MovieCard` / `SwipeCard` to the larger radius, the `MovieCard` and `SwipeCard` scrim, and the `SwipeCard` glass action bar. No prop, no handler, no state change.
- **R5. Gates.** Re-run the token parity test, the `contrastRatio()` test (update the `PAIRS` list for `--rating`, drop the retired pair), and the focus-ring guard test. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green; the `(marketing)` route group still renders static.

Steps 1 to 11 below are the original first-build order (Tracer Bullet) and stay as the record of how the feature was stood up. On the re-skin they are already done; the pass above is the delta.

Ordered for Tracer Bullet: stand up one thin real thread through the whole styling pipeline first (init, then tokens, then one primitive rendering from those tokens, then theme switching), then thicken the component set one segment at a time.

1. **Initialize shadcn/ui and prove one primitive (the thin thread).** Run `pnpm dlx shadcn@latest init --base radix --yes` (the CLI auto-detects Next.js, Tailwind v4, RSC, tsx, and the `@/` alias; there is no `--style` or `--base-color` flag any more). The default base color is `neutral`, so switch it to `zinc` right after with `pnpm dlx shadcn@latest migrate base-color --from neutral --to zinc --yes` (or select `zinc` in the `Custom` preset flow if running init interactively). Confirm `components.json` matches AC-4 (`style` will read `radix-nova`). Generate `Button` with `pnpm dlx shadcn@latest add button --yes`. Confirm it renders. Note: init rewrites `globals.css` with an oklch scaffold and adds `@import` lines for `tailwindcss`, `tw-animate-css`, and `shadcn/tailwind.css`, and it creates `src/lib/utils.ts` (re-exporting `cn`); step 2 replaces the scaffold token values, keeping the `@import` lines the CLI needs. Satisfies **AC-4** (partial).
2. **Token layer and fonts.** Rewrite the token values in `globals.css`: `:root` and `.dark` with the values from the token table (hex, or the same colors as oklch), an `@theme inline` block mapping `--color-*` onto them plus `--font-display`, and the motion tokens; keep the CLI's `@custom-variant dark` (written as `(&:is(.dark *))`) and its `@import` lines; ensure no `@media (prefers-color-scheme)` block remains. For each shadcn scaffold-only token (`--sidebar-*`, `--chart-*`, the extra `--radius-*` steps) either delete it or keep and document it. Wire fonts with `next/font`: keep Geist Sans, add Fraunces as `--font-display`, remove Geist Mono. Reconcile shadcn's generated token names with the table. Write `docs/design.md` (tokens, type scale, spacing / radius / breakpoints, motion, per component usage, the contrast table). Add the Vitest token parity test. Satisfies **AC-1**, **AC-2**.
3. **Theme switching thread.** Add `ThemeProvider` (`next-themes`, `attribute="class"`, `defaultTheme="dark"`, `enableSystem`) to the root layout with `suppressHydrationWarning` on `<html>` and no hand written no flash script. Build `ThemeToggle` with a stable pre mount placeholder. Verify persistence across reload, no flash on first paint, and that the `(marketing)` group stays static. Satisfies **AC-3**.
4. **The rest of the primitives.** Generate `Card`, `Input`, `Label`, `Badge`, `Skeleton`; adjust token bindings; add a usage note per component to `docs/design.md`. Satisfies **AC-4**, **AC-1**.
5. **Feedback and layout components.** `npx shadcn add sonner`, mount `<Toaster position="top-center" richColors={false} />` at root; build `EmptyState`, `Spinner` (`role="status"`, rem sizes, static under reduce motion), `PageContainer` (`max-w-6xl`, `px-4 sm:px-6 lg:px-8`, `width` prop), `Stack`, `Cluster` (gap on spacing keys); usage notes to `docs/design.md`. Satisfies **AC-5**, **AC-1**.
6. **Poster and the image helper.** Add `posterUrl(path, size)` and `POSTER_SIZES` to `src/lib/tmdb/images.ts`, the `image.tmdb.org` `remotePatterns` entry in `next.config.ts`, and the `Poster` component with the locked 2:3 ratio, loading skeleton, and labelled fallback tile on both undefined path and `onError`. Satisfies **AC-6**.
7. **MovieCard.** Add the shared `MovieSummary` type in `src/components/movie/types.ts`; compose `Poster` plus title plus year plus optional genre `Badge`s as one focusable link or button with a `:focus-visible` ring and Enter / Space activation. Satisfies **AC-7**.
8. **SwipeCard: accessible paths first.** Add `src/components/movie/reaction.ts` with the pure `reactionForDrag` and the shared direction map. Build the card layout, the four on screen buttons, the arrow key handler on the card root (`preventDefault` the four arrows, no window listener), the uncontrolled `hasReacted` guard, the `key={movie.id}` reset contract, and the focus to root plus `aria-live` announce after a reaction. No drag yet. Satisfies **AC-8** (buttons and keys).
9. **SwipeCard: drag and motion.** Add `motion` drag through `LazyMotion` + `domAnimation` with `dragElastic={0.2}` and `dragSnapToOrigin`, the directional color hint from the swipe tokens, and the fling calling the same `reactionForDrag`, all gated behind `useReducedMotion()` with a CSS `@media` backstop and an instant fallback. Satisfies **AC-8** (drag), **AC-9**.
10. **Contrast and focus audit pass.** Add the unit tested `contrastRatio()` helper; assert every documented token pair meets its target in both themes and fill the contrast table in `docs/design.md`. Confirm every interactive component's ring is `--ring` with `ring-2 ring-offset-2 ring-offset-background`. Satisfies **AC-10**, **AC-1**.
11. **Component tests.** Vitest plus Testing Library per **AC-11**: `reactionForDrag` (directions, thresholds, diagonal, sub threshold), `SwipeCard` button and key paths (single fire, ignore second input, focus to root, reduce motion branch), and render / smoke tests for the bespoke and composed components. Add the `matchMedia` stub to the Vitest setup file. Satisfies **AC-11**.

## Consequences

**Positive**:
- Every later UI slice (onboarding, feed, search, watchlist, marketing) builds on one token set and one component vocabulary, with `docs/design.md` as the shared reference and a parity test guarding the token names.
- shadcn primitives are owned source on Radix, so accessibility comes mostly for free and stays editable in the repo.
- The swipe interaction, its keyboard mapping, its focus behavior, and its threshold constants are decided once, here, so feature 7 builds the deck on a settled card.
- The dark first cinematic direction gives the product a distinct identity and lets poster art carry the color.
- The Tracer Bullet thread (init, then tokens, then one primitive, then theme switching) proves the whole styling pipeline before the component set grows.

**Negative / tradeoffs**:
- New dependency lines: `motion`, `next-themes`, `sonner` added directly, plus what `shadcn@4 init` brings (`radix-ui`, `class-variance-authority`, `cn`, `tw-animate-css`, `lucide-react`, and a `shadcn` runtime package imported from `globals.css`). `LazyMotion` + `domAnimation` keeps `motion` small but it still lands on the onboarding route every user hits first.
- The token set is specified in two files; the parity test aligns the names but the prose and contrast table in `docs/design.md` can still lag the values in `globals.css`.
- `SwipeCard` is real interaction code (drag physics, the direction function, the reduce motion branch, focus management) that must be tested and maintained; a stock primitive would not carry that cost.
- `MovieCard`'s dual `href` / `onSelect` API forces it to be a client component; a screen that only needs a link still pays that.
- `src/components/` and `src/components/movie/` are a deliberate exception to the folder by feature rule (which reserves `src/features/<domain>/`): shared UI that every feature imports does not belong to one feature. This needs recording in `AGENTS.md` or it reads as a violation.
- No global navigation or app shell is built here, so features 6 and 7 still design the signed in chrome (including the bottom tab bar in the references), with a little rework risk if the shell wants token or layout helper changes.
- The 2026-09-07 re-skin lands after the first build, so `globals.css`, `docs/design.md`, and the component class strings are rewritten once more and the contrast table is recomputed. The parity, contrast, and focus-ring tests catch a missed token or pair. `/check verify` should re-run against the new look.
- `--primary` is neutral, so a "primary" call to action no longer signals with color alone; it relies on the pill shape, size, and contrast. That matches the references but is a change from the earlier amber button.

**Neutral**:
- New conventions to learn: shadcn's `components.json` plus `npx shadcn add`, the `:root` / `.dark` plus `@theme inline` token pattern in Tailwind v4, `next-themes`' class attribute, and `motion`'s `LazyMotion` / `drag` / `useReducedMotion` APIs.
- `next.config.ts` gains an `images.remotePatterns` entry for `image.tmdb.org`.
- Geist Mono is removed (currently wired, currently unused). Fraunces is removed too (the re-skin dropped the serif); one sans family means less font payload and no display-face layout shift.
- `--ring` stays a distinct amber shade (700 in light, 300 in dark); with `--primary` now neutral, a focused primary button is unambiguous.
- The deferred Accessibility AA program still owns the app wide audit, screen reader QA, and skip links; this feature seeds only keyboard, focus, reduce motion, and AA contrast tokens.

## Follow-up

- [ ] Feature 7 (swipe onboarding and personalized feed) owns the deck around `SwipeCard` (the card queue, the "enough to start" threshold, empty and exhausted states, and focus across successive cards) and wires `onReact` to an authorized Server Action.
- [ ] Features 6 and 7 design the authenticated app shell (header, navigation, sign in and out controls) on top of these tokens and layout helpers.
- [ ] `AGENTS.md` `## Rules` should record the `src/components/` (shared cross feature UI) and `src/components/movie/` exception to folder by feature, and the UI conventions (token values in `globals.css`, prose source of truth `docs/design.md`, `motion` only through `LazyMotion` in `SwipeCard`, `next-themes` with the class attribute). `/sync` owns the edit.
- [ ] Deferred Accessibility AA program (app wide WCAG AA audit, screen reader QA, skip links) stays out of scope here; this feature seeds the keyboard and contrast baseline it will build on.
- [ ] Consider a live `/styleguide` route later as a visual reference for tokens and components; not needed to build anything, so deferred.
- [x] Resolved by the 2026-09-07 re-skin: `--primary` is now neutral (high contrast in both themes) and `--rating` (amber) is the dedicated inline emphasis / link color, so no separate `--link` token is needed. `--rating` on `--background` is checked at 3:1 (large text / UI); do not use it for body-size link text in light mode without confirming 4.5:1 first.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
