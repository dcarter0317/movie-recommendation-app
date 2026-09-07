# Review, feat/coding-standards-tooling (feature 3, data model), 2026-09-06

**Reviewed by**: claude-opus-5 (author on a different model)
**Scope**: 16 files, branch vs base `fd9265f` (scoped to `src/db/`, `drizzle.config.ts`, `docs/specs/0002-data-model/`)
**Verdict**: Blocked

## Summary

This change lands the whole spec-0002 data model: seven tables with composite natural keys, check constraints, a `reaction_type`/`reason_source` enum pair, RLS enabled *and* forced on all six user-owned tables against a dedicated non-owner `app_user` role, four migrations, and two application helpers (`upsertUserMovieInteraction`, `incrementUsageCounter`). The schema itself is careful, well-commented work and matches the spec's data-model sketch essentially line for line; the RLS design in particular (non-owner role + `FORCE` + the `nullif(current_setting(...), true)` fail-closed form) is correct and unusually well reasoned.

Two things undercut it. First, the per-column precedence in the upsert has an asymmetry the spec's own critical-test scenario does not cover: a *lower*-precedence write is discarded for a column the *higher*-precedence write never supplied, so a user's swipe after a Letterboxd import is silently dropped while the function returns a row that looks like a success. `/check verify` passed AC-1 only because it exercised the favorable ordering (swipe-then-import). Second, the migration set is not reproducible: `CREATE ROLE "app_user"` is unguarded, and migrations 0002/0003 hard-code Supabase-only role names, so a `supabase db reset` or any non-Supabase Postgres (a CI or Vitest integration database, which is the very next step) fails to apply the set — which is what AC-8 claims. Both helpers also bind the pooled singleton `db` directly, so neither can participate in the `withUser()` transaction feature 6 must add for RLS to apply at all.

## Blockers

### 🔴 Per-column precedence silently discards a lower-ranked write for a column the winner never set, `src/db/interactions.ts:44`

**Problem**: `winsOverExisting` compares `source_rank(excluded.source)` against `source_rank(user_movie_interactions.source)` — a *row*-level comparison — and `winningValueOr` (line 58) then gates *every* column on it. `source` is a single column describing the last winning write, not per-column provenance. Concrete failure:

1. A Letterboxd import writes `rating = 4.5`, `source = 'letterboxd_import'`, `reaction_type` null.
2. The user swipes "dislike" on the feed: `upsertUserMovieInteraction({ source: 'swipe', reactionType: 'dislike' })`.
3. `rank('swipe') = 1 >= rank('letterboxd_import') = 2` is false, so `reaction_type` resolves to `coalesce(NULL, user_movie_interactions.reaction_type)` = still NULL.

The dislike is discarded. `upsertUserMovieInteraction` returns the row without error, so the caller has no way to detect it. The same applies to any post-import or post-manual-rating swipe, which is the app's primary interaction path.

**Why it matters**: Silent loss of user input on the sole write path to the app's central table, with no error signal. It also poisons downstream derivation — the taste-profile job (spec 0002, "Taste profile derivation") reads `reaction_type = 'like'` or `rating >= 3.5`, so a like swiped after an import never enters the user's taste vector. The existing verify step for AC-1 tests only swipe-then-import; the reverse order is untested and broken. Note the file's own header comment claims "a swipe's `reaction_type` survives an import that carries none" — it does, but the converse (an import's row-source blocking a later swipe from *setting* it) was not considered.

**Suggested fix**: Precedence should only arbitrate when both sides actually supply a value for that column. Per column: if the incoming value is null, keep the existing; if the existing is null, take the incoming; only when both are non-null does `source_rank` decide. That preserves the spec's stated intent ("a hand typed rating should not be silently clobbered by a re-run import") while letting a swipe fill a column no higher-ranked write ever populated. Once fixed, add the import-then-swipe ordering to `verify.md`'s AC-1 step — the current step passes under either implementation.

## Major

