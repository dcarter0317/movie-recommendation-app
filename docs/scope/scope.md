# Scope: Reel (movie recommendation app)

A web app where film fans sign in, teach it their taste by importing their Letterboxd ratings or swiping through movies, and then get a personalized feed that explains every pick, plus a natural language "vibe" search. Ships alongside a public marketing site.

**Build approach:** Tracer Bullet (prove one thin real thread through every layer first, then thicken one segment at a time).
**Workflow:** Alpha (after `/develop`, run `/check verify` to confirm the feature works on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Movie catalog & ingestion | Foundation | in-progress |
| 5 | Design system & UI foundation | Foundation | in-progress |
| 6 | Accounts & sign in | Slice 1 | planned |
| 7 | Swipe onboarding & personalized feed | Slice 1 | planned |
| 8 | Letterboxd CSV import | Slice 2 | planned |
| 9 | Feed refinement & feedback | Slice 3 | planned |
| 10 | Generated reasons | Slice 3 | planned |
| 11 | Vibe search | Slice 4 | planned |
| 12 | Watchlist | Slice 5 | planned |
| 13 | Marketing site & SEO | Slice 6 | planned |

## Foundations

### 1. Stack & architecture · done
Decide the stack (framework, language, persistence, hosting shape) and scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec and the empty scaffold boots locally and passes build.
spec [0001](../specs/0001-stack-and-architecture/index.md) · code in `src/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify`

### 2. Coding standards & tooling · done
Capture conventions, then install lint, format, type strictness, and pre-commit enforcement from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint/format/pre-commit run clean.
code in `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `.husky/`, `package.json`, `vitest.config.mts`
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`
- [x] Check it runs clean: `/test`

### 3. Data model · done
Core entities every feature builds on: users, movies, ratings, swipe reactions, taste profile, feed feedback, watchlist entries.
**Done when:** entities and relationships support onboarding, feed generation, CSV import, feedback, and watchlist without a breaking migration.
spec [0002](../specs/0002-data-model/index.md)
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model` · code in `src/db/`
  - [x] Application role & RLS foundation: `app_user` role, Inngest bypass role, `drizzle.config.ts` roles, satisfies AC-6
  - [x] Schema & constraints: `schema.ts` for all seven entities, cascades, check constraints, satisfies AC-1 to AC-5, AC-7, AC-9, AC-10
  - [x] RLS policies & indexes: enable + force RLS per table, GIN/partial indexes, satisfies AC-2, AC-5, AC-6 (HNSW on `movies.embedding` deferred to feature 4's bulk load, per spec 0002's own indexing note)
  - [x] Migration & upsert helper: generate the migration (extension, trigger, atomic counter upsert), write the application upsert helper, satisfies AC-1, AC-2, AC-8, AC-10
  - [x] Apply & verify locally: `pnpm db:migrate`, smoke test RLS as `app_user`, satisfies AC-6, AC-8
- [x] Verify it: `/check verify`

### 4. Movie catalog & ingestion · in-progress
Where movie data comes from and how it gets into the app: source, import pipeline, posters and metadata, refresh, and the fields the recommender and search need.
**Done when:** a real catalog of movies is queryable locally with posters and metadata, and there is a repeatable way to refresh it.
spec [0003](../specs/0003-movie-catalog-ingestion/index.md)
- [x] Design it (spec): `/architect movie catalog & ingestion`
- [ ] Build it: `/develop movie catalog & ingestion` · code in `src/features/catalog/`, `src/lib/tmdb/`, `src/lib/inngest/`, `src/lib/ai/`, `src/db/`
  - [x] Platform wiring & schema: install `inngest`/`ai`/`@ai-sdk/openai`, typed Inngest client + `serve()`, AI registry, Migration A (new `movies` columns, `app_inngest` grant), `asInngest()` DB client · AC-3, AC-7, AC-8, AC-9
  - [x] TMDB client & pure catalog module: `tmdbFetch` + `discoverMovies` + `getMovieDetail` (Zod, retry, `NonRetriableError` on 404), `catalog.config.ts`, `qualifies`/`toMovieRow`/`buildEmbeddingText`/`embeddingInputHash` · AC-1, AC-3, AC-9, AC-10
  - [x] Ingest + embed thin thread: `catalog-ingest-movie` (fixed upsert set-list, no embedding columns) and `catalog-embed-movies` (batched `embedMany`, single writer of the embedding columns), one movie end to end · AC-2, AC-3, AC-4, AC-8, AC-10
  - [ ] Seed backfill & HNSW index: `catalog-seed` + `pnpm catalog:seed` script built; still to run: the ~10k backfill against local Supabase + `inngest dev`, then Migration B (HNSW in `schema.ts`) · AC-1, AC-2, AC-5, AC-9
  - [x] Weekly refresh: `catalog-refresh` cron (new releases, stalest slice, bounded null sweep) + `tmdb_status` transitions · AC-6, AC-7
- [ ] Verify it: `/check verify movie catalog & ingestion`

### 5. Design system & UI foundation · in-progress
Visual language, layout primitives, and base components (including the swipe card) so onboarding, feed, and search feel like one product and stay keyboard accessible.
**Done when:** `design.md` covers type/color/spacing/components, and base components handle focus and keyboard.
spec [0005](../specs/0005-design-system-ui-foundation/index.md)
- [x] Design it (spec): `/architect design system & UI foundation`
- [ ] Build it: `/develop design system & UI foundation` · code in `src/components/`, `src/components/ui/`, `src/components/movie/`, `src/lib/tmdb/`, `src/app/globals.css`, `docs/design.md`
  - [ ] shadcn init + token layer + fonts + `design.md`: `npx shadcn init` (new-york, rsc, lucide, zinc), rewrite `globals.css` (`:root`/`.dark` values, `@theme inline`, `@custom-variant dark`, motion tokens), wire Fraunces / drop Geist Mono, write `docs/design.md`, add the token parity test · AC-1, AC-2, AC-4
  - [ ] Theme switching: `ThemeProvider` (next-themes, default dark) + `ThemeToggle` with a pre-mount placeholder, no theme flash, `(marketing)` stays static · AC-3
  - [ ] Primitives + feedback + layout: `Card`/`Input`/`Label`/`Badge`/`Skeleton`, `Toast` (sonner), `EmptyState`, `Spinner`, `PageContainer`, `Stack`, `Cluster`, with usage notes · AC-1, AC-4, AC-5
  - [ ] Movie components: `posterUrl` helper + `image.tmdb.org` config, `Poster` (2:3, skeleton, fallback on undefined and `onError`), `MovieCard`, `SwipeCard` (one `reactionForDrag` resolver for drag + buttons + arrow keys, single fire, focus + announce, `LazyMotion` drag, reduce-motion branch) · AC-6, AC-7, AC-8, AC-9
  - [ ] Contrast + focus audit, then component tests: `contrastRatio()` gate on every documented pair, `--ring` everywhere, then Vitest for `reactionForDrag`, the `SwipeCard` button/key paths, and smoke tests for the bespoke and composed components · AC-10, AC-11
- [ ] Verify it: `/check verify design system & UI foundation`

## Slice 1: Core recommendation loop

The thinnest real thread through every layer: a user signs in, teaches the app a little taste by swiping, and sees a personalized feed with reasons. This is the walking skeleton. CSV import, richer feedback, generated reasons, and vibe search are all later strands on this thread.

### 6. Accounts & sign in · needs a decision
Sign up, sign in, sign out, and session handling, plus the minimal account record the taste profile hangs off.
**Done when:** a user can create an account, sign in and out, stay signed in across visits, and the app has a stable user id for their data.
- [ ] Design it (spec): `/architect accounts & sign in`

### 7. Swipe onboarding & personalized feed · needs a decision
Swipe through a starter set of movies (like / dislike / seen / skip), reach an "enough to start" threshold, then land on a personalized feed where each pick shows a short templated reason. Carries the recommendation engine decision that later slices extend.
**Done when:** a new user can swipe a starter deck, cross the threshold, and see a ranked feed of unseen movies, each with a templated reason; the deck and feed handle empty and loading states and work with keyboard.
- [ ] Design it (spec): `/architect swipe onboarding & personalized feed`

## Slice 2: Letterboxd CSV import

### 8. Letterboxd CSV import · needs a decision
Upload the Letterboxd ratings export, match titles to the catalog, store the ratings, and feed them into the taste profile as a faster alternative to swiping.
**Done when:** a user can upload their Letterboxd CSV, see how many rows matched and how many did not, confirm the import, and get a feed shaped by those ratings; a bad or partial file is reported clearly, not silently dropped.
- [ ] Design it (spec): `/architect letterboxd csv import`

## Slice 3: Feed depth

### 9. Feed refinement & feedback
Thicken the feed segment: pagination or "load more", a "not interested" / dismiss action that adjusts future picks, refresh, and a "why this" detail view. Extends the recommendation pattern decided in feature 7.
**Done when:** a user can page through the feed, dismiss a pick and see it affect later results, refresh for new picks, and open a fuller explanation for any movie.
- [ ] Build it: `/develop feed refinement & feedback`

### 10. Generated reasons · needs a decision
Upgrade the templated reasons to short written explanations tied to the user's own ratings (for example "because you loved Arrival and Annihilation"). Templated reasons stay as the fallback.
**Done when:** feed picks show a generated reason grounded in that user's real ratings, with a clean fallback to the templated reason when generation is unavailable.
- [ ] Design it (spec): `/architect generated reasons`

## Slice 4: Vibe search

### 11. Vibe search · needs a decision
Type a natural phrase like "cozy slow burn sci fi" and get movies ranked by meaning, filtered to what the user has not seen.
**Done when:** a free text query returns a ranked list of relevant unseen movies with reasons, and empty, slow, and no result states are handled.
- [ ] Design it (spec): `/architect vibe search`

## Slice 5: Watchlist

### 12. Watchlist
Save movies from the feed or search into a personal list, view and manage it, and remove entries.
**Done when:** a user can add a movie to their watchlist from the feed or search, see the full list, and remove items; the list survives sign out and back in.
- [ ] Build it: `/develop watchlist`

## Slice 6: Marketing site & SEO

### 13. Marketing site & SEO · needs a decision
Public landing, about, and how it works pages with proper metadata, sitemap, and social cards so the product is findable, rendered so search engines and link previews see real content.
**Done when:** the public pages render server side with per page title and description, Open Graph and Twitter cards, a sitemap, and a clear path from landing to sign up.
- [ ] Design it (spec): `/architect marketing site & seo`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Ongoing ratings & taste tuning**: a dedicated place to keep rating movies after onboarding so recommendations keep improving · needs a decision
- **Sharing & public taste profiles**: share a movie, a pick, or a taste profile by public link · needs a decision
- **Admin panel**: internal screens to manage the catalog, inspect users, and see usage · needs a decision · GA
- **Product analytics & error monitoring**: track signups, onboarding completion, feed engagement, and runtime errors · needs a decision
- **Cookie consent, privacy policy & terms**: consent banner and legal pages, expected once analytics and real accounts are live · needs a decision
- **Accessibility AA program**: a committed WCAG AA baseline and audit across the whole app, beyond the keyboard support already seeded into onboarding · needs a decision
- **Streaming availability**: show where each movie can be watched · needs a decision
- **Catalog compaction**: a job to prune `tmdb_status in ('disqualified','removed')` movie rows once dead rows become material · from spec 0003 · needs a decision
- **Native mobile app**: a real iOS/Android client · needs a decision
- **Billing & paid tier**: a freemium subscription if the product needs revenue later · needs a decision · GA

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· Beta`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing; **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
