# Verify: movie catalog and ingestion · spec 0003 · created 2026-09-06

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `pnpm typecheck` → passes → all ACs
- [ ] `pnpm lint` → passes → all ACs
- [ ] `inngest` / `ai` / `@ai-sdk/openai` installed; `src/lib/inngest/client.ts` exports a typed client for the three `catalog/*` events; `GET`/`PUT`/`POST /api/inngest` served by `serve()` (no 501) → AC-9
- [ ] `pnpm db:migrate` on the local Supabase stack applies Migration A cleanly (new `movies` columns, `tmdb_status` check, `embedding is null` partial index, `GRANT app_inngest TO postgres`) → AC-3, AC-7, AC-9

## Acceptance criteria

- [ ] **AC-1** — Run `pnpm catalog:seed` against a clean local stack with `inngest dev` running. After `catalog-seed` and `catalog-ingest-movie` drain: `select count(*) from movies where tmdb_status = 'active'` is within 15 percent of 10000; `select count(*) from movies where tmdb_status = 'active' and (poster_path is null or overview is null or overview = '' or coalesce(vote_count, 0) < <MIN_VOTE_COUNT>)` is 0.
- [ ] **AC-2** — Run `pnpm catalog:seed` a second time. `select count(*) from movies` is unchanged; `select tmdb_id, count(*) from movies group by tmdb_id having count(*) > 1` returns no rows; a spot checked row's `updated_at` has advanced and its `embedding` is still non null.
- [ ] **AC-3** — For a sample of ten rows: `title`, `overview`, `release_date`, `release_year` (equal to the year in `release_date`), `runtime`, `genres` (names, not numeric ids), `keywords` (≤ 15), `cast_members` (≤ 5, each with `name` and `character`), `poster_path`, `original_language`, `vote_average` (reads back as a number), `vote_count`, `popularity` are all populated. Feed a malformed `credits.cast` entry through `toMovieRow` in a unit test → the Zod schema rejects it; feed `release_date: ""` → `release_year` is `undefined`, not `0`.
- [ ] **AC-4** — After `catalog-embed-movies` and the null sweep drain: `select count(*) from movies where tmdb_status='active' and embedding is not null` equals the active row count; for those rows `embedding_model`, `embedded_at`, `embedding_input_hash` are all set. Force the embed step to throw for one batch → those movies persist with `embedding` null and the run still completes. Confirm no non embed code path writes `embedding_input_hash`.
- [ ] **AC-5** — After Migration B (HNSW index declared in `schema.ts`, generated, migrated): `explain select id from movies order by embedding <=> $1 limit 20` shows an index scan on the HNSW index; the query returns 20 ranked rows.
- [ ] **AC-6** — Invoke `catalog-refresh` manually. It emits ingest events for recent releases and for the `WEEKLY_REFRESH_SLICE` rows with the oldest `last_refreshed_at`, and emits `catalog/movie.embed.requested` for at most `EMBED_SWEEP_LIMIT` `embedding is null` rows. A row whose embedding text and model are unchanged is not re embedded (`embedded_at` does not move); simulate a model change and confirm it is re embedded.
- [ ] **AC-7** — Simulate a re fetch where `qualifies()` is now false → the row stays with `tmdb_status = 'disqualified'` and refreshed metadata. Simulate a TMDB 404 on re fetch → the row stays with `tmdb_status = 'removed'` and untouched metadata. A qualifying re fetch of a `disqualified` row sets it back to `active`. A `user_movie_interactions` row referencing any of them still joins to a movie.
- [ ] **AC-8** — In one transaction, `set local role app_user; insert into movies (...)` → permission denied. The same insert through `src/db/inngest-client.ts` (`asInngest`, which runs `set local role app_inngest`) → succeeds. (Full request path denial becomes real once feature 6 connects as `app_user`.)
- [ ] **AC-9** — `src/features/catalog/catalog.config.ts` holds every knob named in the spec (`DISCOVER_SORTS` with per sort `voteCountGte` and `budget`, `MIN_VOTE_COUNT`, `CANDIDATE_OVERFETCH`, `WEEKLY_REFRESH_SLICE`, `EMBED_SWEEP_LIMIT`, `TMDB_THROTTLE`, `IMAGE_BASE_URL`, `EMBEDDING_TEXT_VERSION`, ...). `git diff` of `src/env.ts` and `.env.example` shows no new variable. The only `process.env` read outside `src/env.ts` is the Inngest SDK's own dev URL lookup in `scripts/catalog-seed.ts`.
- [ ] **AC-10** — For a row with `poster_path = '/x.jpg'`, `` `${IMAGE_BASE_URL}w500${poster_path}` `` resolves to a `200` image response from the TMDB CDN.

