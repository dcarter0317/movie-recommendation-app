# 0007. Swipe onboarding and personalized feed: rationale

The build spec is [index.md](index.md). This file holds the context, the options, and the reasoning. `/develop` does not need it.

## Context

> Premise note: this topic bundles three things, the swipe onboarding flow, the recommendation engine, and the feed surface. They are one Tracer Bullet thread through Slice 1, they share the interaction model from spec 0002 and one config file, and splitting them would scatter a single thin slice across three specs. So one spec is right. The load bearing part is the recommendation engine choice; the onboarding deck and the feed screen are the surfaces that exercise it, and later slices (feature 9 feedback, feature 10 generated reasons, feature 11 vibe search) extend the engine, not the screens.
>
> Second premise note: this feature assumes an authenticated session and a stable user id. Feature 6 (accounts and sign in) has a spec, 0006, but it is still `Proposed`, not built. Every entry point here is stated as authenticated and self scoped, and the dependency is called out in the Security model and Consequences. Feature 7 can be built against an injected user id in tests, but it cannot be verified end to end until feature 6 lands.

Slice 1 is the walking skeleton: the thinnest real thread that proves a user can sign in, teach the app a little taste, and see a personalized feed with reasons. It has to touch every layer (auth, a write path, a background job, a vector query, a render) without going deep on any of them.

The ground is already laid. Spec 0002 fixed the schema: `user_movie_interactions` for swipes, `taste_profile` for one stored taste vector per user kept current by a debounced job, and it explicitly handed four decisions to this feature, the start threshold, the ranking algorithm, the popularity style fallback for when no taste vector exists yet, and the tuning of the similarity search once the exclusion filter is applied after retrieval. Spec 0003 built the catalog: roughly ten thousand movies with genres, keywords, cast, TMDB ratings, a 1536 dimension embedding, and an HNSW index for cosine similarity. Spec 0004 turned on Next.js Cache Components, which means per user reads must run at request time behind `connection()` or `<Suspense>` and must not use `'use cache'`. Spec 0005 built the `SwipeCard`, `Poster`, `MovieCard`, `EmptyState`, and layout primitives, all keyboard operable and reduce motion aware.

The forces that shape the choice:

- **The taste vector is eventually consistent.** It is written by a background job a few seconds after a swipe, so the feed has to work in the window before the job has ever run, and for a user whose swipes produced no positive signal at all.
- **Recording a swipe must stay fast.** It is on the interaction path; the expensive work (recomputing a mean over the user's likes) belongs off that path.
- **The feed must never be empty.** A new user who just crossed the threshold, or a user the job has not caught up with, still needs a populated screen.
- **The catalog rating signal has to be stable.** Spec 0003 warns that the `popularity` column decays on TMDB's side and goes stale between weekly refresh slices, so it is a poor primary sort. `vote_average` and `vote_count` are stable but a raw average over rewards a high score from a tiny sample.
- **Reasons have to be cheap.** Feature 10 owns written, generated reasons. Feature 7 only needs a templated one, and it must not add a per pick AI call or a second vector query.
- **Nothing here should require a migration.** Spec 0002 was designed so features 6 through 12 build on it with no breaking schema change, and this feature stays inside that.

The consequence of not deciding: `/develop` would have to invent the threshold, the fallback ranking, the debounce window, the over fetch factor, the reason format, and the onboarding gate mechanism mid build, each a guess that later slices would inherit.

## Options considered

### Option 1: Stored taste vector mean, HNSW similarity feed with a weighted rating fallback, stateless deck, debounced recompute, templated tag overlap reasons

Rank the feed by cosine distance between a stored per user taste vector and each movie's embedding, over the HNSW index, over fetching candidates and excluding the user's seen, skipped, disliked, dismissed, and watchlisted movies after retrieval. Keep the taste vector current with a debounced Inngest job that recomputes it as the L2 normalized mean of the user's liked movie embeddings. Serve the onboarding deck as a stateless query ranked by a Bayesian weighted rating with genre spread, excluding already reacted movies, widening when it runs short. Unlock the feed at five qualifying positive signals, derived from a live count. Attach a reason built from the genre and keyword tags a pick shares with the user's liked movies.

**Pros**:
- Matches the shape spec 0002 already chose (one stored vector, a debounced job, cosine distance), so nothing is relitigated.
- The feed read is one vector query plus one exclusion query; recording a swipe stays a single upsert plus an event.
- One fallback path (the weighted rating) covers cold start, sparse likes, an empty taste set, and a thin candidate pool.
- No migration, no new environment variable, no new tool.

**Cons**:
- The taste vector is a stored derived value, which the project's rules push against; it is justified only by the read cost it removes.
- The exclusion runs after the vector search, so `ef_search` and the over fetch factor need real tuning later.
- The onboarding gate is a live count on every `(app)` navigation.

### Option 2: Compute recommendations fully on the request path, no stored taste vector

On each feed view, read the user's liked movie embeddings, mean them, and run the HNSW query inline. No `taste_profile.embedding`, no job.

**Pros**:
- Always fresh; no stale vector, no job to operate, no debounce to tune.
- One fewer moving part.

**Cons**:
- Every feed view does a 1536 dimension aggregation over the user's likes plus a vector query; latency grows with like count.
- Spec 0002 already rejected this shape and built the schema around a stored vector.
- The mean would be recomputed on every paginated feed request in feature 9.

### Option 3: Precompute a materialized per user feed

A `feed_items` table, one set of rows per user, refreshed by a job whenever the taste vector changes; the feed read becomes a plain indexed select and reasons can be precomputed.

**Pros**:
- The feed read is trivial and uniformly fast regardless of history size.
- Reasons computed once per refresh, not per request.

**Cons**:
- A new table and a fan out refresh job for every taste change, which is a migration and real operational surface.
- Staleness between refreshes, and a cold path for a user whose feed has not been built yet (the same problem as Option 1's fallback, plus a table).
- Over engineered for Slice 1. Feature 9 can add materialization later if a measured read cost justifies it.

### Option 4: Skip the swipe deck in v1, seed taste from Letterboxd import only

Build the feed and the taste job, but get the initial signal from the feature 8 CSV import rather than a swipe deck.

**Pros**:
- Less UI to build now; a Letterboxd export is a much richer starting signal than a handful of swipes.

**Cons**:
- The scope makes swipe onboarding the primary Slice 1 path and the CSV import a Slice 2 alternative, not a replacement.
- A user without a Letterboxd account has no way in.
- It defers the `SwipeCard` integration that spec 0005 built the card for.

## Rationale

Option 1 is chosen because it is the shape the earlier specs already committed to, and because it keeps the two hot paths cheap. Spec 0002 built `taste_profile` for a stored vector and described the debounced recompute job in enough detail that Option 2 would mean discarding that design, and Option 3 would mean adding a table to a schema that was explicitly frozen for features 6 through 12. The stored vector is a derived value, which the rules discourage, but the rule's own carve out is "unless you have a measured performance problem", and a per dimension mean over a growing like set plus an HNSW query on every feed view (made worse by feature 9's pagination) is exactly that problem in the making; spec 0002 already made this call.

The fallback is a single Bayesian weighted rating rather than the `popularity` column. The engineer first picked `popularity` for its "what is trending now" feel, then on seeing spec 0003's explicit warning (the score decays on TMDB's side and is meaningless for any row outside the current weekly refresh slice) moved to the weighted rating. `(v / (v + m)) * R + (m / (v + m)) * C` with `m` around 500 pulls a high average from a small sample back toward the catalog mean, so a 9.1 from 210 votes does not outrank an 8.4 from ninety thousand. The same formula ranks the onboarding deck, so a new user sees recognizable films.

