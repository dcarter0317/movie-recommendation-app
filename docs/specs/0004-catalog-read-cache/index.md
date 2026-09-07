# 0004. Cache catalog reads with Next.js Cache Components

**Date**: 2026-09-07
**Status**: Proposed

## Summary

This decision sets how the app caches reads of the movie catalog (the local `movies` table that mirrors TMDB, fixed by spec 0003). It adopts Next.js Cache Components, the framework's own caching system in version 16, turned on by one project wide switch (`cacheComponents: true`). Catalog read functions are wrapped in the `'use cache'` directive with a shared freshness profile (fresh for 15 minutes, refreshed in the background for 6 hours, hard expiry at 1 day) and one catalog wide cache tag, and the weekly refresh job calls `revalidateTag` once per run so cached data refreshes soon after the catalog changes. No new vendor, no new environment variable, no database change. Only the movie detail read is wired now as the working example; browse and vibe search get documented key rules that their own features wire later.

## Requirements

**User stories**:
- As an engineer building the feed and vibe search, I want a ready caching pattern for catalog reads so I do not design cache keys and invalidation from scratch in every feature.
- As a visitor, I want movie pages and search to respond fast without the app querying the database on every request.
- As the system, I want cached catalog data to refresh soon after the weekly catalog job runs, and never to serve wrong data, only slightly old data.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: `cacheComponents: true` is set in `next.config.ts` (top level, not under `experimental`). `pnpm build` and `pnpm typecheck` pass with it on, and `/api/health`, `/api/inngest`, and both route groups still build and serve. Specifically, `src/app/api/health/route.ts` no longer uses `export const dynamic = 'force-dynamic'` (Cache Components rejects it); it stays dynamic by calling `await connection()` (from `next/server`) before the database ping, so the health check never runs at build time. `/api/inngest` and both route groups are audited the same way for build time data access.
- **AC-2**: `next.config.ts` declares a custom `cacheLife` profile named `catalog` with `stale: 900`, `revalidate: 21600`, `expire: 86400` (15 minutes, 6 hours, 1 day). It is usable as `cacheLife('catalog')` inside a cached scope.
- **AC-3**: `src/features/catalog/cache.ts` exports `CATALOG_TAG` (the string `catalog`), plus the pure key helpers `normalizeBrowseParams` and `normalizeQueryText`. The two helpers are unit tested. Their normalized string output is the value passed as the cached function's argument (Cache Components keys on arguments), not a separate side value.
- **AC-4**: `getMovieById(id: string)` returns the matching `movies` row as a plain serializable object with an explicit column list that excludes `embedding` and the other `embedding_*` columns (a 1536 float vector per cache entry is a real size problem), or `undefined` when none matches. Its cached scope carries `'use cache'`, `cacheLife('catalog')`, and `cacheTag(CATALOG_TAG)`. There is no `React.cache` wrapper (Cache Components already dedupes an identical cached call within a request, and `React.cache` only memoizes inside a render context). The function runs on the pooled request path Drizzle client only; it executes only at request time, behind a `<Suspense>` boundary or after `connection()`, never at build or prerender.
- **AC-5**: No cached catalog read takes a user id, a session, or a request object, or closes over per user data. Cached catalog functions use the plain `'use cache'` directive, never `'use cache: private'`. Per user work (for example the feed and search exclusion of already seen movies) happens outside the cached boundary, on the caller side.
- **AC-6**: The browse and filter cache key comes from `normalizeBrowseParams`: only an allowed set of keys is kept (the whitelist contents are decided by features 7 and 11 when browse is built), values are lowercased, array values are sorted, and the result is serialized deterministically, so filters that mean the same thing map to one entry.
- **AC-7**: The vibe search result cache key is `normalizeQueryText(query) + ':' + EMBEDDING_TEXT_VERSION`, reusing the constant already defined in `src/features/catalog/catalog.config.ts` (spec 0003). The cached value is the catalog side ranked list before any per user exclusion. Raising `EMBEDDING_TEXT_VERSION` makes every search entry miss on the next read.
- **AC-8**: `catalog-refresh` calls `revalidateTag(CATALOG_TAG, 'max')` once a run finishes. The call sits in the Inngest function body, outside any `step.run` (a call inside a step is memoized and would not re fire on a retry or replay), after the run's ingest and embed steps resolve. It runs inside the Inngest handler at `/api/inngest`, a valid server context for `revalidateTag`; it stops working if the app ever moves to `inngest connect` or a separate worker process. A missed call degrades only to staleness bounded by the `catalog` profile `expire` of 1 day, never to wrong data. `catalog-ingest-movie` does not call `revalidateTag` (per movie flushing is a documented future addition; see Follow-up).
- **AC-9**: A Vitest test covers the pure helpers (`normalizeBrowseParams`, `normalizeQueryText`) and `getMovieById`'s row shape and `undefined` on a missing id. The caching behaviour itself (an identical cached call dedupes within a request, and `revalidateTag(CATALOG_TAG)` forces the next call to re query) is proven through the dev only route `GET /api/dev/catalog/[id]` driven under `next dev` in the `/check verify` browser pass, not in Vitest (`'use cache'` is a compiler transform and is inert under a plain unit test runner). The dev route returns 404 when `NODE_ENV` is `production` (read through `src/env.ts`). Note: under `next dev` and local verification the default cache handler is per process, so a `revalidateTag` effect is visible only in the process that served the request.

