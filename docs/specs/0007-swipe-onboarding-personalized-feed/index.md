# 0007. Swipe onboarding and personalized feed

**Date**: 2026-09-07
**Status**: Proposed

## Summary

This is the walking skeleton of Slice 1: a signed in user swipes a starter deck of movies, crosses an "enough to start" line, and lands on a feed ranked to their taste with a short reason under every pick. It adds no database table, no column, and no environment variable. It reuses the schema from spec 0002 (the `user_movie_interactions` and `taste_profile` tables) and the catalog from spec 0003 (movie embeddings, the HNSW similarity index, and the TMDB rating columns). It owns the four things spec 0002 handed to this feature: the start threshold, the ranking algorithm, the popularity style fallback used before a taste vector exists, and the tuning of the similarity search. The feed ranks by meaning similarity (cosine distance between the user's taste vector and each movie's vector); when there is no usable taste vector yet it ranks by a stable weighted rating instead, so the feed is never empty. A small background job keeps the taste vector current a few seconds after each swipe.

## Requirements

**User stories**:
- As a new signed in user, I want to swipe through a starter set of movies so the app learns my taste without me filling in a form.
- As a new signed in user, I want to reach a personalized feed quickly, not swipe forever.
- As a signed in user, I want every feed pick to show why it was chosen so the recommendations feel accountable.
- As a signed in user, I want the deck and the feed to keep working when they are loading or when I have run out of movies.
- As the system, I want the taste vector recomputed off the request path so recording a swipe stays fast.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An authenticated user with fewer than `ONBOARDING_THRESHOLD` (5) qualifying positive signals (a `user_movie_interactions` row where `reaction_type = 'like'` or `rating >= 3.5`) is redirected to `/onboarding` on any `(app)` route; a user at or above 5 who requests `/onboarding` is redirected to `/feed`. The gate is a live `count(*)` on `user_movie_interactions`, not a read of `taste_profile.based_on_count`.
- **AC-2**: `/onboarding` serves a deck of `DECK_BATCH_SIZE` (10) movies from `movies` where `tmdb_status = 'active'`, ranked by the Bayesian weighted rating `(v / (v + m)) * R + (m / (v + m)) * C` (`R` = `vote_average`, `v` = `vote_count`, `m` = `WEIGHTED_RATING_PRIOR_M`, `C` = `CATALOG_MEAN_RATING_C`) and spread across primary genres, excluding every movie the user already has a `user_movie_interactions` row for. The next batch is fetched, with the same exclusion, when `DECK_REFETCH_AT` (3) cards remain.
- **AC-3**: The deck does not dead end before the threshold. When the primary query returns fewer than `DECK_BATCH_SIZE` rows it widens in a fixed order (vote count floor `DECK_MIN_VOTE_COUNT`, then the catalog `MIN_VOTE_COUNT` from spec 0003, then any `active` movie with an embedding), so a user who mostly dislikes still receives cards until they reach 5 positives.
- **AC-4**: Each reaction from spec 0005's `SwipeCard` (drag past threshold, on screen button, or arrow key) calls `recordReaction(movieId, reaction)`, which upserts one `user_movie_interactions` row through the shared helper in `src/db/interactions.ts` with `source = 'swipe'` and `reaction_type` set, never creating a second row for the same `(user, movie)`. The action returns the updated qualifying positive count and whether onboarding is now complete.
- **AC-5**: Every `recordReaction` that resolves successfully sends exactly one `feed/taste.recompute.requested` event for that user, from the action body and never from inside an Inngest step. Reactions within `TASTE_DEBOUNCE_WINDOW` (10s) coalesce to a single `feed-recompute-taste` run per user, using Inngest `debounce` keyed on the user id.
- **AC-6**: `feed-recompute-taste` upserts the user's `taste_profile` row (on `user_id`) with `embedding` set to the L2 normalized per dimension mean of `movies.embedding` over the user's qualifying positive movies that have a non null embedding, `based_on_count` set to the size of that set, `embedding_model` set to `EMBEDDING_MODEL_KEY` from `src/lib/ai/registry.ts`, and `last_computed_at` set to `now()`. If that set is empty it writes nothing and leaves `embedding` null. It runs as `app_inngest` on the unpooled connection via `asInngest` (spec 0003).
- **AC-7**: `/feed` shows up to `FEED_SIZE` (20) movies ranked by cosine distance between `taste_profile.embedding` and `movies.embedding`, querying the HNSW index with `hnsw.ef_search` set to `HNSW_EF_SEARCH` (100) for that statement and over fetching `FEED_CANDIDATE_COUNT` (100) candidates, then removing every movie the user has a `seen`, `skip`, or `dislike` reaction on, a non null `dismissed_at` for, or a `watchlist_items` row for, then taking the top 20.
- **AC-8**: When `taste_profile.embedding` is null, `based_on_count` is 0, or the similarity query yields fewer than `FEED_SIZE` movies after exclusion, `/feed` ranks by the same Bayesian weighted rating as the deck, over the same exclusion set, and marks those picks `mode = 'fallback'`. A user with any unreacted `active` movie remaining never sees an empty feed.
- **AC-9**: Each feed pick carries a reason string built by a pure function: the top `REASON_MAX_TAGS` (3) tags shared between the pick's `genres` and `keywords` and the frequency ranked tags of the user's liked movies (sampled at the `REASON_LIKED_SAMPLE`, 100, most recent), phrased "Because you like X, Y, Z"; an empty intersection uses the user's single most frequent liked tag; no liked tag data at all uses `REASON_COLD_TEXT`.
- **AC-10**: Crossing the threshold on a swipe shows a brief "you are all set" confirmation with a control that navigates to `/feed`. `/onboarding` is not re-enterable afterward (AC-1 redirects). Feature 7 exposes no way to change or remove an existing reaction, so the derived qualifying positive count cannot decrease within this feature.
- **AC-11**: Both screens handle empty and loading states and stay keyboard operable. The deck shows a loading state while a batch loads and an end state only if the catalog is genuinely exhausted. The feed shows a loading state during ranking and the `EmptyState` component (spec 0005) only when no `active` unreacted movie remains. `SwipeCard` keyboard and reduce motion behavior from spec 0005 is preserved, and the feed's stacked cards are focusable and reachable.
- **AC-12**: The deck and feed reads are per user and run at request time (after `connection()` from `next/server`, or inside a `<Suspense>` boundary), never wrapped in `'use cache'` (spec 0004 forbids caching per user data). They use the pooled request path Drizzle client; only `feed-recompute-taste` uses the unpooled `asInngest` client.
- **AC-13**: When `taste_profile.embedding_model` does not equal `EMBEDDING_MODEL_KEY`, `/feed` still ranks by similarity and logs one `warn` with `{ userId, profileModel, catalogModel }`. This is a deliberate override of spec 0002's invariant that the feed never ranks on a taste vector whose model disagrees with the catalog; see Consequences and Follow-up.