The threshold is five qualifying positives, counted live rather than read from `taste_profile.based_on_count`. Five is enough for a non degenerate mean vector and is crossable in about a minute of swiping. The count is taken directly from `user_movie_interactions` with the same predicate spec 0002 uses for taste derivation (`reaction_type = 'like' or rating >= 3.5`), because `based_on_count` is written only by the debounced job and would lag the user's last swipe, bouncing them back into the deck right after they crossed the line. The engineer chose "no new column", and a live count delivers that without the race. It stays monotonic only because feature 7 has no surface that can lower the count; that assumption is written down as a Follow-up for feature 9.

The deck widens automatically instead of offering an early exit button. The engineer picked automatic widening: when the top query runs short, drop the vote count floor, then fall back to any embedded `active` movie. A user who mostly dislikes keeps getting cards until they produce five positives, and there is no second path (an "start anyway" button) to design and test.

Reasons are built from shared genre and keyword tags between a pick and the user's liked movies, intersected per pick, top three by frequency. The engineer chose the intersected form ("Because you like sci fi, slow burn") over a generic per user line. It needs no extra vector query: the liked set is small (capped at the hundred most recent) and its tag frequencies are aggregated in memory. An empty intersection falls to the user's single top tag; a user with no liked tags at all gets a fixed line. Feature 10 replaces all of this with generated prose.

On the model mismatch case, the engineer's choice conflicts with spec 0002 and this record says so plainly. Spec 0002's invariant is that the feed never ranks on a taste vector whose `embedding_model` disagrees with the catalog's current model, because cosine distance between vectors from different models is not meaningful. The engineer chose to rank on similarity anyway and log a warning. This is acceptable only under v1's conditions: there is exactly one embedding model, and the debounced job rewrites the profile's model string on the next swipe, so a mismatch self heals within seconds and only appears at all right after a deliberate model change. The moment an embedding model migration is real, this is wrong, and the Follow-up says a migration must force a recompute of every `taste_profile` before flipping the model key, or restore fallback on mismatch here. The safer choice would have been to treat a mismatch as a cold start and use the weighted rating fallback until the job re runs; that costs nothing in the common case and removes the conflict. The engineer should accept the tradeoff consciously: a brief window of similarity ranking on mixed model vectors after any future model change, in exchange for slightly simpler code now.

The build order follows Tracer Bullet: one swipe, then the event, then the taste vector, then a similarity feed with a reason, proven end to end before the deck selection, the widening ladder, the fallback, the gate, and the screens are thickened.