## Options considered

Reasoning and options: see [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 1: Adopt Next.js Cache Components, cache catalog reads with `'use cache'` plus a catalog wide tag flush from the weekly job.

Turn on Cache Components project wide, cache catalog read functions with the `'use cache'` directive under a shared `catalog` freshness profile and one catalog wide `catalog` tag, and have `catalog-refresh` call `revalidateTag(CATALOG_TAG)` once per run; wire the movie detail read now and document the key rules for browse and vibe search.

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `inngest-durable-functions` (`inngest/inngest-skills`, `.agents/skills/inngest-durable-functions/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no database change. No new entities, columns, indexes, or environment variables. What this feature adds is one cache tag and a set of cache key rules:

| Element | Value | Set by / flushed by |
|---|---|---|
| Tag `catalog` (`CATALOG_TAG`) | carried by every cached catalog read (detail, browse, search) | flushed by `catalog-refresh` once per run; also cleared on every deploy (the build id is part of every cache key) |
| `cacheLife('catalog')` profile | stale 15m, revalidate 6h, expire 1d | declared in `next.config.ts` (AC-2); the time backstop under the tag flush |
| single movie key | the `id` argument | Cache Components, automatic from the argument |
| browse key | deterministic string from `normalizeBrowseParams`, passed as the cached function's argument | `src/features/catalog/cache.ts` |
| vibe search key | `normalizeQueryText(query) + ':' + EMBEDDING_TEXT_VERSION`, passed as the cached function's argument | `cache.ts` plus `catalog.config.ts` (spec 0003) |

**State transitions**: none. A cache entry is present or absent; `revalidateTag` marks it for refresh, the profile `expire` bounds it.

**API surface**: no HTTP surface of its own except the dev only route. The entry points:

| Entry point | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getMovieById(id)` | cached server function in `src/features/catalog/cache.ts`, pooled request client only | `id: string` | plain object (explicit `movies` columns, no `embedding*`), or `undefined` | none (public catalog data) | none; a database error propagates to the caller uncached |
| `normalizeBrowseParams(params)` | pure helper | filter params object | deterministic string key (the cached function's argument) | n/a | n/a |
| `normalizeQueryText(query)` | pure helper | raw query string | normalized string (part of the cached function's argument) | n/a | n/a |
| `revalidateTag(CATALOG_TAG, 'max')` | `next/cache`, called from `catalog-refresh` in the function body outside `step.run` | none | void | Inngest cron | called outside a server context is invalid; guarded by running inside `/api/inngest`; a call inside `step.run` would be memoized and not re fire |
| `GET /api/dev/catalog/[id]` | Route Handler, dev only | `id` path param | JSON of the cached read | none | 404 when `env.NODE_ENV === 'production'`, 404 when no movie |

**Value sourcing**:

| Action | Value produced / used | Source |
|---|---|---|
| `getMovieById` result | plain object of explicit `movies` columns, never `embedding` / `embedding_model` / `embedded_at` / `embedding_input_hash` | `select <explicit column list> from movies where id = $id` via the pooled request path Drizzle client (spec 0001), inside the `'use cache'` scope, at request time only |
| `getMovieById` cache key | build id + function id + `id` argument | Cache Components, automatic from the argument |
| `getMovieById` cache tag | `catalog` | `CATALOG_TAG` constant in `src/features/catalog/cache.ts` |
| `getMovieById` freshness bounds | stale 15m / revalidate 6h / expire 1d | `cacheLife('catalog')`, profile defined in `next.config.ts` (AC-2) |
| `getMovieById` execution time | request time only, never build or prerender | called behind a `<Suspense>` boundary or after `connection()`; the spec does not bake catalog data into the build |
| browse cache key | normalized filter string, passed as the cached function's argument | `normalizeBrowseParams`: allowed key whitelist (contents decided by features 7 and 11), lowercased values, sorted arrays, deterministic serialization |
| vibe search cache key | `normalizeQueryText(q) + ':' + EMBEDDING_TEXT_VERSION`, passed as the cached function's argument | `normalizeQueryText` in `cache.ts` plus `EMBEDDING_TEXT_VERSION` from `src/features/catalog/catalog.config.ts` (spec 0003) |
| catalog wide invalidation trigger | `revalidateTag('catalog', 'max')` | `catalog-refresh`, in the function body outside `step.run`, after the run's steps resolve (spec 0003 function; hook added by this feature) |
| dev route gate | enabled, or 404 | `env.NODE_ENV`, added to and read through `src/env.ts` (spec 0001 rule) |

**Key invariants**:
- Every cached catalog read carries `cacheLife('catalog')` and `cacheTag(CATALOG_TAG)`. There is one catalog tag; there is no per movie tag in this spec.
- Cached catalog functions take only primitive, non user arguments and never close over per user data. Plain `'use cache'`, never `'use cache: private'`.
- Cached catalog reads execute at request time only, behind a `<Suspense>` boundary or after `connection()`, on the pooled request path client. They never run at build or prerender, and job code never calls them (jobs use the unpooled `asInngest` client from spec 0003).
- `getMovieById` selects an explicit column list and never returns `embedding` or the `embedding_*` columns.
- Per user work (exclusion of seen movies, personalization) happens outside the cached boundary.
- Invalidation is best effort; the `catalog` profile `expire` of 1 day is the correctness backstop. A stale entry is at most 1 day behind and is only ever old data, never wrong data. A cached `undefined` (a movie not yet ingested) is also cleared by the weekly `revalidateTag(CATALOG_TAG)` and on every deploy.
- The `revalidateTag` call lives in the `catalog-refresh` function body, outside `step.run`, so it re fires on every attempt.
- `getMovieById` returns `undefined` for a missing row, never `null` (project rule).
- The browse and search key helpers are pure and deterministic: same meaning in, same string out; their output is the argument the cached function is called with.
- The dev route returns 404 whenever `env.NODE_ENV` is `production`.
- `next.config.ts` gains `cacheComponents: true` and the `catalog` `cacheLife` profile only; `src/env.ts` gains `NODE_ENV`.

**Security model**:
- Catalog data is public movie metadata. No PII, no user data, no compliance scope.
- The only real risk is caching per user data by mistake and serving it to another user. AC-5 blocks this: cached catalog functions take no user identity, use the shared `'use cache'` directive, and personalization stays on the caller side.
- `revalidateTag` runs only inside `catalog-refresh` in the Inngest handler route, a signed server context (spec 0003 security model). No user request path calls it.
- `GET /api/dev/catalog/[id]` exists only outside production and exposes only public catalog data even then.

**Configuration required**: none. No new secret or external credential. `next.config.ts` gains the `cacheComponents` flag and the `catalog` `cacheLife` profile. `NODE_ENV` is already declared in `src/env.ts`, so the dev route guard reads `env.NODE_ENV` with no schema change. The tag constant and the profile name are constants in `src/features/catalog/cache.ts`.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Build switch: with `cacheComponents: true` and the `catalog` profile declared, `pnpm build` and `pnpm typecheck` pass; the health route uses `await connection()` instead of `dynamic = 'force-dynamic'` and still returns `{ ok: true }` with a live database ping; `/api/inngest` still serves. Verifies **AC-1**, **AC-2**.
- Row shape (Vitest): `getMovieById(id)` returns an object with the explicit column set and no `embedding*` field; `getMovieById('missing')` returns `undefined`. Verifies **AC-4**.
- Caching behaviour (dev route under `next dev`, in `/check verify`): hitting `GET /api/dev/catalog/[id]` twice in one request path issues one query; after `catalog-refresh` calls `revalidateTag(CATALOG_TAG, 'max')`, the next hit re queries. Verifies **AC-8**, **AC-9**.
- Key normalization (Vitest): `normalizeBrowseParams` maps `{ genre: ['B','a'] }` and `{ genre: ['a','b'], junk: 1 }` to the same key; `normalizeQueryText('  Cozy  SciFi ')` is stable; changing `EMBEDDING_TEXT_VERSION` changes the search key. Verifies **AC-6**, **AC-7**.
- No user arguments: a review or type check confirms no cached catalog function signature includes a user id, session, or request. Verifies **AC-5**.
- Dev route gate: `GET /api/dev/catalog/[id]` returns 404 when `env.NODE_ENV` is `production`. Verifies **AC-9**.

## Build plan

Ordered by the project's Tracer Bullet approach: make the project wide switch first, then the pure primitives, then one real cached read end to end, then the invalidation hook, then the proof.

1. **Adopt Cache Components.** Set `cacheComponents: true` in `next.config.ts` and add the `catalog` `cacheLife` profile (`stale: 900`, `revalidate: 21600`, `expire: 86400`). Replace `export const dynamic = 'force-dynamic'` in `src/app/api/health/route.ts` with `await connection()` (from `next/server`) before the database ping. Audit `/api/inngest` and both route groups for build time data access the same way. Run `pnpm build` and `pnpm typecheck`, confirm `/api/health` and `/api/inngest` still serve. Consult the `next-cache-components-adoption` skill. Satisfies **AC-1**, **AC-2**.
2. **Cache module and pure key helpers.** Create `src/features/catalog/cache.ts` with `CATALOG_TAG`, `normalizeBrowseParams`, `normalizeQueryText`, and a placeholder allowed browse key whitelist (contents left to features 7 and 11). Unit test the two normalizers. Satisfies **AC-3**, **AC-6**, **AC-7**.
3. **Wire the tracer read: `getMovieById`.** Implement it in `cache.ts` as a single async function carrying `'use cache'`, `cacheLife('catalog')`, `cacheTag(CATALOG_TAG)`, that runs a Drizzle select of an explicit column list (no `embedding*`) on the pooled request client and returns the plain object or `undefined`. No `React.cache` wrapper. Document that callers place it behind `<Suspense>` or after `connection()`. Satisfies **AC-4**, **AC-5**.
4. **Invalidation hook in `catalog-refresh`.** In `catalog-refresh` (spec 0003), after the run's ingest and embed steps resolve, call `revalidateTag(CATALOG_TAG, 'max')` from `next/cache`, in the function body outside `step.run`. Sequence this after feature 4 is built, or fold this task into feature 4's build. Satisfies **AC-8**.
5. **Proof: tests and dev route.** Vitest for the two normalizers and `getMovieById`'s row shape / `undefined` behaviour. Add `GET /api/dev/catalog/[id]` returning the cached read, 404 when `env.NODE_ENV === 'production'` (`NODE_ENV` is already declared in `src/env.ts`). Exercise the dedupe and `revalidateTag` re query behaviour through that route under `next dev` (the `/check verify` browser pass), against a local Supabase stack with a couple of seeded rows. Satisfies **AC-9**.
6. **Write `docs/specs/0004-catalog-read-cache/verify.md`** mapping AC-1 through AC-9 to the concrete checks above, including the note that local `next dev` `revalidateTag` only affects the serving process.

## Consequences

**Positive**:
- One documented caching pattern (the `catalog` tag, the `catalog` profile, key rules) that the feed and vibe search adopt directly instead of each inventing cache keys and invalidation.
- Framework native: no new vendor, no new secret, no new bill. Uses what the stack already runs.
- One `revalidateTag` call per weekly run plus a 1 day `expire` backstop keeps catalog data at most a day stale and never wrong, with almost no coupling into the jobs (one line, no id plumbing, no per row change detection).
- Adopting Cache Components now, before the marketing pages, feed, and search exist, is far cheaper than making the app wide switch later.

**Negative / tradeoffs**:
- `cacheComponents: true` is a project wide change. It makes Partial Prerendering the default and disables the route segment exports `dynamic`, `revalidate`, and `fetchCache`. Spec 0001's plan to make the marketing route group static with `export const dynamic = 'force-static'` no longer applies and needs the Cache Components equivalent, and the existing health route must move to `await connection()`. Recorded as a follow up against spec 0001 and feature 13.
- This is caching ahead of a measured performance problem. Only the movie detail read is wired; browse and vibe search get key rules but no working cache until their features build. The value now is the Cache Components adoption and the pattern, not a latency fix.
- Cache Components is newer surface area. `'use cache'`, `cacheLife`, and the tag model are conventions the team has to learn, and the installed skills track a fast moving part of Next.js.
- The one `catalog` tag covers detail, browse, and search alike, so a weekly flush also drops every vibe search entry. Repopulating one costs an OpenAI embedding call plus a pgvector scan, spread across whatever queries actually recur. Acceptable at a weekly cadence; a separate, less aggressively flushed search tag is a later option if that cost bites.
- Every deploy changes the build id, which is part of every cache key, so each deploy is a full catalog cache flush. Fine at this scale; worth knowing.
- A cached `undefined` for a movie not yet ingested persists until the weekly flush or the next deploy. Acceptable for a catalog that changes weekly.
- Per movie freshness is given up. A single movie's rating or poster change during the week is not reflected until the weekly flush (or its `revalidate` window elapses). Fine for a taste app, per spec 0003's own staleness note.

**Neutral**:
- No database migration, no schema change, no `src/env.ts` change (`NODE_ENV` is already declared). The only files touched outside `src/features/catalog/` are `next.config.ts`, `src/app/api/health/route.ts` (the `connection()` change), and, in task 4, spec 0003's `catalog-refresh` function.
- New conventions for this area: cached catalog reads live in `src/features/catalog/cache.ts`, always carry `cacheLife('catalog')` and the `catalog` tag, never take a user argument, and run only at request time behind a `<Suspense>` boundary.
- No custom cache hit and miss metrics for now. The Next.js dev cache indicators and `next build` output are enough at this stage; add real metrics when the feed and search are live and load matters.

## Follow-up

- [ ] Spec 0001's marketing route group approach (`export const dynamic = 'force-static'`) is superseded by Cache Components. Feature 13 (marketing site) should make the public pages static the Cache Components way, and spec 0001's "Rendering and API shape" and "Secrets and local development" notes should be updated to match.
- [ ] Task 4 edits `catalog-refresh`, specified in spec 0003 but not built yet. Sequence this feature's build after feature 4, or fold task 4 into feature 4's implementation.
- [ ] Per movie cache flushing is deliberately not built. If per movie freshness is ever wanted, add a `movie:<tmdbId>` tag to `getMovieById` (keyed on the TMDB id, which both sides share) and a `revalidateTag` call in `catalog-ingest-movie` (needs the upsert to return the changed row, or to treat every upsert as changed).
- [ ] `src/features/catalog/cache.ts` conventions (cached reads carry the `catalog` profile and tag, never take a user argument, run only at request time behind `<Suspense>`, per user work stays outside the boundary) belong in a nested `src/features/catalog/AGENTS.md`, which spec 0003 already flags creating before the feed and search build on the catalog.
- [ ] Browse and vibe search caching is pattern only here. When feature 7 (feed) and feature 11 (vibe search) build, they wire the cached reads using these key rules, decide the browse allowed key whitelist, and should measure real hit rates; revisit a separate search tag or an external cache store only if the framework cache proves insufficient then.
- [ ] Run the `next-cache-components-optimizer` skill after adoption to check `'use cache'` placement across the app.
