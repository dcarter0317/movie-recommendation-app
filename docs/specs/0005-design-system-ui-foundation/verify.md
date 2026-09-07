# Verify: design system and UI foundation · spec 0005 · created 2026-09-07

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `pnpm typecheck` → passes → all ACs
- [ ] `pnpm lint` → passes → all ACs
- [ ] `pnpm build` → passes; the `(marketing)` route group is still statically rendered (build output does not mark it dynamic) → AC-3 invariant
- [ ] `pnpm test` → the spec 0005 tests pass, including the token parity test and the `contrastRatio()` and `reactionForDrag` unit tests → AC-2, AC-10, AC-11

## Acceptance criteria

- [ ] **AC-1** — `docs/design.md` exists with sections for: type scale (Geist Sans body, Fraunces at `text-3xl`+, the Tailwind steps), color tokens with light and dark values plus a WCAG AA contrast table, spacing / radius / breakpoint scales, motion conventions (`--motion-fast` / `--motion-base` / `--ease-out`, `SWIPE_DISTANCE_THRESHOLD` / `SWIPE_VELOCITY_THRESHOLD`, the `prefers-reduced-motion` rule), and one usage note per component in the initial set (`Button`, `Card`, `Input`, `Label`, `Badge`, `Skeleton`, `Toast`, `EmptyState`, `Spinner`, `PageContainer`, `Stack`, `Cluster`, `Poster`, `MovieCard`, `SwipeCard`, `ThemeToggle`).
- [ ] **AC-2** — `globals.css` has a `:root` block and a `.dark` block with the raw token values from the spec's token table, an `@theme inline` block mapping `--color-*` onto them plus `--font-display`, and a `@custom-variant dark`; the old `@media (prefers-color-scheme)` block is gone. The Vitest parity test passes and fails when a token is added to one block but not the other, or is named in `docs/design.md` but missing from `globals.css`. Spot check three values against `docs/design.md`.
- [ ] **AC-3** — Load the app: default theme is dark. `ThemeToggle` cycles dark → light → system. Set light, reload → still light, no flash of dark on first paint (throttle CPU / network and watch first paint). `localStorage` holds the `next-themes` key. Before hydration the toggle shows its placeholder, not a mismatched icon.
- [ ] **AC-4** — `components.json` has `style: "new-york"`, `rsc: true`, `tsx: true`, `iconLibrary: "lucide"`, Tailwind v4 CSS variables, `zinc`, and the `@/` aliases. `src/components/ui/` contains `button`, `card`, `input`, `label`, `badge`, `skeleton`. Render each in light and dark → the computed color values equal the documented token values (compare final colors, not `var()` references).
- [ ] **AC-5** — `Toast` fires from a `sonner` call; `<Toaster />` (from `npx shadcn add sonner`) is mounted once at root with `position="top-center"` and `richColors={false}`. `EmptyState`, `Spinner` (`role="status"`, static under reduce motion), `PageContainer` (`max-w-6xl`, gutter, `width` prop), `Stack`, `Cluster` each render and pick up token colors and the spacing scale.
- [ ] **AC-6** — `Poster` with a real `poster_path` renders a `next/image` at 2:3, skeleton before load, image after. `next.config.ts` has the `image.tmdb.org` `remotePatterns` entry. `Poster` with `path={undefined}` renders the labelled fallback tile; a `Poster` whose image fires `onError` renders the same fallback tile (no broken image, no console error).
- [ ] **AC-7** — `MovieCard` shows poster + title + year. Tab to it → one visible `:focus-visible` ring on one element (not nested tab stops). Enter and Space both activate it (navigate when `href`, call `onSelect` when provided).
- [ ] **AC-8** — `SwipeCard`: pointer drag right past the threshold flings and calls `onReact("like")`; left → `dislike`; up → `seen`; down → `skip`. Each of the four on screen buttons calls the matching reaction. ArrowRight / ArrowLeft / ArrowUp / ArrowDown, handled on the card root and `preventDefault`ed, call the matching reaction; there is no window listener. Tab reaches every button with a visible ring. Each reaction calls `onReact` exactly once; a second input on the same card is ignored. After a reaction, focus is on the card root (`role="group"`, `aria-label`) and an `aria-live="polite"` region names the reaction.
- [ ] **AC-9** — With OS "reduce motion" on (or `prefers-reduced-motion: reduce` emulated): `SwipeCard` renders with no drag transform / no fling animation (`useReducedMotion()` path), the card changes instantly, and buttons + arrow keys still call `onReact`.
- [ ] **AC-10** — Tab through `Button`, `Input`, `MovieCard`, and each `SwipeCard` control → each shows a `:focus-visible` ring built from `--ring` with `ring-2 ring-offset-2 ring-offset-background`. The `contrastRatio()` unit test passes for every documented pair (`--foreground`/`--background`, `--primary-foreground`/`--primary`, `--muted-foreground`/`--background`, `--ring`/both backgrounds) at its target (4.5:1 body, 3:1 large / UI / ring) in both themes.
- [ ] **AC-11** — `pnpm test` runs: `reactionForDrag` (each direction, distance threshold `120`, velocity threshold `500`, diagonal resolution, sub threshold returns nothing); `SwipeCard` button and key paths (one `onReact` per reaction, second input ignored, focus moved to root, reduce motion branch renders with no drag transform); render / smoke tests for `Poster`, `MovieCard`, `SwipeCard`, `EmptyState`, `Spinner`, `ThemeToggle`, `PageContainer`, `Stack`, `Cluster`. The `matchMedia` stub is in the Vitest setup file. The pointer drag fling is a Playwright check here, not a unit test.

## Value sourcing coverage

- [ ] `posterUrl(path, size)` in `src/lib/tmdb/images.ts` builds `` `${IMAGE_BASE_URL}${size}${path}` `` (spec 0003's `IMAGE_BASE_URL`); `Poster` uses it; no other poster URL is hand assembled.
- [ ] `reactionForDrag` and one direction map (right = like, left = dislike, up = seen, down = skip) are the only source of direction resolution; the button handler and the key handler both call into it, not three separate literals.
- [ ] `SWIPE_DISTANCE_THRESHOLD` and `SWIPE_VELOCITY_THRESHOLD` are named constants, not inline numbers.
- [ ] `--ring` with `ring-2 ring-offset-2 ring-offset-background` is the only focus ring treatment across every component (grep for ad hoc ring colors).
- [ ] `motion` is imported only inside `SwipeCard`, only via `LazyMotion` + `domAnimation` (grep imports); not by any layout or provider.
- [ ] No component contains a raw hex color or a raw `px` font size in JSX (grep).
- [ ] `globals.css` `:root` and `.dark` token name sets are identical (the parity test); `docs/design.md` names no token that `globals.css` lacks.

## Acceptance-criteria coverage

- AC-1 … `docs/design.md` completeness · AC-2 … Tailwind v4 token mechanism + parity test · AC-3 … default dark, cycle, persist, no flash, pre mount placeholder · AC-4 … `components.json` fields + six primitives on project token values · AC-5 … feedback + layout components + sonner wiring · AC-6 … `Poster` 2:3, skeleton, fallback on undefined and `onError`, `next.config` · AC-7 … `MovieCard` single focus stop, keyboard activate · AC-8 … `SwipeCard` three input paths through one resolver, single fire, focus + announce · AC-9 … `SwipeCard` reduce motion branch · AC-10 … focus ring from `--ring`, `contrastRatio()` gate · AC-11 … Vitest coverage incl. `reactionForDrag`, drag fling to Playwright
