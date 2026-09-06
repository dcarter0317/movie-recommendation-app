# 0002. Data model

**Date**: 2026-09-06
**Status**: Proposed

## Summary

This spec fixes the core database schema every later feature builds on: how a user's swipes and star ratings are stored, how their taste is summarized for the feed and vibe search, how generated reasons and watchlist entries are kept, and how per user rate limits are enforced. It reuses the Postgres, Drizzle, and pgvector choices already fixed in spec 0001, and adds nothing new to the stack. Once this migration lands, features 6 through 12 (accounts, onboarding, import, feedback, generated reasons, vibe search, watchlist) build on it without needing a breaking schema change.

## Requirements

**User stories**:
- As a signed in user, I want my swipes and ratings remembered so the feed reflects my real taste.
- As a signed in user, I want a movie I mark "not interested" to stop showing up.
- As a signed in user, I want my watchlist and taste data gone if I delete my account.
- As the system, I need one place to check whether a user is over a rate limit before calling a paid AI provider.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: The schema records a swipe reaction (`like`, `dislike`, `seen`, `skip`) and a star rating (0.5 to 5.0) for any `(user, movie)` pair in one row; a later write to the same pair updates that row rather than creating a duplicate.
- **AC-2**: The schema records a feed dismissal ("not interested") as a permanent, per `(user, movie)` suppression a feed query can filter on.
- **AC-3**: The schema stores one taste profile embedding per user, updated by a background job, never recomputed inline on the request that recorded the triggering interaction.
- **AC-4**: The schema caches one reason per `(user, movie)`, tagged as `generated` or `templated`, so a reason is never generated on the request path during a render.
- **AC-5**: The schema supports adding and removing watchlist entries per `(user, movie)`, with no history kept after a removal.
- **AC-6**: Every user owned table enforces row level security, so a query missing a `where` clause returns no rows for another user.
- **AC-7**: Deleting a user's account cascades to remove all of that user's interactions, taste profile, reasons, and watchlist entries.
- **AC-8**: The full schema, its row level security policies, and its indexes apply together as one migration set generated from `schema.ts` in a single `drizzle-kit generate` run; no feature from 6 through 12, as scoped today, needs a breaking schema change to build on it.
- **AC-9**: A Letterboxd CSV import can write a rating using the exact 0.5 to 5.0 decimal scale, with no lossy conversion.
- **AC-10**: `usage_counters` enforces the per user quotas fixed in spec 0001 (vibe search 30 per hour, reason regeneration 50 per day, Letterboxd import 3 per day) with an atomic increment, so two concurrent requests cannot both slip under the limit.

## Decision

**Chosen option**: Option 1: Unified interaction table, one stored taste embedding.

Build one `user_movie_interactions` table for both reactions and ratings, one `taste_profile` row per user with a pgvector embedding kept current by a debounced Inngest job, a `reasons` cache table, a `watchlist_items` table, and the `usage_counters` table already fixed in spec 0001, plus RLS on every user owned table, enforced by a dedicated non owner `app_user` database role (the request path's actual connection role, not the table owning role, since Postgres exempts an owner from its own RLS policies unless forced).

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`.agents/skills/supabase-postgres-best-practices/`)

## Feature design

**Data model sketch**:

- **users** (fixed by spec 0001): `id` uuid pk (`gen_random_uuid()`) · `clerk_user_id` text unique not null · `created_at`, `updated_at` timestamptz not null, default `now()`
- **movies** (fixed by spec 0001, extended here): `id` uuid pk · `tmdb_id` integer unique not null · `title` text not null · `release_year` integer nullable · `overview` text nullable · `genres` text[] not null default `{}` · `keywords` text[] not null default `{}` · `cast_members` jsonb not null default `[]` (name + character, top 5, validated by a Zod schema at the TMDB import boundary) · `poster_path` text nullable · `embedding` vector(1536) nullable · `embedding_model` text nullable · `embedded_at` timestamptz nullable · `created_at`, `updated_at` timestamptz not null, default `now()`
- **user_movie_interactions**: primary key `(user_id, movie_id)`, no surrogate id (the natural key is the only key anything ever looks this table up by) · `user_id` uuid fk → users.id, on delete cascade, not null · `movie_id` uuid fk → movies.id, on delete cascade, not null · `reaction_type` enum (`like`, `dislike`, `seen`, `skip`) nullable · `rating` numeric(2,1) nullable, check `rating between 0.5 and 5.0 and rating * 2 = trunc(rating * 2)` (enforces the exact half star scale, not just the range; Drizzle's numeric mode set to `"number"` so it reads back as a JS number, not a string) · `dismissed_at` timestamptz nullable, monotonic: once set by a feed dismissal, never cleared by a later write · `source` text not null, check `source in ('swipe', 'letterboxd_import', 'manual_rating')` (`text` + check, not a Postgres enum, since this is the value most likely to grow, e.g. a future import source, and `ALTER TYPE … ADD VALUE` is a migration hazard a `CHECK` constraint does not have) · `created_at` timestamptz not null default `now()` · `updated_at` timestamptz not null, maintained by a `BEFORE UPDATE` trigger (not Drizzle's `$onUpdate`, which does not fire on the `ON CONFLICT DO UPDATE` path this table relies on) · check `reaction_type is not null or rating is not null or dismissed_at is not null` (a row must express something)
- **taste_profile**: primary key `user_id` uuid, fk → users.id, on delete cascade · `embedding` vector(1536) nullable (until first computed) · `embedding_model` text nullable (mirrors `movies.embedding_model` so a model change is detectable and a mismatch between a stale profile and re embedded movies never silently ranks on incompatible vectors) · `based_on_count` integer not null default 0 (count of interactions folded into the current average: `reaction_type = 'like'` or `rating >= 3.5`) · `last_computed_at` timestamptz nullable
- **reasons**: primary key `(user_id, movie_id)`, no surrogate id · `user_id` uuid fk → users.id, on delete cascade, not null · `movie_id` uuid fk → movies.id, on delete cascade, not null · `reason_text` text not null · `source` enum (`generated`, `templated`) not null · `model` text nullable (the model id from the `src/lib/ai` registry, spec 0001) · `prompt_version` text nullable · `based_on_count` integer nullable (a snapshot of `taste_profile.based_on_count` at generation time, so staleness is detectable later) · `generated_at` timestamptz not null default `now()`
- **watchlist_items**: primary key `(user_id, movie_id)`, no surrogate id · `user_id` uuid fk → users.id, on delete cascade, not null · `movie_id` uuid fk → movies.id, on delete cascade, not null · `added_at` timestamptz not null default `now()`
- **usage_counters** (fixed by spec 0001): `user_id` uuid fk → users.id, on delete cascade, not null · `resource` text not null, check `resource in ('vibe_search', 'reason_regeneration', 'letterboxd_import')` · `window_start` timestamptz not null, a tumbling UTC window (`date_trunc('hour', now() at time zone 'utc')` for `vibe_search`, `date_trunc('day', …)` for the daily resources) · `count` integer not null default 0 · pk `(user_id, resource, window_start)`

**Indexes**: HNSW on `movies.embedding` (`vector_cosine_ops`, fixed by spec 0001), created after the initial catalog bulk load completes, not before (building it incrementally during a large import is substantially slower) · GIN on `movies.genres` and `movies.keywords` for filtered catalog queries · a partial index `(user_id) where dismissed_at is not null` on `user_movie_interactions` for the feed's exclusion filter · `(user_id, added_at desc)` on `watchlist_items` so "list newest first" does not sort at query time. No index needed on `taste_profile.embedding` (one row per user, it is the query vector, never the searched target).

**Upsert semantics** (the mechanism AC-1 depends on): every write to `user_movie_interactions` is a single statement, `insert … on conflict (user_id, movie_id) do update set …`, never a read then write. The `do update` clause resolves competing writes to `reaction_type`, `rating`, and `source` by provenance precedence (`manual_rating` > `letterboxd_import` > `swipe`, since a hand typed rating should not be silently clobbered by a re-run import), while `dismissed_at` merges as `coalesce(user_movie_interactions.dismissed_at, excluded.dismissed_at)` so it is monotonic regardless of precedence:

```sql
insert into user_movie_interactions (user_id, movie_id, reaction_type, rating, source, dismissed_at)
values (:user_id, :movie_id, :reaction_type, :rating, :source, :dismissed_at)
on conflict (user_id, movie_id) do update set
  reaction_type = case when source_rank(excluded.source) >= source_rank(user_movie_interactions.source)
                        then excluded.reaction_type else user_movie_interactions.reaction_type end,
  rating        = case when source_rank(excluded.source) >= source_rank(user_movie_interactions.source)
                        then excluded.rating else user_movie_interactions.rating end,
  source        = case when source_rank(excluded.source) >= source_rank(user_movie_interactions.source)
                        then excluded.source else user_movie_interactions.source end,
  dismissed_at  = coalesce(user_movie_interactions.dismissed_at, excluded.dismissed_at),
  updated_at    = now();
```

