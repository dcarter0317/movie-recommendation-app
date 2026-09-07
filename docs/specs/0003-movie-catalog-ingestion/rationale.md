# 0003. Movie catalog and ingestion — rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

The app has a `movies` table (spec 0002) but nothing puts data in it. Every downstream slice depends on a real catalog: swipe onboarding (feature 7) needs a starter deck and a rankable feed, vibe search (feature 11) needs embeddings to compare a query against, Letterboxd import (feature 8) needs titles to match, generated reasons (feature 10) need real metadata to ground the text.

Spec 0001 already fixed the load bearing pieces: the data source is TMDB, embeddings are OpenAI `text-embedding-3-small` (`vector(1536)`, cosine distance) reached through the Vercel AI SDK, background work runs on Inngest and must "fan out one event per TMDB result page, not one long running job", and every external call uses a 10 second timeout with three attempts and backoff. Spec 0002 fixed the `movies` columns for title, overview, genres, keywords, cast, poster, and the embedding triple, and explicitly deferred the HNSW index to "feature 4's bulk load".

Forces that shaped the choice:
- **One developer, free tiers.** The catalog has to be cheap to build and cheap to keep current. Roughly ten thousand movies keeps one time embedding spend well under a dollar and stays inside pgvector's comfortable range without index tuning.
- **No long lived process on Vercel.** The backfill must decompose into Inngest steps and fan out; it cannot be one job that runs for twenty minutes.
- **TMDB is rate limited (about 50 requests per second) and changes over time.** Ratings move, popularity decays, titles are occasionally deleted. Ingestion must be throttled and repeatable, not a one shot.
- **Downstream foreign keys.** `user_movie_interactions`, `watchlist_items`, and `reasons` all point at a movie. A movie that leaves the catalog cannot simply disappear or those rows dangle.
- **Cold start ranking.** Spec 0002's feed fallback ranks by a popularity signal while a user has no taste embedding yet. That signal has to be present in the catalog from the first row.

Consequence of not deciding: `/develop` would invent the discover query, the quality bar, the refresh model, the embedding text format, and the job topology on the fly. A wrong call on any of them (too large a catalog, no refresh path, embedding coupled to ingestion) is expensive to unwind once features 7 and 11 build on the catalog.

## Options considered

### Option 1: TMDB `/discover` backfill, per movie Inngest fan out, decoupled batched embedding, weekly rolling refresh (chosen)

A `pnpm catalog:seed` script fires one Inngest event. A seed function pages `/discover` (a popularity pass and a rating pass) applying the qualification filters, and emits one ingest event per movie. A concurrency limited function fetches full detail, upserts on `tmdb_id`, and enqueues an embedding event only when the embedding text changed. A batched consumer embeds up to a hundred movies per `embedMany` call. A weekly cron pulls new releases, re fetches the stalest slice by `last_refreshed_at`, transitions fallen out movies to a status flag, and sweeps un embedded rows.

**Pros**:
- Each movie retries in isolation; the backfill resumes cleanly after any failure.
- An embedding provider outage never blocks catalog growth; the null sweep self heals.
- Refresh load is constant and predictable; no dependency on TMDB's noisy `/movie/changes` feed.
- Idempotent on `tmdb_id`, so re running the seed is safe.

**Cons**:
- More moving parts: four functions, three event types.
- A stored `embedding_input_hash` to detect text changes.
- A burst of roughly ten thousand Inngest events at seed time.

### Option 2: Single durable backfill job, embed inline per movie

One Inngest function walks all discover pages in a loop, and for each movie fetches detail and computes the embedding in the same step before writing the row.

**Pros**:
- Fewer functions and events.
- Every stored row always has an embedding, a simpler invariant, no hash bookkeeping.

**Cons**:
- One movie failing detail or embedding fails the step, and its retry redoes work.
- An OpenAI rate limit or outage stalls the entire catalog, not just enrichment.
- Ten thousand sequential embed calls instead of about a hundred batched ones is slower and pricier.
- Poor resumability on a job that runs this long.

### Option 3: Larger catalog (50k or more), everything above a low vote floor

The same pipeline, but the quality bar is only "released with a poster" and the target is the full long tail.

**Pros**:
- Better search recall for obscure queries.
- Fewer "not in catalog" gaps.

**Cons**:
- Weaker popularity signal: the median row has almost no votes, so cold start ranking degrades.
- More embedding cost and a longer backfill.
- HNSW needs tuning past a few hundred thousand rows (spec 0001).
- More low quality rows in the swipe deck and feed early, the opposite of what a taste recommender wants.

### Option 4: Static seed file, no live TMDB pipeline

Commit a curated JSON of a few thousand movies, load it with a script, embed once, no refresh.

**Pros**:
- No Inngest infrastructure for the catalog.
- Fully deterministic, no API dependency at build time.

**Cons**:
- The catalog is frozen: no new releases, no rating corrections.
- Someone has to hand maintain the file.
- It does not scale to ten thousand without becoming unwieldy.
- It throws away the genres, keywords, and cast richness the embeddings need for signal.

## Rationale

Option 1 is chosen because the forces in Context are about repeatability and failure isolation on a one person, free tier build, not about minimising component count. The per movie fan out is exactly the pattern spec 0001 already mandated, and it is what makes a ten to twenty minute backfill safe to interrupt and resume.

Decoupling embedding from ingestion follows from "design for failure": OpenAI is the least reliable dependency in the chain and the one most likely to rate limit on a ten thousand item burst, so a movie must be able to exist without its vector and get one later. Spec 0002's cold start popularity fallback already assumes exactly this null embedding window, so the decoupling costs nothing downstream. Batching the embeds is the boring cost control: one `embedMany` per hundred movies instead of ten thousand calls.

The weekly rolling refresh is the simplest thing that keeps ratings and new releases current without leaning on TMDB's noisy changes feed, and the flag instead of delete rule is forced by the downstream foreign keys: an interaction or watchlist row must always resolve to a movie.

Option 2's simpler invariant is real but the wrong trade here: it couples catalog health to the flakiest provider. Option 3 optimises for a recall problem the product does not have yet and degrades the early feed, and the vote floor can always be lowered later in one config file if search recall proves short. Option 4 removes the one property that makes the catalog valuable over time, that it stays current on its own.

The roughly ten thousand size, the qualification filters, the labelled multi line embedding text block (over natural prose), the decision not to add a `Director` field, and per row timestamps over an `ingestion_runs` table were all the engineer's calls in the design conversation. Inngest's own run history covers the observability an `ingestion_runs` table would have given, so nothing is lost for this scale.