### 🟠 `CREATE ROLE "app_user"` has no existence guard, `src/db/migrations/0000_third_living_tribunal.sql:4`

**Problem**: Roles are cluster-global, not database-scoped. `CREATE ROLE "app_user";` errors with `role "app_user" already exists` on any cluster that already has it. Migration 0001:30-36 creates `app_inngest` inside exactly the right `DO $$ ... IF NOT EXISTS ... $$` guard, so the correct pattern is already established one file over — 0000 just wasn't edited after drizzle-kit generated it.

**Why it matters**: `supabase db reset` recreates the database but not the cluster's roles, so the standard local reset loop breaks on the first migration. The same applies to re-pointing the set at any cluster that has run it before. `verify.md:9` already had to leave the `pnpm db:migrate`-from-empty step unchecked because of this, which means AC-8 ("the full schema … applies together as one migration set") is asserted, not demonstrated.

**Suggested fix**: Wrap the `CREATE ROLE` in the same `DO $$ / IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') $$` block used for `app_inngest`, then actually run the set against an empty cluster and tick the verify step. Editing generated migration SQL is fine here; it's committed and immutable once applied.

### 🟠 `app_inngest` gets blanket CRUD on every table in `public`, defeating the role separation, `src/db/migrations/0001_rls_force_trigger_grants.sql:39`

**Problem**: Line 38 grants the scoped, intended privilege (`SELECT, INSERT, UPDATE, DELETE ON TABLE "movies"`). Line 39 then grants `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public` to the same role, which is `BYPASSRLS`. The comment directly above both lines says the role exists because "Inngest's catalog import job (feature 4) writes to `movies`" — the blanket grant contradicts it and makes line 38 dead.

**Why it matters**: `app_inngest` is `BYPASSRLS`, so this combination gives any job connecting as it unrestricted read and write over every user's `user_movie_interactions`, `taste_profile`, `reasons`, `watchlist_items`, and — notably — `usage_counters`, the rate-limit table. That is the exact privilege boundary spec 0002's Security model draws ("never as app_user and never as the request path's connection", writes "only from the Inngest catalog import job"). A compromised or buggy job now has blast radius over all user data instead of the catalog. `ON ALL TABLES` is also a point-in-time snapshot, so the grant is simultaneously too wide for today's tables and absent for tomorrow's — the worst of both.

**Suggested fix**: Drop line 39. If a later job genuinely needs a user-owned table (the taste-profile recompute will), grant that table explicitly in the migration that introduces the job, and consider whether that job wants a third, non-`BYPASSRLS` role instead.

### 🟠 Migrations 0002 and 0003 hard-code Supabase-only roles, so the set cannot apply to a plain Postgres, `src/db/migrations/0002_grant_migrator_app_user_membership.sql:6`, `src/db/migrations/0003_revoke_anon_authenticated_data_api_access.sql:11`

**Problem**: 0002 does `GRANT "app_user" TO "postgres"`; 0003 revokes from `anon` and `authenticated` and does `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`. None of `postgres`, `anon`, or `authenticated` is guaranteed to exist — `anon`/`authenticated` are created by Supabase's bootstrap, not by this repo. Against a stock Postgres the migration aborts with `role "anon" does not exist`.

**Why it matters**: The committed migration set is the definition of the schema. Today it only applies to a Supabase cluster. `/test` is the next step in the workflow and Vitest integration tests against Postgres (a container, a CI service, Neon, anything) will not be able to build the schema. It also blocks any future non-Supabase environment, and AC-8's "applies together as one migration set" is environment-conditional in a way the spec doesn't state.

**Suggested fix**: Guard both by role existence (`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ...)` in a `DO` block), so the Supabase-hardening statements become no-ops elsewhere. If the intent is genuinely "Supabase-only forever", say so explicitly in spec 0002's Security model rather than leaving it implied by the SQL.

### 🟠 Both helpers bind the pooled singleton `db`, so neither can run inside the `withUser()` transaction RLS requires, `src/db/interactions.ts:64`, `src/db/usage.ts:45`

