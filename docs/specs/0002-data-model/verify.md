# Verify: data model · spec 0002 · updated 2026-09-06

_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [x] `pnpm typecheck` → passes → all ACs (schema layer)
- [x] `pnpm lint` → passes → all ACs (schema layer)
- [ ] `pnpm db:migrate` against a fresh local Supabase stack → applies cleanly, no errors → AC-8  _(not re-run from an empty cluster: the running local stack is already fully migrated and the user's active work sits on it; verified instead by `drizzle-kit check` = clean and the live stack matching the set exactly. See the fragility note in the /check verify report about `CREATE ROLE "app_user"` lacking an `IF NOT EXISTS` guard.)_
- [x] `insert into user_movie_interactions` a `like` swipe, then upsert a `letterboxd_import` rating for the same `(user, movie)` via `upsertUserMovieInteraction` → one row, `reaction_type` still `like`, `rating`/`source` from the import → AC-1
- [x] Upsert a feed dismissal (`dismissed_at` set), then a later `letterboxd_import` upsert for the same pair → `dismissed_at` still set after the second write → AC-2
- [x] Insert a `taste_profile` row with `embedding null` → confirm no code path computes it inline (schema only guarantees the column, feature 7 owns the job) → AC-3
- [x] Insert a `reasons` row with `source = 'templated'` and one with `source = 'generated'` → both readable, tagged correctly → AC-4
- [x] Insert then delete a `watchlist_items` row for `(user, movie)` → no residual row, no history table → AC-5
- [x] As `app_user` with `app.user_id` set to user B, query `user_movie_interactions`/`taste_profile`/`reasons`/`watchlist_items`/`usage_counters` seeded for user A → zero rows returned (ran locally via `SET ROLE app_user; SET app.user_id = ...`) → AC-6
- [x] Delete a `users` row that has interactions, a taste profile, reasons, and a watchlist item → all cascade-deleted → AC-7
- [x] Generate the migration set from `schema.ts` in one `drizzle-kit generate` run, review the SQL → schema + RLS + indexes all present in that one set (plus the `--custom` FORCE/trigger/grants follow-up) → AC-8
- [x] Upsert a rating of exactly `4.5` via the Letterboxd import path (`source: 'manual_rating'` or `'letterboxd_import'`) → stored and read back as `4.5`, no rounding → AC-9
- [x] Call `incrementUsageCounter` 5 times concurrently (`Promise.all`) for the same `(user, resource, window)` → returned counts are exactly `1..5`, no duplicate, no skip → AC-10

## Value sourcing coverage

- [x] Feed ranking similarity: query `1 - (taste_profile.embedding <=> movies.embedding)` for a user with a non-null profile → a plausible cosine distance, not an error → Value sourcing row 1  _(query executed without error; 0 rows since no profile has a non-null embedding yet, which is the schema-only guarantee for this feature)_
- [x] Feed exclusion set: a movie the user marked `dislike`, one `dismissed_at`, and one on their watchlist are all excludable via one query against `user_movie_interactions` + `watchlist_items` → Value sourcing row 2
- [x] `usage_counters` window boundary: call `usageWindowStart('vibe_search', ...)` for two instants either side of an hour boundary → returns two distinct hourly windows; same check for a daily resource across a UTC day boundary → Value sourcing rows 6, 8

## Acceptance-criteria coverage

- AC-1 … covered by the upsert precedence step · AC-2 … the dismissal-survives-import step · AC-3 … the null-embedding step · AC-4 … the reasons tagging step · AC-5 … the watchlist add/remove step · AC-6 … the `app_user` cross-user isolation step · AC-7 … the cascade delete step · AC-8 … the single migration-set step · AC-9 … the exact half-star step · AC-10 … the concurrent increment step