## Decision

**Chosen option**: Option 1: Stored taste vector mean, HNSW cosine similarity feed with a weighted rating fallback, stateless swipe deck, debounced Inngest recompute, templated tag overlap reasons.

Rank the feed by cosine distance between a stored per user taste vector (the L2 normalized mean of the user's liked movie embeddings, kept current by a debounced Inngest job) and each movie's embedding over the HNSW index, over fetching candidates and applying the per user exclusion after retrieval; fall back to a Bayesian weighted rating whenever a usable taste vector is absent; serve the onboarding deck as a stateless weighted rating query with genre spread that excludes already reacted movies and widens when short; unlock the feed at five qualifying positive signals, derived from a live count with no schema change; and attach a reason built from the genre and keyword tags a pick shares with the user's liked movies.

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `inngest-durable-functions` (`inngest/inngest-skills`, `.agents/skills/inngest-durable-functions/`) · `inngest-flow-control` (`inngest/inngest-skills`, `.agents/skills/inngest-flow-control/`) · `ai-sdk` (`vercel/ai`, `.agents/skills/ai-sdk/`) · `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) · `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`)

## Rationale

Reasoning, options considered, and context: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no migration. This feature adds no entity, column, index, or environment variable. It reads and writes tables fixed by spec 0002 and extended by spec 0003:

- **`user_movie_interactions`** (spec 0002): written by `recordReaction` through `src/db/interactions.ts` with `source = 'swipe'`, `reaction_type` in (`like`, `dislike`, `seen`, `skip`), `rating` null. Read by the deck (exclusion), the onboarding gate (the qualifying positive count), the feed (exclusion), the taste job (the qualifying positive set), and the reason builder (the liked set joined to `movies`).
- **`taste_profile`** (spec 0002): this feature is the first writer of `embedding`, `based_on_count`, `embedding_model`, and `last_computed_at`. Only `feed-recompute-taste` writes it. Read by the feed to choose the ranking mode and as the query vector.
- **`movies`** (spec 0003): read only. `embedding` and `embedding_model` for similarity; `vote_average`, `vote_count`, `genres`, `keywords`, `tmdb_status`, `title`, `release_year`, `poster_path` for the deck, the fallback, and the reason.
- **`watchlist_items`** (spec 0002): read only, part of the feed exclusion set.

The qualifying positive predicate is `reaction_type = 'like' or rating >= 3.5`, identical to spec 0002's taste derivation predicate; `3.5` lives in config as `POSITIVE_RATING_THRESHOLD`.

**State transitions**:

Onboarding status is derived, never stored:

```
not started   (0 qualifying positives)
  -> in progress  (1 to ONBOARDING_THRESHOLD - 1 qualifying positives)
  -> complete     (>= ONBOARDING_THRESHOLD qualifying positives)
```

The transition to `complete` is one way in practice: no feature 7 surface can lower a user's qualifying positive count (there is no un like, no re rate, no dismiss here), so once the gate opens it stays open. Feature 9's dismiss action and any later re rating surface must revisit this (Follow-up).

Feed ranking mode per request:

```
personalized   taste_profile.embedding is not null AND based_on_count > 0
               AND the similarity query returns >= FEED_SIZE after exclusion
fallback       otherwise (also the model mismatch case still ranks by similarity, AC-13,
               but is tagged personalized)
```

**API surface**:

| Entry point | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getOnboardingDeck()` | server function, `src/features/feed/deck.ts`, pooled client, request time only | session user (implicit) | `DeckMovie[]` of `DECK_BATCH_SIZE` (`id`, `tmdbId`, `title`, `releaseYear`, `posterPath`, `genres`) | authenticated | none; a DB error propagates uncaught to the caller |
| `recordReaction(input)` | Server Action, `src/features/feed/actions.ts` | `movieId: uuid` (req), `reaction: 'like' \| 'dislike' \| 'seen' \| 'skip'` (req) | `Result<{ qualifyingPositives: number, onboardingComplete: boolean }>` | authenticated, self only | invalid `reaction` or unknown `movieId` returns a `Result` error; unauthenticated is rejected before the write |
| `getFeed()` | server function, `src/features/feed/ranking.ts`, pooled client, request time only | session user (implicit) | `FeedPick[]` up to `FEED_SIZE` (movie fields, `reason: string`, `mode: 'personalized' \| 'fallback'`) | authenticated | none; a DB error propagates uncaught |
| `/onboarding` | App Router page, `(app)` group | session | the swipe deck screen | authenticated; redirects to `/feed` when complete | redirect only |
| `/feed` | App Router page, `(app)` group | session | the stacked feed screen | authenticated; redirects to `/onboarding` when not complete | redirect only |
| `(app)/layout.tsx` gate | server component | session user | a redirect or the child tree | authenticated | redirect only |
| `feed/taste.recompute.requested` | Inngest event, sent by `recordReaction` | `{ userId: uuid }` | none | internal (signed event) | none |
| `feed-recompute-taste` | Inngest function, `src/features/feed/functions/recompute-taste.ts`, `asInngest` unpooled client, `app_inngest` role | the debounced event | writes one `taste_profile` row | Inngest signature at `/api/inngest` | empty qualifying set: no write, function returns |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| gate (AC-1) | session user id | feature 6's auth helper (spec 0006, dependency); until it lands, an injected id in tests |
| gate (AC-1) | qualifying positive count | `count(*) from user_movie_interactions where user_id = $me and (reaction_type = 'like' or rating >= 3.5)` |
| gate (AC-1) | `onboardingComplete` | that count `>= ONBOARDING_THRESHOLD` (`feed.config.ts`) |
| deck (AC-2) | ranking score | `(v / (v + m)) * R + (m / (v + m)) * C` with `R = movies.vote_average`, `v = movies.vote_count`, `m = WEIGHTED_RATING_PRIOR_M`, `C = CATALOG_MEAN_RATING_C` (both `feed.config.ts`) |
| deck (AC-2) | genre spread bucket | `movies.genres[0]` (primary genre), round robin across buckets in `deck.ts` |
| deck (AC-2) | exclusion set | `user_movie_interactions` rows for `$me` (any reaction) |
| deck (AC-3) | widening trigger and ladder | returned row count vs `DECK_BATCH_SIZE`; floors `DECK_MIN_VOTE_COUNT` then `MIN_VOTE_COUNT` (spec 0003 `catalog.config.ts`) then none, in `deck.ts` |
| `recordReaction` (AC-4) | written row | `src/db/interactions.ts` upsert helper (spec 0002), `source = 'swipe'`, `reaction_type = input.reaction`, `rating = null` |
| `recordReaction` (AC-4) | returned count | the same qualifying positive `count(*)` as the gate, read after the upsert |
| `recordReaction` (AC-5) | recompute trigger | `inngest.send('feed/taste.recompute.requested', { data: { userId: $me } })` after the upsert resolves, in the action body |
| `feed-recompute-taste` (AC-6) | qualifying positive movie set | `movies` joined to `user_movie_interactions` for `userId` where the qualifying predicate holds and `movies.embedding is not null` |
| `feed-recompute-taste` (AC-6) | taste vector | per dimension arithmetic mean of that set's `movies.embedding`, then L2 normalized, computed in the function |
| `feed-recompute-taste` (AC-6) | `based_on_count` | the size of that non null embedding set |
| `feed-recompute-taste` (AC-6) | `embedding_model` | `EMBEDDING_MODEL_KEY` from `src/lib/ai/registry.ts` |
| feed (AC-7) | candidate ranking | `movies.embedding <=> taste_profile.embedding` (cosine distance), `SET LOCAL hnsw.ef_search = HNSW_EF_SEARCH`, `LIMIT FEED_CANDIDATE_COUNT` |
| feed (AC-7) | exclusion set | `user_movie_interactions` for `$me` where `reaction_type in ('seen','skip','dislike')` or `dismissed_at is not null`, plus `watchlist_items` for `$me` (spec 0002 Value sourcing for feature 7) |
| feed (AC-7) | final list | top `FEED_SIZE` of the candidates surviving exclusion |
| feed (AC-8) | fallback ranking | the deck's Bayesian weighted rating over `active` movies, same exclusion set |
| feed (AC-8) | `mode` flag | set in `getFeed`: `'fallback'` on the fallback path, else `'personalized'` |
| reason (AC-9) | liked tag frequency map | `genres` and `keywords` of `movies` joined to the user's qualifying positive `user_movie_interactions`, capped at `REASON_LIKED_SAMPLE` most recent by `user_movie_interactions.created_at` |
| reason (AC-9) | shared tags | intersection of the pick's `genres` + `keywords` with that map, top `REASON_MAX_TAGS` by frequency (genres before keywords on a tie, then alphabetical) |
| reason (AC-9) | cold text | `REASON_COLD_TEXT` (`feed.config.ts`) when no shared tag and no liked tag exists |
| feed (AC-13) | model mismatch log | compare `taste_profile.embedding_model` to `EMBEDDING_MODEL_KEY`; on inequality `logger.warn({ userId, profileModel, catalogModel })` and continue |

**Key invariants**:
- One `user_movie_interactions` row per `(user, movie)`; every write goes through `src/db/interactions.ts` (spec 0002 upsert semantics), never a blind insert.
- `taste_profile` is written only by `feed-recompute-taste`, and `embedding`, `based_on_count`, `embedding_model`, `last_computed_at` are written together in one upsert.
- The taste vector is the L2 normalized mean of the user's qualifying positive movie embeddings that are non null; a user with zero such embeddings keeps `taste_profile.embedding` null.
- The onboarding gate and `recordReaction` both compute the qualifying positive count with the exact predicate `reaction_type = 'like' or rating >= 3.5`.
- The feed is never empty for a user with an unreacted `active` movie remaining: the fallback path guarantees it.
- The feed exclusion set is `seen` + `skip` + `dislike` + `dismissed_at is not null` + watchlisted. `like` is deliberately not excluded (spec 0002), so a liked but unseen movie can appear in the feed.
- Deck and feed reads never carry `'use cache'` and never take a cached path; they run at request time on the pooled client. Only the taste job uses the unpooled `asInngest` client.
- `feed/taste.recompute.requested` is sent from the `recordReaction` body, not from inside a `step.run` (a send inside a step is memoized and would not refire on retry).
- The qualifying positive count cannot decrease through any feature 7 surface, so the derived onboarding status is monotonic here.

**Security model**:
- Every entry point is authenticated. The session user id comes from feature 6 (spec 0006, still `Proposed`); this feature depends on it and on the request path connecting as `app_user` with `app.user_id` set. Stated as a constraint, not built here.
- Every read and the reaction write are scoped `where user_id = $me`. Forced row level security on `user_movie_interactions`, `taste_profile`, and `watchlist_items` (spec 0002) is the backstop; the explicit predicate is the primary control.
- `recordReaction` writes only the caller's own row. `movieId` is checked against `movies.id` for a clean `Result` error; the foreign key is the hard guarantee.
- `feed-recompute-taste` runs as `app_inngest` on the unpooled connection, reads `movies.embedding` and one user's interactions, writes only that user's `taste_profile`. It is signature verified at `/api/inngest`.
- No rate limiting on `recordReaction`, the deck read, or the feed read: they are cheap authenticated Postgres operations with no paid provider call, bounded by one human's swipe rate. `usage_counters` (spec 0002) stays reserved for features that call a paid AI provider.
- No PII beyond the account itself and no compliance scope. Movie data is public.

**Configuration required**: no new environment variable. One new file, `src/features/feed/feed.config.ts`, holds the typed knobs (starting values are the recommended defaults, tune them here):

- `ONBOARDING_THRESHOLD` = 5 (qualifying positives that unlock the feed)
- `POSITIVE_RATING_THRESHOLD` = 3.5 (the `rating >=` half of the qualifying predicate; matches spec 0002)
- `DECK_BATCH_SIZE` = 10
- `DECK_REFETCH_AT` = 3
- `DECK_MIN_VOTE_COUNT` = 1000 (the deck's own vote count floor, above the catalog `MIN_VOTE_COUNT` of 200)
- `WEIGHTED_RATING_PRIOR_M` = 500 (the prior weight `m` in the Bayesian weighted rating)
- `CATALOG_MEAN_RATING_C` = 6.6 (seed value; recompute from the seeded catalog and commit the real number, see Build plan)
- `FEED_SIZE` = 20
- `FEED_CANDIDATE_COUNT` = 100 (similarity over fetch before exclusion)
- `HNSW_EF_SEARCH` = 100 (`SET LOCAL hnsw.ef_search` per feed query)
- `TASTE_DEBOUNCE_WINDOW` = `"10s"`
- `REASON_MAX_TAGS` = 3
- `REASON_LIKED_SAMPLE` = 100 (most recent liked movies scanned for the tag frequency map)
- `REASON_COLD_TEXT` = `"Picked to match your taste"`

The `feed/taste.recompute.requested` event is added to the typed `EventSchemas` in `src/lib/inngest/client.ts` (spec 0003).

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path: a fresh user swipes five likes on the deck; after `feed-recompute-taste` drains, `/feed` returns up to 20 similarity ranked movies, none of them reacted to, each with a "Because you like ..." reason. Verifies **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**.
- Cold start: immediately after the fifth like, before the job runs, `/feed` returns a full list marked `mode = 'fallback'` ranked by weighted rating; after the job writes the vector, a reload returns `mode = 'personalized'`. Verifies **AC-8**.
- Picky user: a user who dislikes 40 of the top deck movies still receives a next batch (the deck widens through its ladder) and never sees an end state before five positives. Verifies **AC-3**.
- Idempotent reaction: swiping the same card twice (or a double fire) results in one `user_movie_interactions` row, and the second `recordReaction` returns the same count. Verifies **AC-4**.
- Debounce: ten swipes in four seconds produce exactly one `feed-recompute-taste` run for that user. Verifies **AC-5**.
- Empty taste set: a user with five `dislike` reactions and zero positives has `taste_profile.embedding` null after the job, and `/feed` stays on the fallback. Verifies **AC-6**, **AC-8**.
- Model mismatch: with `taste_profile.embedding_model` set to a stale value, `/feed` still returns similarity ranked picks and emits one `warn`. Verifies **AC-13**.
- Gate and permission: an unauthenticated request to `/feed` or `/onboarding` is rejected by the auth layer; an authenticated user below threshold hitting `/feed` is redirected to `/onboarding`, and above threshold hitting `/onboarding` is redirected to `/feed`. Verifies **AC-1**.
- States and keyboard: the deck shows a loading state between batches and the feed shows a loading state then either stacked cards or the `EmptyState`; `SwipeCard` arrow keys and reduce motion still work; the feed cards are focusable. Verifies **AC-11**.
- Caching: a review confirms `getFeed` and `getOnboardingDeck` carry no `'use cache'` directive and run after `connection()` or inside `<Suspense>`, on the pooled client. Verifies **AC-12**.

## Build plan

Ordered by the project's Tracer Bullet approach: stand up one thin thread (a single swipe, then the event, then the taste vector, then a similarity feed with a reason) before thickening each segment. No migration: the schema is spec 0002.

1. **Feature scaffold and config.** Create `src/features/feed/` with `feed.config.ts` (all knobs above, `CATALOG_MEAN_RATING_C` as the seed constant). Add `feed/taste.recompute.requested` (`{ userId: string }`) to the typed `EventSchemas` in `src/lib/inngest/client.ts`. Groundwork for **AC-4**, **AC-5**.
2. **Thin thread, record one reaction.** `recordReaction` Server Action in `actions.ts`: validate the input, upsert via `src/db/interactions.ts` with `source = 'swipe'`, send `feed/taste.recompute.requested` after the upsert resolves (in the body, not a step), return `{ qualifyingPositives, onboardingComplete }` from a live count. Satisfies **AC-4**, and the send half of **AC-5**.
3. **Thin thread, taste recompute job.** `feed-recompute-taste` in `functions/recompute-taste.ts` with `debounce: { key: 'event.data.userId', period: TASTE_DEBOUNCE_WINDOW }`, registered at `/api/inngest`. As `app_inngest` on the unpooled client: read the qualifying positive movies with a non null embedding, compute the per dimension mean, L2 normalize, upsert `taste_profile` (all four columns), skip the write on an empty set. Log `{ userId, likedCount, dims, durationMs }`. Drive it once from a real swipe. Satisfies the coalesce half of **AC-5**, and **AC-6**.
4. **Thin thread, personalized feed and reason.** `getFeed` in `ranking.ts`: `SET LOCAL hnsw.ef_search`, the cosine distance candidate query at `FEED_CANDIDATE_COUNT`, the exclusion filter, the top `FEED_SIZE`. `reason.ts`: the pure tag frequency map, the intersection with the pick, the top `REASON_MAX_TAGS`, the single tag and cold text fallbacks. Return picks with `reason` and `mode = 'personalized'`. Prove the full thread: five swipes, job runs, `/feed` returns similarity ranked picks each with a reason. Satisfies **AC-7**, **AC-9**.
5. **Fallback ranking.** Add the Bayesian weighted rating path to `ranking.ts`, used when `embedding` is null, `based_on_count` is 0, or fewer than `FEED_SIZE` survive exclusion; same exclusion set; `mode = 'fallback'`. Compute the real `CATALOG_MEAN_RATING_C` from the seeded catalog and commit it to `feed.config.ts`. Satisfies **AC-8**.
6. **Model mismatch branch.** In `getFeed`, when `taste_profile.embedding_model !== EMBEDDING_MODEL_KEY`, continue on the similarity path and emit one `warn`. Satisfies **AC-13**.
7. **Onboarding deck and widening.** `deck.ts`: the weighted rating ranking with primary genre round robin spread, exclusion of every reacted movie, batches of `DECK_BATCH_SIZE`; the widening ladder when a query returns short. Satisfies **AC-2**, **AC-3**.
8. **Route group gate and screens.** `(app)/layout.tsx` server component: the live qualifying positive count, redirect between `/onboarding` and `/feed`. Build `/onboarding` (the `SwipeCard` deck with four buttons and a progress indicator, refetch at `DECK_REFETCH_AT`, loading and end states) and rebuild `/feed` (stacked `FeedCard`s: `Poster` plus title, year, and the reason inline; loading state; `EmptyState`). All reads after `connection()`, pooled client, no `'use cache'`. Satisfies **AC-1**, **AC-11**, **AC-12**.
9. **Threshold transition.** When `recordReaction` returns `onboardingComplete: true`, show the brief "you are all set" confirmation with a "See my feed" control that routes to `/feed`. Satisfies **AC-10**.
10. **Tests and verify.md.** Vitest for the pure pieces (weighted rating, reason tag aggregation and intersection and both fallbacks, deck genre spread ordering, mean and normalize). Integration for `recordReaction` (idempotent upsert, one event, count returned), `feed-recompute-taste` (mean correctness, empty set skip), `getFeed` (exclusion correctness, fallback trigger, mismatch warn). A `/check verify` browser pass for the deck to threshold to feed thread and for keyboard and reduce motion. Write `docs/specs/0007-swipe-onboarding-personalized-feed/verify.md` mapping AC-1 through AC-13. Verifies every AC.

## Consequences

**Positive**:
- The whole Slice 1 thread (sign in, swipe, personalized feed with a reason) works end to end on one feature with no migration. Later strands extend mechanisms this feature stands up: feature 9 reuses the exclusion filter and the similarity query, feature 10 replaces the templated reason, feature 11 reuses the cosine distance primitive.
- Feed ranking and vibe search share one primitive, cosine distance over the HNSW index with an over fetch and a post retrieval exclusion, exactly as spec 0002 intended.
- Cold start, sparse likes, an empty taste set, and a genuinely small candidate pool all degrade to the same weighted rating fallback, so there is one fallback path to reason about and the feed is always populated.
- No schema change, no environment variable, no new external tool. The taste job is the first writer of `taste_profile` columns that spec 0002 already defined.

**Negative / tradeoffs**:
- **Conflict with spec 0002 (Accepted).** AC-13 ranks on similarity even when `taste_profile.embedding_model` disagrees with the catalog's current model, which spec 0002's invariants explicitly forbid. Accepted for now because there is a single embedding model in v1 and the debounced job rewrites the profile's model on the very next swipe, so the exposure is a short window right after a deliberate model change. It becomes wrong the moment an embedding model migration is real. See Follow-up.
- The onboarding gate runs a live `count(*)` on `user_movie_interactions` on every `(app)` navigation. Cheap at this scale (indexed on `user_id`, a few rows per user) but it is uncached per request work, and it is only monotonic because feature 7 has no un like surface.
- The taste vector is a stored derived value, against the general "compute at read time" rule. It is unavoidable: a 1536 dimension mean over a user's likes plus an HNSW query on every feed view is the cost the stored vector removes, and spec 0002 already chose this shape.
- Genre spread keys only on `movies.genres[0]`, so secondary genres do not affect deck balance; a catalog skewed toward one first listed genre still skews the deck.
- `CATALOG_MEAN_RATING_C` is a hand maintained constant. A material shift in the catalog's rating distribution after a large refresh makes the weighted rating ordering drift until someone recomputes it.
- The feed exclusion runs after the vector search, so as a user's history grows more candidates are dropped post retrieval. `FEED_CANDIDATE_COUNT` and `HNSW_EF_SEARCH` are guesses that need tuning against a real catalog and real histories (carried from spec 0002 and 0003).
- A liked but unseen movie stays eligible in the feed (spec 0002's exclusion list omits `like`), so a user can be recommended a film they swiped right on during onboarding.
- Templated reasons depend on TMDB keyword coverage; a pick with sparse keywords and no genre overlap with the user's likes falls to the single tag or cold text, which reads as generic.

**Neutral**:
- Depends on feature 6 (spec 0006, still `Proposed`) for the session user id and for the request path connecting as `app_user`. Feature 7 cannot be verified end to end until feature 6 lands; until then the reads take an injected user id in tests.
- Reuses spec 0003's `asInngest` unpooled client and `app_inngest` role for the job, and spec 0002's `src/db/interactions.ts` upsert helper for the write. No new infrastructure pattern.
- New conventions for this area (feed and deck reads are per user, uncached, request time, pooled client; the taste job is the sole `taste_profile` writer) belong in a nested `src/features/feed/AGENTS.md` (Follow-up).
- `cacheComponents` is on (spec 0004), so `/feed` and `/onboarding` use `connection()` or `<Suspense>` rather than the old route segment config, consistent with spec 0004's own changes.

## Follow-up

- [ ] AC-13 overrides spec 0002's Accepted invariant that the feed never ranks on a taste vector whose `embedding_model` disagrees with the catalog. Before any real embedding model migration (feature 10, or a catalog re embed), reconcile the two specs: either force a recompute of every `taste_profile` before flipping `EMBEDDING_MODEL_KEY`, or restore fallback on mismatch here.
- [ ] `HNSW_EF_SEARCH` and `FEED_CANDIDATE_COUNT` are unvalidated defaults. Tune them against the seeded catalog and realistic interaction histories once feature 6 makes real users possible (carried from spec 0002 and spec 0003).
- [ ] Recompute `CATALOG_MEAN_RATING_C` from the catalog after the feature 4 seed backfill completes and commit the real value; revisit it after large weekly refreshes.
- [ ] Feed and deck conventions are not yet in an `AGENTS.md`. Add a nested `src/features/feed/AGENTS.md` before feature 9 or feature 11 build on this feature.
- [ ] The onboarding gate is monotonic only because feature 7 has no un like surface. Feature 9's dismiss and any future re rating flow must decide whether dropping back below `ONBOARDING_THRESHOLD` should route a user back to `/onboarding`.
- [ ] Feature 8 (Letterboxd CSV import) also writes qualifying positives (`source = 'letterboxd_import'`). It should send the same `feed/taste.recompute.requested` event, and its rows count toward the same onboarding gate, which lets an importer skip the swipe deck entirely (the intended faster path).
- [ ] `like` is not in the feed exclusion set (spec 0002). Decide with feature 9 whether a liked but unseen movie should be suppressed from the feed or kept as a recommendation.
- [ ] TMDB attribution (spec 0003) still needs a home; the feed and onboarding screens are concrete surfaces where it could sit.