**Problem**: `upsertUserMovieInteraction` and `incrementUsageCounter` import `db` from `./client` and call it directly. RLS keys off `current_setting('app.user_id')`, which is only meaningful inside the transaction that `SET LOCAL`s it — the `withUser(db, userId, fn)` helper `client.ts:20` says feature 6 will add. A function that reaches for the module-level pooled client cannot be handed that transaction.

**Why it matters**: Two consequences. (a) Today these run as the table-owning `postgres` role, which on Supabase carries `BYPASSRLS` — so the RLS backstop this entire feature exists to build is inert for the only two code paths that touch the database. That is why the AC-1/AC-2/AC-10 verify steps passed even though the policies would have rejected them as `app_user`. (b) When feature 6 lands `withUser()`, every call site of both helpers has to be rewritten, and the same applies to any Inngest step that wants the unpooled connection. It also reads against AGENTS.md's "push I/O to the edges and keep it explicit" — the I/O target here is hidden inside the helper.

**Suggested fix**: Take the database handle as the first parameter (`db: Db | Transaction`), defaulting is optional but the parameter should exist now, while there are zero call sites to migrate. Drizzle's transaction type is assignable to the same query interface, so the change is mechanical.

### 🟠 No test covers any of the new logic, `src/db/interactions.ts`, `src/db/usage.ts`

**Problem**: `test-preferences.json` sets Vitest as the runner, so the project has a configured test signal, and this change adds no `interactions.test.ts`, no `usage.test.ts`, and no schema-level test. The untested surface is branching logic: three-way source precedence, per-column merge, `dismissed_at` monotonicity, and the hourly-vs-daily window truncation.

**Why it matters**: The precedence blocker above is exactly the class of bug a table-driven unit test over the ordering matrix would have caught immediately, and `/check verify`'s one-ordering manual step did not. `usageWindowStart` is a pure function with no I/O (`src/db/usage.ts:20`) — the cheapest possible test and currently unverified for DST-free UTC day boundaries, month rollovers, and the exact instant of an hour boundary.

**Suggested fix**: `/test` should cover, at minimum: the full 3×3 source-precedence matrix for `reaction_type`/`rating`/`source` in both orderings, `dismissed_at` never returning to null, and `usageWindowStart` at hour/day boundaries. Weighting this Major rather than Minor because it is branching logic and because a real defect slipped through the gate that was supposed to substitute for it.

## Minor

### 🟡 No write can ever clear `reaction_type` or `rating`, `src/db/interactions.ts:58`

**Problem**: `winningValueOr` wraps every column in `coalesce(..., existing)`, making all three signal columns monotonic, not just `dismissed_at`. Passing `reactionType: undefined` from a manual-rating write cannot un-like a movie; passing `rating: undefined` cannot remove a rating.

**Why it matters**: "Undo my like" and "remove my rating" are ordinary product actions that features 8 and 9 will want, and the sole write path cannot express them. The spec only requires monotonicity for `dismissed_at` (Key invariants), so this over-applies the rule. The `has_signal_check` constraint means clearing the last remaining signal must delete the row instead, which is worth deciding now.

**Suggested fix**: Either document that clearing is out of scope for this feature and route it through a future explicit delete/clear helper, or distinguish "not supplied" from "explicitly cleared" in the input type (e.g. `rating?: number | null`) and only coalesce for the former.

### 🟡 Constraint violations surface as raw Postgres errors, with no validation and no `Result` shape, `src/db/interactions.ts:61`

**Problem**: `upsertUserMovieInteraction` accepts any `number` for `rating` and does not require any signal column. A caller passing `3.7` trips `user_movie_interactions_rating_half_step_check`; a caller passing none of `reactionType`/`rating`/`dismissedAt` trips `user_movie_interactions_has_signal_check`. Both surface as a thrown `postgres` driver error carrying SQL detail.

