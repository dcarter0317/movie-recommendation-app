## Context

Feature 3 (Data model) is the last foundation piece before any user facing slice can be built. Every later feature in the scope (accounts, swipe onboarding, the feed, Letterboxd import, feed feedback, generated reasons, vibe search, watchlist) reads or writes the same handful of concepts: what a user thinks of a movie (a swipe or a star rating), a summary of a user's taste, a cached explanation for a pick, and a saved list. Spec 0001 already fixed the database (Supabase Postgres), the data access library (Drizzle), the vector extension (pgvector) for search, the row level security backstop pattern, the `users` and `movies` table shapes, and the `usage_counters` table for quota enforcement; this spec is scoped to the entities spec 0001 left open.

The scope's own bar for this feature is explicit: "entities and relationships support onboarding, feed generation, CSV import, feedback, and watchlist without a breaking migration." Because the project's build approach is Tracer Bullet (prove one thin real thread through every layer first, then thicken), the schema itself should be designed whole, once, even though the behavior built on top of it lands in later slices. A schema that has to change shape mid build (adding a table, splitting a column) is a broken tracer bullet at the data layer.

Two forces shape the design directly. First, Letterboxd's CSV export uses a half star scale (0.5 to 5.0); whatever stores a rating must not force a lossy round trip through a different scale. Second, spec 0001's cost containment stance (AI generated reasons are cached, never generated inline; every AI calling action is quota limited) means this schema has to support "write once, read many" for anything AI produced, not "compute on every read."

## Options considered

### Option 1: Unified interaction table, one stored taste embedding

One `user_movie_interactions` table holds both swipe reactions and star ratings (a type discriminator plus nullable rating column), and one `taste_profile` row per user stores a pgvector embedding averaged from liked movies, recomputed by a debounced background job.

**Pros**:
- One table answers "everything a user has done with this movie"; the feed, taste recompute job, and import summary all query one place instead of joining two.
- The taste embedding reuses the exact pgvector primitive spec 0001 already fixed for vibe search, so feed ranking and vibe search share one comparison (cosine distance) instead of two different mechanisms.

**Cons**:
- The interaction row carries columns (`rating`, `reaction_type`) that are not both meaningful on every row, so a check constraint is needed to guarantee at least one is set.

### Option 2: Split reaction and rating tables, genre affinity taste profile

Separate `swipe_reactions` and `ratings` tables, plus a `taste_profile_genres` table keyed by `(user, genre)` with an explicit weight, built by counting liked genres.

**Pros**:
- Each table's columns are all meaningful, no nullable discriminator pattern.
- A genre affinity table is directly readable ("this user likes sci-fi at weight 0.8"), useful if a future feature wants an explainable, non embedding signal.

**Cons**:
- Every feed or taste query that needs "everything about this user and movie" has to join or union two tables, and a movie both swiped and later rated (a common Letterboxd import case) needs explicit reconciliation logic.
- A second signal (genre weights) has to be kept in sync with the embedding based vibe search; they can silently disagree.

### Option 3: Normalized tables, no stored taste profile

Fully split interaction tables as in Option 2, with taste computed fresh at feed request time from raw interaction rows rather than stored anywhere.

**Pros**:
- No background recompute job to write or debounce; one less moving part.
- No stale taste profile risk; it is always freshly derived.

**Cons**:
- Recomputing an embedding average over a growing set of rows on every feed request puts real work on the request path and gets slower as a user's history grows.
- Contradicts the project's own cost containment posture (spec 0001): request path work is exactly what the debounced Inngest job pattern exists to avoid.

## Rationale

Option 1 wins mainly because it reuses primitives spec 0001 already committed to rather than inventing new ones. The pgvector embedding column and cosine distance comparison are already the chosen mechanism for vibe search; using the same shape for the taste profile means feed ranking and vibe search are the same operation (compare an embedding to `movies.embedding`), not two different systems to build and reason about.

The unified interaction table follows from how the app actually uses this data: the feed, the taste recompute job, and the Letterboxd import summary all need "what does this user think of this movie" as a single lookup, and a user's own swipe-then-later-import path (swipe a movie during onboarding, later import a Letterboxd rating for the same title) is a normal flow, not an edge case, so one row that the later write upserts into is simpler than reconciling two tables.

Option 3's on-the-fly taste computation was rejected because it contradicts the cost containment stance spec 0001 already took (generated reasons precomputed and cached, never generated on the request path); computing an embedding average over a growing interaction history on every feed request is the same mistake in a different place.
