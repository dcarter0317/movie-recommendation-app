# 0004. Cache catalog reads with Next.js Cache Components, rationale

## Context

> ⚠️ Premise note: this adds a caching layer before any performance problem has been measured and before the features that would read the cache (the feed, vibe search, movie pages) exist. Premature caching usually buys operational risk for no gain. Two things make it defensible here: the mechanism is framework native with no new infrastructure, and the load bearing part is adopting Next.js Cache Components, an app wide rendering change that is far cheaper to make now than after the marketing pages, feed, and search are built. Treat this spec as "adopt Cache Components and set the catalog read pattern", not as a latency fix, and let the real cache coverage for browse and search be driven by those features when they can measure it.

The catalog is the local `movies` table fixed by spec 0003, a mirror of TMDB written only by two Inngest jobs: a one time seed and a weekly refresh cron. It is read by features not yet built. The reads that will matter are single movie lookups, filtered browse listings, and vibe search vector queries, the last being the expensive one.

Catalog data changes on a weekly cadence with a known write trigger, so reads tolerate hours of staleness but should not show plainly wrong data (a removed poster, a stale rating) for long. The framework is Next.js 16 (spec 0001), whose caching model changed in this major version: the native system, Cache Components, is gated behind a project wide config switch that also changes rendering semantics across every route. The project runs on Vercel with no separate cache infrastructure, and spec 0001 states a preference to defer extra services until a real need appears.

The forces in play: a weekly write cadence with a known trigger, read paths that do not exist yet, a framework whose native cache is behind an app wide switch, and a standing project preference against new vendors.

If this is not decided, each of the feed and search features invents its own cache keys, tags, and invalidation, and the Cache Components switch gets made later under pressure, touching every route at once.

## Options considered

### Option 1: Adopt Next.js Cache Components, cache catalog reads with `'use cache'` plus one catalog wide tag flush from the weekly job

Turn on `cacheComponents: true`, wrap catalog read functions in `'use cache'` with a shared `catalog` freshness profile and one `catalog` tag, and have `catalog-refresh` call `revalidateTag(CATALOG_TAG)` once per run (in the function body, outside `step.run`). Wire the movie detail read now; document the key rules for browse and search. (The first draft also flushed a per movie `movie:<id>` tag from `catalog-ingest-movie`; the cross check showed the job has no access to the generated row id and that "changed upsert" was undefined, so per movie flushing was dropped to a documented future addition.)

**Pros**:
- Framework native: no new dependency, no vendor, no environment variable (only `NODE_ENV` added to the existing `src/env.ts`).
- `cacheLife` and `cacheTag` give both a time backstop and an event driven flush in one model.
- Making the app wide switch now, before marketing, feed, and search exist, is the cheapest it will ever be.
- One `revalidateTag` line in `catalog-refresh` is almost no coupling into the jobs: no id plumbing, no per row change detection.
- Installed skills (`next-cache-components-adoption`, `next-cache-components-optimizer`) cover the adoption.

**Cons**:
- `cacheComponents: true` changes rendering semantics app wide (Partial Prerendering default, route segment exports disabled), including spec 0001's marketing `force-static` plan and the existing health route.
- Newer surface area; the team has to learn the `'use cache'` model.
- Per movie freshness is given up; a single movie's change is not reflected until the weekly flush or the `revalidate` window.

### Option 2: `unstable_cache`, scoped to the catalog feature

Wrap the same catalog read functions in `unstable_cache(fn, keyParts, { tags })` and flush with `revalidateTag`. No app wide switch.

**Pros**:
- No change to rendering semantics anywhere else; spec 0001's marketing plan stands.
- Same tag based invalidation model, contained in `src/features/catalog/`.
- Familiar API, works today.

**Cons**:
- Next.js documents `unstable_cache` as replaced by `'use cache'` in version 16 and recommends migrating; building a foundation on it means re touching every call site later.
- Still an `unstable_` API with no long term stability guarantee.
- The project would carry two caching models once anything adopts Cache Components.