**Why it matters**: AGENTS.md calls for a `Result`-style value or explicit error for expected failures, reserving throws for the truly exceptional, and for "one documented error-handling pattern" across the app — and spec 0002's own Follow-up defers the shared error shape to the first calling feature. These are expected caller errors on the app's main write path, and the raw error risks leaking SQL internals into a Server Action response.

**Suggested fix**: Validate the input shape (the half-step/range rule and the at-least-one-signal rule are both trivially expressible in Zod) at this boundary and return the project's error shape. If that shape genuinely isn't decided yet, note the gap in the file so the first caller does not invent a second pattern.

### 🟡 `users.updated_at` and `movies.updated_at` are never maintained, `src/db/schema.ts:65`, `src/db/schema.ts:109`

**Problem**: The `set_updated_at` trigger is attached only to `user_movie_interactions` (`0001:51`). `users` and `movies` both declare `updated_at ... NOT NULL DEFAULT now()` with no trigger and no `$onUpdate`, so the column is frozen at insert time and is really a second `created_at`.

**Why it matters**: `movies.updated_at` is the natural staleness signal for the feature-4 TMDB re-import (which upserts on `tmdb_id`), and it will silently always report the first import. Cheap to fix now, awkward to backfill later. The spec's data sketch lists the column for both tables but only mandates a trigger for `user_movie_interactions`, so this is a gap in the design as much as the code.

**Suggested fix**: Attach the existing `set_updated_at` trigger to `users` and `movies` in a follow-up migration — the function is already generic and already hardened with `SET search_path = ''`.

### 🟡 No index on the `movie_id` side of the three composite-key tables, `src/db/schema.ts:154`, `src/db/schema.ts:226`, `src/db/schema.ts:249`

**Problem**: `user_movie_interactions`, `reasons`, and `watchlist_items` are keyed `(user_id, movie_id)`, so the PK index serves `user_id` lookups but nothing serves `movie_id` alone. Their `movie_id` FKs are `ON DELETE CASCADE`.

**Why it matters**: Deleting or replacing a `movies` row makes Postgres sequentially scan all three tables per deleted row to find referencing rows. Harmless at zero rows; painful once the catalog import starts pruning or re-keying entries against a table with millions of interaction rows. Postgres does not auto-index the referencing side of a FK.

**Suggested fix**: Add a `movie_id` index to each of the three tables, or accept the cost explicitly if movie deletion is expected never to happen (and say so in the spec's Indexes section, which currently doesn't discuss the FK side).

### 🟡 `app_user` has no default privileges, so the next table added is silently ungranted, `src/db/migrations/0001_rls_force_trigger_grants.sql:18`

**Problem**: Grants to `app_user` are enumerated table by table. Any table a later migration creates gets no `app_user` grant, and the failure mode is a `permission denied for table ...` at runtime, not at migration time.

**Why it matters**: The failure appears in a feature branch far from this migration, and the fix is non-obvious to whoever hits it. Contrast with 0003, which correctly *does* use `ALTER DEFAULT PRIVILEGES` for the revoke side.

**Suggested fix**: Add `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user` — or, if per-table grants are a deliberate least-privilege choice, note that in the migration comment so the next author grants explicitly instead of debugging.

### 🟡 `app_user` is granted `DELETE` on `usage_counters`, `src/db/migrations/0001_rls_force_trigger_grants.sql:24`

**Problem**: The blanket `SELECT, INSERT, UPDATE, DELETE` loop includes `usage_counters`, but the increment-first design (`src/db/usage.ts:45`) only ever needs `INSERT` and `UPDATE`; nothing deletes a counter row.

**Why it matters**: `usage_counters` is a rate-limit control whose subject is the same principal the RLS policy scopes to. Granting the request-path role `DELETE` over its own quota rows means any SQL-injection or logic bug on the request path is a quota reset rather than just a data read. Small, but it's free to close.

**Suggested fix**: Grant `SELECT, INSERT, UPDATE` on `usage_counters` only; if windows ever need pruning, do it from the migrator or an Inngest job.