`source_rank` is a small `case` expression (`manual_rating` = 3, `letterboxd_import` = 2, `swipe` = 1), defined once as a SQL function or inlined identically at every call site.

**Taste profile derivation**: the debounced Inngest job (triggered by a `user_movie_interactions` write, coalesced per user over a short idle window, e.g. 10 seconds) recomputes `taste_profile.embedding` as the L2 renormalized mean of `movies.embedding` for every movie where `reaction_type = 'like'` or `rating >= 3.5`, and writes `based_on_count` as that set's size and `embedding_model` from the model actually used. **Cold start**: while `taste_profile.embedding is null` (every user before their first job run, and any user with zero qualifying interactions), the feed ranks by a popularity signal instead of embedding similarity; feature 7 owns exactly what that popularity signal is.

**State transitions**: not applicable, no entity here has a lifecycle beyond exists / does not exist.

**API surface**: none directly. This spec defines schema only; every Server Action and Route Handler that reads or writes these tables is designed by the feature that owns it (accounts, onboarding, feed, import, feedback, reasons, vibe search, watchlist).

**Value sourcing** (what later features will need from this schema, and where it comes from):
| Action (owned by a later feature) | Value needed | Source |
|---|---|---|
| Feed ranking (feature 7) | Similarity between a user's taste and a candidate movie | cosine distance between `taste_profile.embedding` and `movies.embedding` |
| Feed ranking (feature 7) | Movies to exclude (seen, skipped, disliked, dismissed, watchlisted) | `user_movie_interactions` rows for that `user_id` with `reaction_type` in (`seen`, `skip`, `dislike`) or `dismissed_at is not null`, plus `watchlist_items` |
| Generated reasons (feature 10) | The user's own likes/ratings to ground the reason text | `user_movie_interactions` rows with `rating` or `reaction_type = like`, joined to `movies` |
| Letterboxd import summary (feature 8) | Count of rows matched vs unmatched | computed at import time from the TMDB match result, not stored in this schema |
| Vibe search (feature 11) | A catalog embedding to compare a query embedding against | `movies.embedding` via the HNSW index |
| Any AI calling action (search, reason regeneration, import) | Whether the user is over their quota | a `usage_counters` row for `(user_id, resource, window_start)` |
| Feed ranking (feature 7), before the taste job has ever run | A ranking signal when `taste_profile.embedding is null` | a popularity signal feature 7 defines; this schema only guarantees the null case is detectable |
| Vibe search (feature 11) | Whether a dismissed movie is excluded from search results too, or only the feed | not decided by this spec; AC-2 covers the feed only, feature 11 decides its own scope and reads `dismissed_at` if it opts in |