### Option 3: `React.cache` only, defer the persistent cache

Ship only per request memoization now; decide the cross request cache when the feed and search are built and can measure latency.

**Pros**:
- Smallest commitment; nothing app wide changes.
- Honest about caching only once there is a measured need.

**Cons**:
- Does not deliver a cache layer or a reusable pattern; `React.cache` gives no cross request or cross instance reuse.
- The Cache Components switch still has to be made later, under more pressure, touching every route.
- The feed and search each still have to design their own caching from scratch.

### Option 4: External key value store (Upstash or Vercel KV)

Put catalog read results in a Redis backed store with explicit keys and time to live values.

**Pros**:
- Cross instance shared cache and full control over entries.
- Independent of the framework's caching model.

**Cons**:
- A new vendor, a new environment variable, and setup, against spec 0001's stated preference to defer extra services.
- Hand rolled key and invalidation logic that the framework model gives for free.
- No measured need for cross instance caching at this scale (a ten thousand row catalog).

## Rationale

Option 1 fits the forces from Context. The write cadence is weekly with a known trigger (`catalog-refresh`), which is exactly what a tag flush is for: flush the one `catalog` tag at the end of a refresh and let a 1 day `expire` be the backstop. A per movie tag was considered and dropped: `catalog-ingest-movie` upserts on `tmdb_id` and never sees the generated row id, "changed" was undefined against an upsert that always bumps `updated_at`, and the weekly cadence plus the 1 day expiry already bound staleness to under one refresh cycle, so the plumbing was not worth it. The mechanism is framework native, so it respects spec 0001's preference against new vendors. The read paths do not exist yet, so the only read wired now is movie detail; browse and search get documented key rules and nothing more, which matches the "pattern plus one example" deliverable.

The one real cost is the app wide `cacheComponents` switch, and the timing argument runs the opposite way from the usual "do not cache yet": the marketing pages, feed, and search are all still unbuilt, so the switch touches almost nothing today and a great deal later. Option 2 avoids the switch but builds on an API Next.js itself says to migrate off, the wrong foundation for a pattern other features will copy. Option 3 is the honest "not yet" answer but leaves both the switch and every feature's caching undone. Option 4 adds infrastructure the scale does not justify.

The engineer chose Option 1 (adopt Cache Components project wide), the `stale 15m / revalidate 6h / expire 1d` profile, a single catalog wide flush from `catalog-refresh`, framework native only with no external store, movie detail as the wired example, and the normalized text plus version search key. An independent cross check then simplified the invalidation (one catalog wide tag rather than per movie), moved the flush call outside `step.run`, dropped a redundant `React.cache` wrapper, and pinned down build time database access and the health route fallout; this spec records the result.

## References

**Project sources** (verifiable, in this repo):
- Spec 0001 (stack and architecture): Next.js 16 on Vercel, the request path Drizzle client, the `src/env.ts` rule, and the marketing `force-static` plan this decision supersedes.
- Spec 0003 (movie catalog and ingestion): the `movies` table as a TMDB mirror, the `catalog-ingest-movie` and `catalog-refresh` Inngest functions, `EMBEDDING_TEXT_VERSION` in `src/features/catalog/catalog.config.ts`, and the flag to create a nested `src/features/catalog/AGENTS.md`.
- `AGENTS.md`: folder by feature, "avoid null, use explicit undefined", named exports, and the `next-dev-loop` skill entry with its `next-cache-components-adoption` and `next-cache-components-optimizer` see alsos.
- Installed skill `next-cache-components-adoption` (`vercel/next.js`): the adoption procedure for `cacheComponents: true`.

**Practices & standards**:
- Cache aside with a time to live plus event driven invalidation: a tag flush on write for freshness, a bounded expiry as the correctness backstop.
- Cache keys derived from a normalized, canonical form of the inputs so equivalent requests share one entry.
- Keep per user data out of a shared cache; personalize outside the cached boundary.
- Boring technology and reuse: prefer the framework's native mechanism over new infrastructure absent a measured need.
