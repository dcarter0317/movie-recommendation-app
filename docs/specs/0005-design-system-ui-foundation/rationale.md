# 0005. Design system and UI foundation: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

Reel has a fixed CSS and component base from spec 0001: Tailwind CSS v4 and shadcn/ui (which copies accessible Radix based component source into the repo instead of adding a runtime dependency). Spec 0001 deliberately deferred the design tokens, the theme, and the component usage conventions to this feature. Today the app has only a scaffold: `globals.css` holds two placeholder tokens (`--background`, `--foreground`) and an Arial font stack, `src/components/ui/` is an empty directory with a `.gitkeep`, shadcn/ui is not initialized (no `components.json`), and the two real pages (the marketing landing and the feed placeholder) style themselves ad hoc with raw zinc utilities and hand written button classes.

The forces at play:

- **Several slices are blocked on this.** Accounts, swipe onboarding, the feed, Letterboxd import, vibe search, and the marketing site all need a shared visual language and a component vocabulary. Without it, each slice invents its own type, color, spacing, and card treatment, and the product fragments.
- **The build approach is Tracer Bullet.** The project proves one thin real thread through every layer first, then thickens. A design system feature that tries to ship an exhaustive component library up front fights that approach; the right shape is a thin thread (tokens, then one component, then theme switching) plus only the components slice 1 actually needs.
- **The swipe card is load bearing and is named in this feature's scope.** Onboarding is built on a like / dislike / seen / skip card with a real drag interaction that must also be fully keyboard operable. If this feature does not pin the card's interaction model, keyboard mapping, and reduce motion behavior, feature 7 has to design all of that while also building the deck, the threshold logic, and the persistence.
- **It is a film product.** Movie poster art is the richest visual content the app has. A bright, busy canvas fights the posters; a restrained dark canvas lets them carry the color. The product should read as a film app, not a generic dashboard.
- **Accessibility is scoped narrowly here on purpose.** The scope keeps a full WCAG AA program in the deferred list and asks this feature only to seed keyboard support and focus handling. The risk of not drawing that line is this feature ballooning into an audit.
- **Two token homes.** The scope's "done when" asks for a human readable `design.md`, and Tailwind v4 wants tokens in `globals.css`. Both are needed, which means the token set is described in two places and can drift.

The consequence of not deciding: slice 1 starts and the first person to build onboarding picks a font, a palette, a card interaction, and a set of ad hoc components, and every later slice either copies those choices or diverges from them.

## Options considered