**Key invariants**:
- Exactly one row per `(user_id, movie_id)` in `user_movie_interactions` (it is the primary key); a later write upserts per the **Upsert semantics** above, never inserts a duplicate.
- Every `user_movie_interactions` row sets `reaction_type`, `rating`, or `dismissed_at`; never all three null (check constraint).
- `rating`, when set, is between 0.5 and 5.0 in exact 0.5 increments (check constraint, not just a range check).
- `dismissed_at` is monotonic: once set, no later write clears it (enforced in the upsert's `do update` clause, not by a database constraint, since Postgres cannot express "never decreases to null" declaratively).
- Exactly one row per `(user_id, movie_id)` in `reasons` and in `watchlist_items` (both primary keys).
- Exactly one `taste_profile` row per user, created lazily on first interaction.
- `movies.tmdb_id` is unique, so re importing from TMDB is idempotent (fixed by spec 0001).
- Every foreign key to `users` cascades on delete (AC-7).
- `usage_counters` increments are atomic and increment-first: `insert … on conflict (user_id, resource, window_start) do update set count = usage_counters.count + 1 returning count`, then the caller rejects the action if the **returned** value exceeds the limit. A read-then-write check-then-increment is not sufficient here; it races under concurrent requests even inside one transaction (Postgres read committed does not serialize two overlapping check-then-increment sequences).

**Security model**:
- The request path connects as a dedicated, non owner `app_user` role (not the table owning role `drizzle-kit` migrates as), created with explicit `GRANT SELECT, INSERT, UPDATE, DELETE` on every user owned table and `GRANT SELECT` on `movies`. A table owner is exempt from its own row level security policies by default, so using the owner role for requests would make every policy below silently inert.
- Row level security is both **enabled and forced** (`ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `… FORCE ROW LEVEL SECURITY`) on every user owned table (`user_movie_interactions`, `taste_profile`, `reasons`, `watchlist_items`, `usage_counters`, and `users` itself), each with a `FOR ALL USING (…) WITH CHECK (…)` policy scoping to `user_id = nullif(current_setting('app.user_id', true), '') :: uuid` (or `id` for `users`). The `nullif(…, true)` form is required: a bare `current_setting('app.user_id')` raises a Postgres error on any connection that has not called `withUser` (an Inngest step, a health check), rather than returning no rows as spec 0001's "fails closed" claim assumes. Per the backstop pattern spec 0001 fixed: the Server Action or Route Handler gate remains the primary control, RLS is the backstop against a missed `where` clause.
- `movies` carries no RLS: it is a shared, publicly readable catalog, and `app_user` is granted `SELECT` on it directly. Writes to it happen only from the Inngest catalog import job over the direct (`DATABASE_URL_UNPOOLED`) connection, using a separate role with `BYPASSRLS` (spec 0001's "dedicated role or a `bypassrls` connection" for jobs, named concretely here), never from a user request.
- Row level security policies are declared in `schema.ts` itself (Drizzle's `pgPolicy` / `.enableRLS()`, with `app_user` declared in `drizzle.config.ts`'s `entities.roles`), not as hand written SQL bolted on after `drizzle-kit generate`. A policy that exists only in the database and not in `schema.ts` is drift the next `generate` run will propose to drop.

**Configuration required**: none new. This spec reuses `DATABASE_URL` and `DATABASE_URL_UNPOOLED` already declared in spec 0001's environment keys.

**Critical test scenarios**:
- Happy path: recording a swipe `like`, then later importing a Letterboxd rating for the same movie, upserts into the same `user_movie_interactions` row (the import's `rating` and higher precedence `source` win, the swipe's `reaction_type` is preserved only if the import carries none) rather than creating a second row, verifies **AC-1**.
- Failure case: a movie dismissed from the feed, then later rated via Letterboxd import for the same `(user, movie)`, keeps `dismissed_at` set after the upsert (the import must not clear it), verifies **AC-2**.
- Concurrency: two concurrent `usage_counters` increments for the same `(user_id, resource, window_start)` at the limit resolve to only one being accepted, using the returning-value check, not a check-then-increment race, verifies **AC-10**.
- Auth/permission: a query run **as the `app_user` role** with `app.user_id` set to a different user returns zero rows from another user's `user_movie_interactions`, `taste_profile`, `reasons`, and `watchlist_items` (confirming `FORCE ROW LEVEL SECURITY` actually applies, not just that a policy exists), verifies **AC-6**.

## Build plan

1. Create the `app_user` application role (explicit grants, no table ownership) and the Inngest `bypassrls` role, and declare `app_user` in `drizzle.config.ts`'s `entities.roles`, satisfies **AC-6**.
2. Write `src/db/schema.ts` with all seven entities (`users`, `movies`, `user_movie_interactions`, `taste_profile`, `reasons`, `watchlist_items`, `usage_counters`), the `reaction_type` enum, the `source` and `resource` check constraints, the composite primary keys, the half star scale check, and the "at least one of reaction_type/rating/dismissed_at" check, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-9**, **AC-10**.
3. Add cascade delete foreign keys from every table back to `users.id`, satisfies **AC-7**.
4. Declare row level security policies in `schema.ts` itself (`pgPolicy`, `.enableRLS()`, `FORCE ROW LEVEL SECURITY`) for every user owned table, targeting the `app_user` role, satisfies **AC-6**.
5. Add indexes in `schema.ts`: the HNSW index on `movies.embedding` (created after the initial catalog load, see Consequences), GIN indexes on `movies.genres` and `movies.keywords`, the partial index on `user_movie_interactions (user_id) where dismissed_at is not null`, and `watchlist_items (user_id, added_at desc)`, satisfies **AC-2**, **AC-5**.
6. Generate the migration (`pnpm db:generate`), prepend `CREATE EXTENSION IF NOT EXISTS vector` (drizzle-kit does not emit this), and add the `BEFORE UPDATE` trigger for `user_movie_interactions.updated_at` and the increment-first `usage_counters` upsert as `--custom` SQL in the same migration set, commit the result, satisfies **AC-8**, **AC-10**.
7. Write the application layer upsert helper implementing the **Upsert semantics** `on conflict` clause above (used by every feature writing to `user_movie_interactions`), satisfies **AC-1**, **AC-2**.
8. Apply the migration to the local Supabase stack (`pnpm db:migrate`) and smoke test: insert a user, a movie, and an interaction as `app_user`, then confirm a query run as `app_user` with `app.user_id` set to a different user returns no rows, satisfies **AC-6**, **AC-8**.

## Consequences

**Positive**:
- Every later feature (6 through 12) has a stable schema to build against; the scope's "no breaking migration" bar for this feature is met in one migration.
- Feed ranking and vibe search share one comparison primitive (embedding cosine distance), so feature 7 and feature 11 are built on the same mechanism rather than two.
- The unified interaction table means the feed, the import summary, and the taste recompute job each query one table instead of joining across reactions and ratings.

**Negative / tradeoffs**:
- `user_movie_interactions` carries three nullable signal columns (`reaction_type`, `rating`, `dismissed_at`), guarded by a check constraint and a precedence rule in application code, not the database; a future engineer adding a new interaction type must update both the enum and the `source_rank` case expression.
- The `app_user` role and RLS-in-`schema.ts` approach is more setup than a single shared connection, but it is what makes RLS actually apply; without it, every RLS policy in this spec would be silently inert against the table owning connection.
- The debounced taste profile recompute job (feature 7 or a shared job, to be wired by whichever feature first needs it) is a new piece of Inngest infrastructure this spec assumes but does not itself build; until it exists, `taste_profile.embedding` stays null for every user, and the feed must have a popularity fallback ready from day one.
- Hard delete cascade (per your answer) means account deletion is irreversible with no recovery window; there is no soft delete or grace period.
- The HNSW index is a post filter against the feed's exclusion set; as a user's interaction history grows, more of the vector search's candidate set gets filtered out after retrieval. Feature 7 needs to tune `hnsw.ef_search` or use an over-fetch factor, not just query `LIMIT N`.

**Neutral**:
- `usage_counters`, the RLS backstop concept, and the `movies` embedding columns were already fixed by spec 0001; this spec makes the RLS mechanism concrete (the role, `FORCE`, the `nullif` fix) and the `usage_counters` correctness concrete (increment-first), it does not reopen those decisions.
- The `cast_members` jsonb shape (name + character, top 5) is sized for the embedding text feature 4 builds (spec 0001: "title, year, overview, genres, top keyword tags, and top five cast members"); feature 4 owns exactly how that text is assembled and its Zod schema.
- Where the `usage_counters` limits (30/hr, 50/day, 3/day) live in code, and the shared error shape for an over-limit rejection, are not decided here (spec 0001 called them "config, not schema"); see Follow-up.

## Follow-up

- [ ] Feature 7 (swipe onboarding & feed) owns the "enough to start" threshold, the ranking algorithm, the popularity fallback used while `taste_profile.embedding is null`, and the `hnsw.ef_search`/over-fetch tuning needed once the exclusion filter is applied after the vector search.
- [ ] Feature 8 (Letterboxd CSV import) owns mapping an imported row to `reaction_type` (if any) and `source = letterboxd_import`, and the matched/unmatched count reported to the user.
- [ ] Feature 9 (feed refinement & feedback) owns wiring the `dismissed_at` write (via the shared upsert helper from Build plan step 7) into the "not interested" action, and deciding whether vibe search (feature 11) also respects it.
- [ ] Feature 6 (accounts & sign in) owns the lazy upsert into `users` on first authenticated request, setting `app.user_id` in the request transaction using the `app_user` role, and the in-app account deletion action (which must also call Clerk's Backend API to remove the Clerk identity, not just cascade the local rows) that AC-7 depends on.
- [ ] Where the `usage_counters` limits (30/hr, 50/day, 3/day) live in code, and the shared `Result`-style error shape AGENTS.md calls for on an over-limit rejection, are not decided by this spec; the first feature that calls `usage_counters` (likely feature 11, vibe search) should settle it, or it becomes its own small cross cutting decision.

## Rationale

Reasoning, options considered, and references: see [rationale.md](rationale.md).