## Value sourcing coverage

- [ ] Genre names: `toMovieRow` reads `detail.genres[].name`; no `/genre/movie/list` request is made anywhere.
- [ ] Upsert set-list: the `on conflict do update` clause names only the 16 non embedding columns; an integration test that upserts a row with an existing `embedding` leaves the vector intact.
- [ ] Re embed decision: change one field in `buildEmbeddingText`'s input → `embeddingInputHash` changes; unchanged input → unchanged hash; changed `EMBEDDING_TEXT_VERSION` → hash changes.
- [ ] Stale slice ordering: `catalog-refresh`'s row selection is ordered `last_refreshed_at asc nulls first`, capped at `WEEKLY_REFRESH_SLICE`; the null sweep is capped at `EMBED_SWEEP_LIMIT`.
- [ ] Dedupe: `catalog-seed` accumulates ids in an in memory `Set` across step results and makes no DB pre check.
- [ ] Cron: `catalog-refresh` is registered with `{ cron: "0 4 * * 1" }`.
- [ ] Throttle: `catalog-seed` and `catalog-ingest-movie` both apply `throttle` from `TMDB_THROTTLE`, not only `concurrency`.

## Acceptance-criteria coverage

- AC-1 … seed backfill count and active row filter checks · AC-2 … double seed idempotency plus embedding preserved · AC-3 … field population, Zod boundary, type modes · AC-4 … embedding fill after sweep plus provider failure plus single writer · AC-5 … HNSW via schema.ts, index scan · AC-6 … refresh three passes, bounded sweep, model change re embed · AC-7 … disqualified / removed / recover transitions · AC-8 … `set local role` write path isolation · AC-9 … config file, no new env var, documented process.env exemption · AC-10 … poster URL construction

## Verified during /develop · 2026-09-07

Already proven while building; `/check verify` can treat these as done and focus on the seed backfill and Migration B.

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build` all green with the new code.
- [x] `pnpm db:migrate` applied Migration A to the local Supabase stack; confirmed live via `information_schema`: all nine new `movies` columns, `movies_tmdb_status_check`, `movies_embedding_null_idx`, and `GRANT app_inngest TO postgres` (`pg_auth_members`). → AC-3, AC-7, AC-9
- [x] `src/lib/inngest/client.ts` exports a typed client for the three `catalog/*` events (Inngest v4 `eventType`, not the removed `EventSchemas`); `GET`/`POST`/`PUT /api/inngest` served by `serve()`, and `pnpm build` lists `/api/inngest` as dynamic (no 501 stub). → AC-9
- [x] 27 Vitest cases over the pure module (`src/features/catalog/catalog.test.ts`): `qualifies` accept/reject rules incl. the `MIN_VOTE_COUNT` boundary, `toMovieRow` mapping + `release_year` derivation + keyword/cast caps + zero-popularity normalisation, `buildEmbeddingText` empty-line drop + year omission, `embeddingInputHash` stability and version sensitivity. → AC-3, AC-9, value-sourcing "re-embed decision"
- [x] Write-path smoke test against local Postgres: `asInngest` runs `set local role app_inngest`; the upsert is idempotent on `tmdb_id` (same row id, `updated_at` advances); a bulk `update ... from (values ...) v(id, embedding::vector, ...)` writes a real 1536-dim vector; a re-upsert through the set-list does **not** null the embedding; `set local role app_user; insert into movies (...)` is denied. → AC-2, AC-4, AC-8, value-sourcing "upsert set-list"

## Still open (needs live external services)

- [ ] AC-1, AC-2 end to end: `pnpm catalog:seed` with `inngest dev` + a real `TMDB_API_READ_ACCESS_TOKEN`, drain, count `tmdb_status='active'` within 15% of 10000, run twice for idempotency.
- [ ] AC-4 end to end: `catalog-embed-movies` against a real `OPENAI_API_KEY`; active rows reach `embedding is not null`; force one batch to throw and confirm the sweep heals it.
- [ ] AC-5: Migration B (HNSW in `schema.ts`, generated after the backfill drains, `set maintenance_work_mem = '256MB'` prepended), then `explain` shows the HNSW index scan.
- [ ] AC-6: invoke `catalog-refresh` and observe the three passes + the model-change re-embed.
- [ ] AC-7: exercise the `disqualified` / `removed` / recover transitions on the refresh path.
- [ ] AC-10: a constructed poster URL returns a 200 from the TMDB CDN.