See [index.md](index.md) `## Options considered` for the four options with pros and cons (they are part of the build spec's decision section). In brief:

- **Option 1 (chosen)**: token layer in Tailwind v4 `@theme` plus shadcn/ui primitives plus bespoke `Poster` / `MovieCard` / `SwipeCard`, `motion` for the swipe, `next-themes` for theming, cinematic dark first direction.
- **Option 2**: shadcn defaults, minimal customization, no bespoke components, CSS only motion, system theming only.
- **Option 3**: adopt a full component library with a built in design system (MUI / Mantine / Chakra).
- **Option 4**: hand build everything on Tailwind v4 with no component library.

## Rationale

**Option 1 over Option 2** because Option 2 defers the two things slice 1 most needs a firm answer on: the swipe card interaction and a written design reference. Hand rolling the drag and fling physics inside feature 7, next to the deck and threshold work, is where subtle bugs (missed pointer capture, no reduce motion branch, double fire on release) tend to live. Pulling `motion` and building `SwipeCard` here, with tests, isolates that risk. Option 2's dependency saving is real but small next to that.

**Option 1 over Option 3** because spec 0001 already fixed Tailwind v4 plus shadcn/ui as the base, and Option 3 throws that away for a heavy runtime library with its own styling engine that competes with Tailwind. These libraries are good, but adopting one here would be a silent reversal of a foundation decision, and leaving it later would be a migration.

**Option 1 over Option 4** because Option 4 is the "reinvent the hard parts" trap: accessible focus management, dialogs, and menus are exactly what shadcn's owned source already solves, and it stays editable, so the control argument for building from scratch is mostly already satisfied.

**Dark first, cinematic, poster forward** because the posters are the content and a restrained cool near black canvas (`zinc`) lets them carry the color, and because the product should feel like a film product. A warm amber accent reads as marquee lights and film awards, sits well against cool neutrals, keeps high contrast on dark, and is distinct from Letterboxd's green and Trakt's red. Geist Sans stays for interface text (already wired, clean, readable); Fraunces is added for large display headings because a high contrast serif evokes film titles and editorial film writing and gives the product personality that heavier sans weights alone would not.

**`next-themes` and `motion` are added rather than hand built** because `next-themes` correctly handles the parts people get wrong (the no flash script, `system` resolution, persistence) in about ten lines of setup, and `motion` is the de facto answer for drag / fling / layout animation with a built in reduce motion story. The registry search for Agent Skills covering either turned up only low quality community skills, so none were installed; the libraries are well documented enough to use directly.

**Accessibility is deliberately scoped to keyboard, focus, reduce motion, and AA contrast tokens**, matching the scope's split: this feature seeds the baseline, the deferred Accessibility AA program owns the app wide audit, screen reader QA, and skip links. Committing to the full program here would balloon the feature.

**On engineer preferences**: the engineer's choices in the design conversation (dark first cinematic direction, `zinc` neutrals, amber accent, keep Geist plus add a serif display face, drag plus buttons plus keyboard for the swipe card, `motion`, `next/image` for posters, `docs/design.md` as source of truth, keyboard plus focus plus reduce motion plus AA contrast baseline) all align with the recommendations above. No conflict to flag.

**Cross check hardening (Opus, 2026-09-07)**. An independent read flagged that the first draft was a design brief, not a build spec: no concrete token values, type steps, or thresholds, and `AC-2` was written against a Tailwind v3 style `@theme` block. The accepted revision pins the exact token hex values, the type scale rule (Fraunces at `text-3xl` and up), the swipe threshold constants (`120` px, `500` px/s), the TMDB poster sizes, and the shadcn `components.json` fields directly in `index.md`; corrects the token mechanism to Tailwind v4's `:root` / `.dark` values plus an `@theme inline` map and a `@custom-variant dark`; makes `--ring` a distinct amber shade from `--primary`; moves `shadcn init` ahead of the token write in the build plan (init rewrites `globals.css`); adds SSR safe reduce motion (`useReducedMotion()` plus a `matchMedia` stub in the Vitest setup), focus management after a `SwipeCard` reaction, a runtime image `onError` fallback, and the `src/components/` file placement with an `AGENTS.md` follow up. The two token homes risk is now mitigated by a real gate: `globals.css` is canonical for values, `docs/design.md` for prose and the contrast table, and a Vitest test asserts the `:root` / `.dark` name sets match and every token named in `docs/design.md` exists. The `SwipeCard` pointer drag is unit tested only through the pure `reactionForDrag` function; the real fling is covered by `/check verify` with Playwright, since `motion` drag does not run under jsdom.

**shadcn CLI reconciliation (2026-09-07)**. `/develop` hit the first build step and found the spec was written against an older shadcn CLI. The current CLI (`shadcn@4`, verified by running it) has replaced the `--style` (`new-york` / `default`) and `--base-color` (`zinc` / `slate` / ...) init flags with a preset plus `--base` model: `init` picks a preset (`Nova`, `Vega`, ...) or `Custom`, and `--base` chooses the primitive library (`radix`, `base`, `aria`). `components.json` now carries a combined `style` id (`radix-nova` for `--base radix` plus the default preset), keeps `iconLibrary`, `rsc`, `tsx`, `tailwind.cssVariables`, and the `@/` aliases, and adds `rtl`, `menuColor`, `menuAccent`, and `registries`. The `zinc` base color is still supported but is now applied with `shadcn migrate base-color` or the `Custom` preset, not an init flag. Init also writes an oklch token scaffold into `globals.css` plus `@import "shadcn/tailwind.css"` and `@import "tw-animate-css"`, and pulls `radix-ui` (umbrella package), `class-variance-authority`, `cn`, `tw-animate-css`, and `lucide-react`. The reconciliation kept the design unchanged: the pinned token table stays canonical for values (the build converts the oklch scaffold to it), `zinc` neutrals and Lucide icons and the Radix base all still hold, and only AC-4's `components.json` wording, build plan steps 1 and 2, and the dependency lists moved to match the real CLI. The Radix primitive base named in Option 1 maps to `--base radix`.

## Agent Skills and MCP discovery

The stack walk settled two new libraries not already installed: `motion` (Framer Motion) and `next-themes`. With the engineer's consent, the skills registry was searched for both.

- **`motion`**: several community skills exist (`c-jeril/framer-motion-skills` and variants, `patricio0312rev/skills@framer-motion-animator`, `mindrally/skills@framer-motion`, `freshtechbro/claudedesignskills@motion-framer`). None first party; quality unknown.
- **`next-themes`**: only niche low install skills (`pharbuz/ai-agent-skills@next-themes`, `bkjain655/agent-skills@next-themes-dark-mode`), roughly two installs each.
- **MCP servers**: none relevant.

Engineer decision: **skip both**, recorded as declined so a later stage does not re offer them. The `shadcn` skill and its MCP server are already installed and connected and are used for this feature.