### 🟡 Spec 0002 still documents the `on conflict` SQL the code deliberately does not implement, `docs/specs/0002-data-model/index.md:57`

**Problem**: The worked example at index.md:57-65 uses a bare `case ... else existing end` per column. `src/db/interactions.ts:48-57` explains at length why it wraps each in `coalesce` instead, and flags the spec for `/architect` to correct — but the spec was updated to "In Progress" in this same change without the correction landing.

**Why it matters**: The spec is the contract, and it currently prescribes SQL that the sole implementation contradicts. A future author reading only the spec (or a future `/develop` run) will reimplement the documented version. And now that the blocker above is on the table, the spec's example needs a *third* revision anyway, not just the `coalesce` note.

**Suggested fix**: Fix the blocker first, then update index.md's Upsert semantics block and the AC-1 critical test scenario to match the final three-case merge, and drop the "flagged for /architect" paragraph from the code comment once they agree.

## Nits

- ⚪ `src/db/interactions.ts:36`, the comment "Defined once, this is the only call site" is inaccurate — `sourceRank` is called twice on line 44, and `winsOverExisting` is interpolated three times.
- ⚪ `src/db/usage.ts:21`, `truncated` is mutated in place through four `setUTC*` calls; it's a local copy so behavior is fine, but AGENTS.md's "no in-place mutation" reads better satisfied by constructing the target date from `Date.UTC(...)` in one expression.
- ⚪ `src/db/schema.ts:184`, `taste_profile` is singular while every other table is plural. Cosmetic, but it's the kind of thing that costs a second's thought at every query site forever; renaming is free today and a migration later.
- ⚪ `src/db/migrations/0001_rls_force_trigger_grants.sql:33`, `app_inngest` gets no explanation of its NOLOGIN status, unlike the thorough `app_user` note at `schema.ts:43-49`. Worth a one-liner saying which feature decides how the job's connection assumes it.
- ⚪ `src/db/usage.ts:17`, `HOURLY_RESOURCES` is typed `ReadonlySet` but constructed as a mutable `Set`; the type prevents accidental writes through the binding, which is probably enough, but `Object.freeze`-style intent is clearer with a readonly tuple + `.includes` at this size (one element).

## Strengths

- The RLS design is genuinely well done and the hard part is right: a non-owner `app_user` role, `FORCE ROW LEVEL SECURITY` (without which every policy is inert against the migrating owner), and the `nullif(current_setting('app.user_id', true), '')::uuid` form that fails closed instead of raising on a connection that never called `withUser`. Most implementations get at least one of those three wrong.
- Migration 0003 is a real catch that no acceptance criterion asked for: Supabase's auto-expose default had left `movies` — deliberately RLS-free — openly writable over the public anon key. It closes both the existing grants and the default privileges that would reopen them, and hardens the trigger function's `search_path` while it's there.
- The check constraints are precise rather than approximate: the half-step rule (`rating * 2 = trunc(rating * 2)`) enforces the actual scale rather than just a range, and `has_signal_check` makes a meaningless row unrepresentable.
- Comments consistently explain *why* — why `text` + check instead of an enum for `source`, why a trigger instead of `$onUpdate`, why the HNSW index is deferred to feature 4, why `movies` carries no RLS. That is the standard the rest of the codebase should hold to.

## Test coverage

No tests were added. With Vitest configured in `test-preferences.json`, that is a real gap rather than a design choice, and it is load-bearing here: the AC-1 verify step exercised one of the two upsert orderings and the broken one shipped. What `/test` should lock, in priority order: (1) the full source-precedence matrix in both directions, including the import-then-swipe case in the blocker above; (2) `dismissed_at` monotonicity across every source combination; (3) `usageWindowStart` at hour, UTC-day, and month boundaries, plus the hourly-vs-daily branch; (4) an integration test that runs the two helpers *as `app_user` with `app.user_id` set*, which is the configuration production will use and which nothing currently exercises — everything verified so far ran as the `BYPASSRLS` owner, so the policies are effectively untested against the real request-path role.
