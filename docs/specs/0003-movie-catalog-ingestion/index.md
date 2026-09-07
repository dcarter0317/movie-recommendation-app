# 0003. Movie catalog and ingestion

**Date**: 2026-09-06
**Status**: Proposed

## Summary

This decision fixes where movie data comes from and how it gets into the app. A one time backfill pulls roughly ten thousand popular and well rated films from the TMDB API (the movie database the stack already picked), keeps only ones that are released and have a poster and a description, and stores each with its genres, keyword tags, top cast, ratings, and a meaning vector (an embedding) for search. The work runs as small Inngest background jobs (the durable job service the stack already picked): one job per movie so a single failure never stalls the rest, and a separate batched job for the embeddings so an AI outage slows enrichment without blocking the catalog. A weekly job keeps the catalog current by pulling new releases and re fetching the stalest rows. Movies that later drop out of the filters or vanish from TMDB are kept with a status flag, never deleted, so a user's ratings and watchlist keep their referent. No new tables and no new environment variables: this feature extends the existing `movies` table and puts its tuning knobs in one config file.

## Requirements

**User stories**:
- As a film fan, I want a real, broad catalog of movies to swipe through and get recommended, so the product feels complete from day one.
- As a film fan, I want the movies I see to have posters, descriptions, and accurate ratings, so the feed and cards never render blank or stale.
- As the system, I want a repeatable way to refresh the catalog, so new releases appear and rating changes propagate without a manual rebuild.
- As the system, I want a movie that leaves TMDB or the quality bar to stay resolvable, so a user's past ratings and watchlist entries never point at nothing.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A one time backfill, started by the `pnpm catalog:seed` script (which sends a `catalog/seed.requested` Inngest event), populates `movies` with roughly ten thousand rows (plus or minus 15 percent, since candidates are over fetched and some fail the detail time filters) drawn from TMDB `/discover/movie`. Every stored row passed all qualification filters at ingest: status Released, `primary_release_date` on or before today, non empty `poster_path`, non empty `overview`, `adult` false, and `vote_count` at or above `MIN_VOTE_COUNT`.
- **AC-2**: Ingestion is idempotent on `tmdb_id`. Re running the seed, or the weekly refresh re fetching a movie, updates the existing row (matched by the unique `tmdb_id`) and never creates a duplicate. No Inngest event idempotency `id` is set on ingest events, so a second seed run is not silently deduplicated.
- **AC-3**: Each ingested row carries `title`, `overview` (English metadata), `release_date` and `release_year` (the year derived from `release_date` in `toMovieRow`), `runtime`, `genres` as names (read from the `/movie/{id}` detail response), up to fifteen `keywords`, up to five `cast_members` as `{name, character}` objects validated by a Zod schema at the TMDB boundary, `poster_path`, `original_language`, `vote_average`, `vote_count`, and `popularity`.
- **AC-4**: Each movie gets a `vector(1536)` embedding produced by `embedMany` (OpenAI `text-embedding-3-small`, via the `src/lib/ai` registry) from a fixed labelled text block (prefixed with `EMBEDDING_TEXT_VERSION`) built from title and year, genres, keywords, cast, and overview. Only `catalog-embed-movies` writes the embedding columns, and it writes `embedding`, `embedding_model`, `embedded_at`, and `embedding_input_hash` together. A movie whose batch embedding call throws is left with `embedding` null and retried by the weekly null sweep; the backfill never blocks on the embedding provider.
- **AC-5**: The HNSW index on `movies.embedding` (`vector_cosine_ops`) is declared in `schema.ts` after the initial backfill drains and applied as its own generated migration; a cosine distance query against the catalog returns ranked rows using that index.
- **AC-6**: A weekly Inngest cron (`catalog-refresh`) (a) ingests newly qualifying releases, (b) re fetches the rows with the oldest `last_refreshed_at` up to `WEEKLY_REFRESH_SLICE` and upserts changed metadata, and (c) re emits an embedding request for up to `EMBED_SWEEP_LIMIT` rows where `embedding` is null. A row is re embedded only when its `embedding_input_hash` or `embedding_model` no longer matches the current text and model.
- **AC-7**: A movie that no longer passes the filters on re fetch is retained with `tmdb_status` set to `disqualified` (its metadata still refreshed); one that returns 404 from TMDB is retained with `tmdb_status` set to `removed` (a narrow update that touches no metadata). Neither is ever hard deleted, so `user_movie_interactions`, `watchlist_items`, and `reasons` rows keep a resolvable movie. A qualifying re fetch sets `tmdb_status` back to `active`.
- **AC-8**: Every catalog write happens inside an Inngest function, over the direct (`DATABASE_URL_UNPOOLED`) connection, in a transaction that runs `set local role app_inngest`. No catalog write path runs on a user request; the request path role (`app_user`, wired by feature 6) is granted only `SELECT` on `movies`.
- **AC-9**: Every catalog tuning knob (discover sorts with per sort vote floors and budgets, target size, over fetch factor, `MIN_VOTE_COUNT`, weekly slice and sweep sizes, keyword and cast counts, embed batch size, TMDB throttle, image base URL, `EMBEDDING_TEXT_VERSION`) lives in one typed `src/features/catalog/catalog.config.ts`. No new environment variable is added. The one process env read is the Inngest SDK's own `INNGEST_DEV` / base URL lookup in the seed script, a documented exemption to the `src/env.ts` rule.
- **AC-10**: Poster images are stored as `poster_path` only (for example `/abc123.jpg`); the documented `https://image.tmdb.org/t/p/{size}{poster_path}` construction yields a working image URL, with size chosen by the caller.

## Options considered

Reasoning and options: see [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 1: TMDB `/discover` backfill, per movie Inngest fan out, decoupled batched embedding, weekly rolling refresh.

Back the catalog with a one time TMDB `/discover` backfill that fans out one Inngest event per movie, upserts each movie idempotently on `tmdb_id`, and enqueues embedding work to a separate batched consumer; keep it current with a weekly cron that pulls new releases, re fetches the stalest slice by `last_refreshed_at`, and flags (never deletes) movies that fall out. Extend the existing `movies` table with the ranking and bookkeeping columns; add no new tables and no new environment variables.

**Implementation skills**: `inngest-setup` (`inngest/inngest-skills`, `.agents/skills/inngest-setup/`, see also `inngest-durable-functions`, `inngest-steps`, `inngest-events`, `inngest-flow-control`) · `ai-sdk` (`vercel/ai`, `.agents/skills/ai-sdk/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`, see also `supabase-postgres-best-practices`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (extends the `movies` table fixed by spec 0002; no new entities):

| Column | Type | Null? | Notes |
|---|---|---|---|
| `id` | uuid PK | no | existing |
| `tmdb_id` | integer | no | existing; `UNIQUE`, the idempotency key for every upsert |
| `title` | text | no | existing; TMDB `en-US` |
| `overview` | text | yes | existing; TMDB `en-US` |
| `release_year` | integer | yes | existing; `Number(releaseDate.slice(0,4))` in `toMovieRow` |
| `release_date` | date | yes | **new**; full date for recency weighting and "new releases" |
| `runtime` | integer | yes | **new**; minutes |
| `genres` | text[] | no, `{}` | existing; names read straight off `/movie/{id}` `genres[].name` |
| `keywords` | text[] | no, `{}` | existing; `append_to_response=keywords`, first `KEYWORD_LIMIT` in TMDB order |
| `cast_members` | jsonb | no, `[]` | existing; `{name, character}` first `CAST_LIMIT` by billing order, Zod validated at the TMDB boundary; add `.$type<readonly CastMember[]>()` in `schema.ts` |
| `poster_path` | text | yes | existing; path only, the caller builds the CDN URL |
| `vote_average` | numeric(3,1) | yes | **new**; TMDB rating; use `{ mode: "number" }` so it reads back as a number, not a string |
| `vote_count` | integer | no, `0` | **new**; sample size, also the qualification floor input |
| `popularity` | real | yes | **new**; TMDB trending score, refreshed weekly, decays on TMDB's side |
| `original_language` | text | yes | **new**; ISO 639-1 code, kept for reference and filtering |
| `tmdb_status` | text | no, `'active'` | **new**; `check (tmdb_status in ('active','disqualified','removed'))` |
| `embedding` | vector(1536) | yes | existing; null until embedded, retryable; only `catalog-embed-movies` writes it |
| `embedding_model` | text | yes | existing; the `src/lib/ai` registry key actually used |
| `embedded_at` | timestamptz | yes | existing |
| `embedding_input_hash` | text | yes | **new**; SHA-256 hex of the versioned embedding text block; written only with `embedding`, by `catalog-embed-movies` |
| `last_refreshed_at` | timestamptz | yes | **new**; set to `now()` on every successful upsert from TMDB, monotonic non decreasing |
| `created_at` / `updated_at` | timestamptz | no, `now()` | existing; `updated_at` is set explicitly in the upsert's `do update` clause (`movies` has no `updated_at` trigger, and Drizzle `$onUpdate` does not fire on the `on conflict` path, per spec 0002) |

**Upsert set-list** (the mechanism AC-2 and AC-4 depend on): `catalog-ingest-movie` writes with `insert ... on conflict (tmdb_id) do update set` covering exactly `title, overview, release_date, release_year, runtime, genres, keywords, cast_members, poster_path, vote_average, vote_count, popularity, original_language, tmdb_status, last_refreshed_at = now(), updated_at = now()`. It never writes `id`, `tmdb_id`, `created_at`, or any of the four embedding columns, so a refresh upsert built from `toMovieRow` cannot null out an existing embedding.

**Indexes added by this feature** (spec 0002 already added GIN on `genres` and `keywords`):
- HNSW on `movies.embedding` using `vector_cosine_ops`, **declared in `schema.ts` after the initial backfill drains** and applied via `pnpm db:generate` (drizzle-orm supports the HNSW index expression, so it lands as a normal generated migration, no hand written `--custom` SQL and no snapshot drift). Precede the build with `set maintenance_work_mem = '256MB'` in that migration (10k rows of 1536 floats is roughly 60 MB and the free tier instance would otherwise spill to disk).
- Partial index `movies (id) where embedding is null`, for the re embed sweep in `catalog-refresh`.

**Migrations** (Tracer Bullet: the schema change is split so the thin thread lands before the bulk load):
- Migration A: `ALTER TABLE movies` adding the new columns and the `embedding is null` partial index, plus `GRANT "app_inngest" TO "postgres"` so the unpooled client can assume the role with `set local role` (migration 0002 does the same for `app_user`). The `schema.ts` type touches (`cast_members.$type`, `vote_average` `{ mode: "number" }`) go in this change.
- Migration B: the HNSW index, added to `schema.ts` and generated after the backfill.

**State transitions** (`movies.tmdb_status`):

```
(row created by ingest, always) → active
active → disqualified   (weekly re fetch: qualifies() now false; metadata still upserted, tmdb_status = 'disqualified')
active → removed        (weekly re fetch: TMDB returns 404; narrow update, no metadata touched)
disqualified → active   (later re fetch: qualifies() true again; the normal upsert sets tmdb_status = 'active')
removed stays removed   (a 404 is terminal for the weekly job; a manual re seed can revive it)
```

A 404 on the `seed` path is a logged skip, not a `removed` row (the movie was never stored).

**Inngest functions** (all Node runtime, registered in `src/app/api/inngest/route.ts`):

| Function id | Trigger | What it does |
|---|---|---|
| `catalog-seed` | event `catalog/seed.requested` | for each entry in `DISCOVER_SORTS` (its own `sortBy`, `voteCountGte`, `budget`), pages `/discover/movie` with `include_adult=false` and `primary_release_date.lte=today`, collecting result ids into an in memory `Set` across step results (the `Set` is the only dedupe, across sorts and across seed vs refresh; the upsert handles the rest). Emits one `catalog/movie.ingest.requested` per new id until each sort hits its `budget` or the global `TARGET_CATALOG_SIZE * CANDIDATE_OVERFETCH` is reached. `singleton` so two backfills cannot overlap; `throttle` set from `TMDB_THROTTLE` |
| `catalog-ingest-movie` | event `catalog/movie.ingest.requested` | fetches `/movie/{id}?append_to_response=keywords,credits&language=en-US` in a `step.run` wrapped in try/catch (a 404 throws `NonRetriableError`; on any exhausted-or-non-retriable failure the function logs `tmdbId` and returns, so one dead movie never fails the run). Reads `genres[].name` off the response, runs `qualifies()`, maps with `toMovieRow()`, upserts via the set-list above as `app_inngest`. Compares the stored `embedding_input_hash` / `embedding_model` against the freshly computed hash and the current model; if either differs (or the row has no embedding), emits `catalog/movie.embed.requested`. On the `refresh` path applies the `tmdb_status` transitions. Concurrency limited and throttled |
| `catalog-embed-movies` | event `catalog/movie.embed.requested`, `batchEvents: { maxSize: EMBED_BATCH_SIZE, timeout: "10s" }` | re selects the batch's rows by id, builds `buildEmbeddingText(row)` per row, one `embedMany` call, asserts `embeddings.length === inputs.length` (throws otherwise, leaving the whole batch null for the sweep), then one `update movies set embedding = v.embedding::vector, embedding_model = v.model, embedded_at = now(), embedding_input_hash = v.hash from (values ...) as v(id, embedding, model, hash) where movies.id = v.id::uuid` |
| `catalog-refresh` | cron `0 4 * * 1` (Mondays 04:00 UTC) | (a) `/discover` pass for `primary_release_date.gte = today - 8d` with the standard filters, emit ingest events; (b) select `WEEKLY_REFRESH_SLICE` rows ordered by `last_refreshed_at asc nulls first`, emit ingest events tagged `source: "refresh"`; (c) select up to `EMBED_SWEEP_LIMIT` rows where `embedding is null`, emit `catalog/movie.embed.requested` |

**Typed events** (declared with `EventSchemas` in `src/lib/inngest/client.ts`; no idempotency `id` on any of them):
- `catalog/seed.requested` — `{ reason?: string }`
- `catalog/movie.ingest.requested` — `{ tmdbId: number, source: "seed" | "refresh" }`
- `catalog/movie.embed.requested` — `{ movieId: string, tmdbId: number }`

**API surface** (no HTTP surface of its own; the only entry points):

| Entry point | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `pnpm catalog:seed` | `tsx scripts/catalog-seed.ts` → `inngest.send("catalog/seed.requested")` | none | Inngest event id | `INNGEST_EVENT_KEY`; dev routes to `localhost:8288` via the SDK's own `INNGEST_DEV` read | event key missing or invalid |
| `POST /api/inngest` | Inngest handler (`serve()`, replaces the current 501 stub) | signed event / cron tick | 200 | `INNGEST_SIGNING_KEY` (existing) | signature invalid → 401 |
| TMDB `/discover/movie` | outbound fetch | `page`, `sort_by`, `vote_count.gte` (per sort), `primary_release_date.lte`/`.gte`, `include_adult=false`, `language` | movie summaries | Bearer `TMDB_API_READ_ACCESS_TOKEN` | 429, 5xx, network → retry per spec 0001 policy |
| TMDB `/movie/{id}` | outbound fetch | `append_to_response=keywords,credits`, `language=en-US` | full detail incl. `genres[]` | Bearer token | 404 → `NonRetriableError` (mark `removed` on refresh, skip on seed); 429/5xx → retry |
| OpenAI embeddings | `embedMany` via `src/lib/ai` | up to `EMBED_BATCH_SIZE` text blocks | `number[][]` of length 1536 | `OPENAI_API_KEY` (existing) | throw → whole batch left null for the sweep |

**Value sourcing**:

| Action | Value produced / used | Source |
|---|---|---|
| `catalog-seed` picks candidates | candidate `tmdb_id`s | TMDB `/discover/movie`, one query per `DISCOVER_SORTS` entry (`sortBy`, `voteCountGte`, `budget`) plus `include_adult=false`, `primary_release_date.lte = today` |
| `catalog-seed` stops | per sort budget and global cap | `DISCOVER_SORTS[n].budget` and `TARGET_CATALOG_SIZE * CANDIDATE_OVERFETCH` in `catalog.config.ts` |
| `catalog-seed` dedupe | ids already emitted this run | in memory `Set` accumulated across `step.run` results; no DB pre check |
| `catalog-ingest-movie` genre names | genre id → name | `/movie/{id}` response `genres[].name` (no separate `/genre/movie/list` call) |
| `catalog-ingest-movie` keywords | up to fifteen tags | `detail.keywords.keywords[0..KEYWORD_LIMIT]` names |
| `catalog-ingest-movie` cast | `{name, character}` top five | `detail.credits.cast[0..CAST_LIMIT]`, Zod validated; empty `character` kept as `""` |
| `catalog-ingest-movie` `release_year` | 4 digit year | `Number(detail.release_date.slice(0,4))` in `toMovieRow`; `release_date === ""` normalised to `undefined` at the Zod boundary |
| `catalog-ingest-movie` qualify decision | released / poster / overview / adult / votes | `detail` fields plus `MIN_VOTE_COUNT` |
| `catalog-ingest-movie` written columns | the upsert set | the fixed **Upsert set-list** above; embedding columns excluded |
| `catalog-ingest-movie` re embed decision | emit embed event? | stored `embedding_input_hash` vs `sha256(EMBEDDING_TEXT_VERSION + buildEmbeddingText(row))`, or stored `embedding_model` vs current model, or `embedding is null` |
| `catalog-embed-movies` input text | the block to embed | re selected `movies` row by id, `buildEmbeddingText(row)` (never the event payload) |
| `catalog-embed-movies` vector | `vector(1536)` | `embedMany`, OpenAI `text-embedding-3-small` from the `src/lib/ai` registry (spec 0001) |
| `catalog-embed-movies` `embedding_model` | model id string | the `src/lib/ai` registry key used for the call |
| `catalog-refresh` stale rows | N oldest | `movies` ordered by `last_refreshed_at asc nulls first` limit `WEEKLY_REFRESH_SLICE` |
| `catalog-refresh` null sweep | up to M null rows | `movies where embedding is null` limit `EMBED_SWEEP_LIMIT` |
| `catalog-refresh` new releases | recent `tmdb_id`s | TMDB `/discover` `primary_release_date.gte = today - 8d`, same filters |
| `catalog-refresh` status flag | `disqualified` / `removed` | set by `catalog-ingest-movie` on the `refresh` path: `qualifies()` now false, or TMDB 404 |
| any caller poster URL | full image URL | `IMAGE_BASE_URL` (`catalog.config.ts`) + size (caller) + `movies.poster_path` |
| write path identity | db role | `app_inngest` via `set local role app_inngest` inside the `asInngest()` transaction on `DATABASE_URL_UNPOOLED` (grant added in Migration A) |
| refresh schedule | cron expression | `catalog-refresh` function config `{ cron: "0 4 * * 1" }`, UTC |

**Key invariants**:
- `movies.tmdb_id` is unique; every ingest is `insert ... on conflict (tmdb_id) do update` over the fixed set-list, never a blind insert and never touching the embedding columns. Re running the seed changes no row count.
- A `movies` row exists only if it passed `qualifies()` at some successful ingest. A movie that never qualified is never inserted. A movie that qualified once and later fails carries `tmdb_status in ('disqualified','removed')` and stays.
- `embedding`, `embedding_model`, `embedded_at`, and `embedding_input_hash` are written only by `catalog-embed-movies`, and only as a complete set. Any other write path leaves them untouched.
- Re embedding happens if and only if `embedding_input_hash` or `embedding_model` no longer matches the current versioned text and model (or the row has no embedding yet).
- `release_year = Number(release_date.slice(0,4))` whenever `release_date` is set; both are written by the same `toMovieRow` call.
- Catalog writes occur only through the `app_inngest` role inside an `asInngest()` transaction on the unpooled connection. The request path `db` client holds only `SELECT` on `movies` (migration 0001, unchanged).
- `last_refreshed_at` never decreases for a row.
- Active row count tracks `TARGET_CATALOG_SIZE` within about 15 percent; discover pagination drift and detail time filtering make this a target, not a hard constraint.

**Security model**:
- No user data, no PII; the catalog is public movie metadata only. No compliance scope.
- `TMDB_API_READ_ACCESS_TOKEN` is server only, read through `src/env.ts`, never sent to the client. Posters load from the TMDB CDN by public URL.
- All catalog mutations run in Inngest functions on the Node runtime as `app_inngest` (a `BYPASSRLS` role; `movies` itself carries no RLS). No Server Action or Route Handler writes `movies`.
- The backfill is triggered only by the `pnpm catalog:seed` script sending a signed Inngest event with `INNGEST_EVENT_KEY`. There is no HTTP catalog admin surface (the admin panel is deferred in scope). `/api/inngest` is signature verified with `INNGEST_SIGNING_KEY`.
- TMDB's API terms require visible attribution in the product UI; that placement is a follow up for the design system or marketing feature, not this pipeline.

**Configuration required**: no new environment variables. Reuses `TMDB_API_READ_ACCESS_TOKEN`, `OPENAI_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `DATABASE_URL_UNPOOLED`, all declared in spec 0001. New file `src/features/catalog/catalog.config.ts` holds the typed constants (starting values are the recommended defaults, tune in this one file):

- `TARGET_CATALOG_SIZE` = 10000
- `CANDIDATE_OVERFETCH` = 1.25 (seed emits `TARGET * OVERFETCH` candidates to absorb detail time filter loss)
- `DISCOVER_SORTS` = `[{ sortBy: "popularity.desc", voteCountGte: 200, budget: 6500 }, { sortBy: "vote_average.desc", voteCountGte: 1000, budget: 3500 }, { sortBy: "revenue.desc", voteCountGte: 500, budget: 0 }]` (the third is a reserve; raise its `budget` if the first two under fill)
- `MIN_VOTE_COUNT` = 200 (the `qualifies()` floor, separate from the per sort discover floors)
- `MAX_DISCOVER_PAGES` = 500 (TMDB's hard cap per query)
- `KEYWORD_LIMIT` = 15, `CAST_LIMIT` = 5
- `WEEKLY_REFRESH_SLICE` = 2000, `EMBED_SWEEP_LIMIT` = 2000
- `TMDB_METADATA_LANGUAGE` = `"en-US"`
- `TMDB_THROTTLE` = `{ limit: 40, period: "1s" }`
- `IMAGE_BASE_URL` = `"https://image.tmdb.org/t/p/"`
- `EMBED_BATCH_SIZE` = 100, `INGEST_CONCURRENCY` = 10
- `EMBEDDING_TEXT_VERSION` = `"v1"` (prefixed into the hashed text, so a deliberate format change is a greppable, intentional 10k row re embed)

**Error handling pattern** (one pattern across the feature): pure helpers (`qualifies`, `toMovieRow`, `buildEmbeddingText`, `embeddingInputHash`) take data and return values, no I/O. The TMDB client returns a `Result` at its boundary. Inside an Inngest step a retriable `Result` error is thrown so Inngest retries per the spec 0001 policy (10s timeout, 3 attempts, backoff with jitter, retry on 429/5xx/network); a TMDB 404 is thrown as `NonRetriableError`. Each `catalog-ingest-movie` invocation wraps its work in try/catch: on a non retriable failure or exhausted retries it logs the `tmdbId` and step name and returns, so one dead movie never aborts the run. `asInngest(fn)` always opens a transaction (the `set local role` is transaction scoped).

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path: `pnpm catalog:seed` against a clean local Supabase stack with `inngest dev` running; after `catalog-seed` and `catalog-ingest-movie` drain, `count(*) from movies where tmdb_status='active'` is within 15 percent of 10000 and every row has `poster_path`, `overview`, and non empty `genres`; after `catalog-embed-movies` and the null sweep drain, `count(*) filter (where embedding is not null)` equals the active row count. Verifies **AC-1**, **AC-3**, **AC-4**.
- Idempotency: run `pnpm catalog:seed` twice; row count is unchanged, `updated_at` advances, no duplicate `tmdb_id`, and no existing `embedding` is nulled. Verifies **AC-2**, **AC-4**.
- Embedding provider failure: force `catalog-embed-movies` to throw for one batch; those movies persist with `embedding` null, the backfill completes, and a subsequent `catalog-refresh` null sweep fills them. Verifies **AC-4**, **AC-6**.
- Refresh fall out: a movie whose `vote_count` drops below the floor on re fetch keeps its row with `tmdb_status='disqualified'` and refreshed metadata; a movie returning TMDB 404 gets `tmdb_status='removed'` and untouched metadata; a `user_movie_interactions` row referencing either still joins to a movie. Verifies **AC-6**, **AC-7**.
- HNSW query: after Migration B, `select id from movies order by embedding <=> $queryVector limit 20` returns 20 ranked rows and `explain` shows an index scan on the HNSW index. Verifies **AC-5**.
- Write path isolation: inside a transaction, `set local role app_user; insert into movies (...)` is denied with a permission error; the same insert through `src/db/inngest-client.ts` (`set local role app_inngest`) succeeds. Verifies **AC-8**.

## Build plan

Ordered by the project's Tracer Bullet approach: get the platform wiring and one real movie end to end through fetch, upsert, and embed first, then thicken to the full backfill, then add refresh.

1. **Dependencies and platform wiring.** Install `inngest`, `ai`, `@ai-sdk/openai`. Write `src/lib/inngest/client.ts` (the Inngest client with typed `EventSchemas` for the three `catalog/*` events) and `src/lib/ai/registry.ts` (the OpenAI embedding model, keyed, per spec 0001). Replace the `POST /api/inngest` 501 stub with `serve()`. Satisfies **AC-9** (foundation for the events), unblocks the rest.
2. **Migration A: extend `movies`, add the job role grant, fix the column types.** Add `release_date`, `runtime`, `vote_average` (`numeric(3,1)`, `{ mode: "number" }`), `vote_count` (not null default 0), `popularity`, `original_language`, `tmdb_status` (not null default `'active'`, with the `check`), `embedding_input_hash`, `last_refreshed_at`. Add `cast_members.$type<readonly CastMember[]>()`. Add the partial index `movies (id) where embedding is null`. Add `GRANT "app_inngest" TO "postgres"`. `pnpm db:generate`, review, `pnpm db:migrate`. Satisfies **AC-3**, **AC-7**, **AC-9**.
3. **Inngest database client.** `src/db/inngest-client.ts`: a `postgres-js` client on `DATABASE_URL_UNPOOLED`, plus `asInngest(fn)` that always opens a transaction beginning with `set local role app_inngest` and runs `fn` in it. Satisfies **AC-8**.
4. **TMDB client.** Flesh out `src/lib/tmdb/`: `tmdbFetch` (10s timeout, 3 attempts, backoff with jitter, retry on 429/5xx/network, `NonRetriableError` on 404, Bearer token), `discoverMovies({ page, sortBy, voteCountGte, releasedBefore | releasedAfter })`, `getMovieDetail` (`append_to_response=keywords,credits`, `language=en-US`), every response Zod parsed (normalising `release_date: ""` and `runtime: 0` to `undefined`), each returning a `Result`. No genre list endpoint. Satisfies **AC-1**, **AC-3**.
5. **Catalog domain module (pure).** `src/features/catalog/`: `catalog.config.ts` (all knobs above), `qualifies(detail)`, `toMovieRow(detail)` (genres from `detail.genres[].name`, `release_year` in TS, Zod normalised inputs), `buildEmbeddingText(row)` (labelled multi line block, empty value lines omitted), `embeddingInputHash(text)` (SHA-256 hex of `EMBEDDING_TEXT_VERSION + text`). No I/O; unit tested. Satisfies **AC-3**, **AC-9**, **AC-10**.
6. **Thin thread: `catalog-ingest-movie` plus `catalog-embed-movies`.** Implement both functions; register them in `src/app/api/inngest/route.ts`. `catalog-ingest-movie` upserts via the fixed set-list (no embedding columns), sets `updated_at`/`last_refreshed_at = now()`, and emits an embed event only on a hash or model mismatch. `catalog-embed-movies` re selects rows by id, asserts response length, bulk updates with the `values` join and `::vector` cast. Drive one known `tmdbId` end to end and confirm the row holds a `vector(1536)` and re running ingest does not re embed or null it. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-8**, **AC-10**.
7. **`catalog-seed` plus `pnpm catalog:seed`.** The seed function pages `/discover` per `DISCOVER_SORTS` entry with its own floor and budget, dedupes against an in memory `Set`, emits `catalog/movie.ingest.requested` up to `budget` per sort and `TARGET_CATALOG_SIZE * CANDIDATE_OVERFETCH` overall; mark it `singleton`; apply `throttle` from `TMDB_THROTTLE`. Add `scripts/catalog-seed.ts` (run with `tsx`) and the `package.json` script that sends `catalog/seed.requested`. Run it against local Supabase with `inngest dev` and confirm roughly ten thousand `active` rows. Satisfies **AC-1**, **AC-2**, **AC-9**.
8. **Migration B: HNSW index.** After the backfill drains, add the HNSW index expression to `schema.ts`, `pnpm db:generate` (it emits its own migration), prepend `set maintenance_work_mem = '256MB'`, review, migrate. Smoke a cosine distance query and confirm the index is used. Satisfies **AC-5**.
9. **`catalog-refresh` weekly cron.** Config `{ cron: "0 4 * * 1" }`. Implement the three passes (new releases, stalest slice by `last_refreshed_at`, `embedding is null` sweep capped at `EMBED_SWEEP_LIMIT`) and the `tmdb_status` transitions on the `refresh` path in `catalog-ingest-movie` (disqualified = full upsert with the flag, removed = narrow update). Satisfies **AC-6**, **AC-7**.
10. **verify.md.** Write `docs/specs/0003-movie-catalog-ingestion/verify.md` mapping AC-1 through AC-10 to the concrete checks in Critical test scenarios.

## Consequences

**Positive**:
- Feed cold start (spec 0002) and vibe search (feature 11) both get a real catalog with a popularity signal and embeddings from one pipeline, not two.
- Every catalog write is idempotent on `tmdb_id` and can never touch the embedding columns, so the backfill is safely re runnable and the weekly refresh cannot double insert or wipe a vector.
- Embedding is decoupled from ingestion: an OpenAI outage slows enrichment but never blocks catalog growth, and the bounded null sweep self heals.
- No new tables and no new environment variables; the tuning knobs sit in one reviewable config file.

**Negative / tradeoffs**:
- `embedding_input_hash` is a stored derived value, which the general rule is to avoid. Accepted deliberately: it is the cheap way to avoid re embedding all ten thousand movies every refresh, and the `EMBEDDING_TEXT_VERSION` prefix makes a real format change a deliberate, greppable event; a stale hash only causes a redundant embed, never wrong data.
- Keeping `disqualified` and `removed` rows forever means the catalog slowly accumulates dead rows with no compaction. At this scale (a few hundred over years) that is fine; a cleanup job may be wanted eventually.
- The rolling `last_refreshed_at` slice means a given movie's rating and popularity can be up to about five weeks stale (10000 rows over 2000 per week). Fine for a taste app, not for a "trending now" surface.
- `popularity` decays on TMDB's side, so a row not in the current refresh slice carries an increasingly meaningless number until its turn. Feature 7 should rank on `vote_average` and `vote_count` for stability and treat `popularity` as best effort.
- The backfill emits well over ten thousand Inngest events and, at a target of about two steps per movie (one fetch, one upsert) plus the batched embed pass, on the order of 25k to 30k steps in one run. That fits the local `inngest dev` server and is where the initial backfill should run; on Inngest's hosted free tier it is a large fraction of a month's step budget, so a production re seed is a conscious cost. Noted, not designed around.
- TMDB's 500 page cap times two active sorts times 20 results per page is a 20000 candidate ceiling before the roughly 20 to 30 percent detail time filter loss, so 10000 stored is reachable but not generous; the reserve `revenue.desc` sort is the headroom, and 8000 is the honest floor if the first two sorts under fill.
- A seed that dies mid run restarts from page 1 on the `singleton` re run and re walks TMDB (the in memory `Set` does not survive); the upsert makes this correct but not cheap.
- `release_year` is now derived from `release_date` in `toMovieRow`, a small denormalisation (two columns, one truth) written together; a later manual edit to one without the other would drift.

**Neutral**:
- The GIN indexes on `genres` and `keywords` and the `vector(1536)` column already exist from spec 0002; this feature adds only the new column set, the `embedding is null` partial index, and the post backfill HNSW index that spec 0002 explicitly deferred here.
- The `app_inngest` `BYPASSRLS` role already exists (migration 0001); this feature only adds `GRANT app_inngest TO postgres` so the unpooled client can assume it with `set local role`.
- The TMDB image base URL is hardcoded to the documented `https://image.tmdb.org/t/p/` rather than fetched from `/configuration` each run; if TMDB ever changes its CDN host this is a one line config edit, because paths are stored, not URLs.
- New conventions for this area: the Inngest fan out and batch consumer pattern, the `Result` at the boundary plus throw inside a step convention, and the `set local role` job connection.

## Follow-up

- [ ] TMDB attribution is required by the TMDB API terms: the UI must show "This product uses the TMDB API but is not endorsed or certified by TMDB" plus the TMDB logo. Feature 5 (design system) or feature 13 (marketing site) owns placing it.
- [ ] Feature 7 (feed) and feature 11 (vibe search) own `hnsw.ef_search` and over fetch tuning now that the HNSW index exists and the feed applies its exclusion filter after the vector search (carried over from spec 0002's Consequences).
- [ ] `catalog.config.ts` conventions (where catalog knobs live, and that ingestion writes only via `app_inngest`) are not yet in an `AGENTS.md`. Consider a nested `src/features/catalog/AGENTS.md` before feature 7 or 11 build on the catalog, so they read it the intended way.
- [ ] AC-8's full "denied on the request path" test only becomes real once feature 6 makes the request path connect as `app_user`; until then it is checked with `set local role app_user` in a transaction.
- [ ] A compaction job for `tmdb_status in ('disqualified','removed')` rows is not built; revisit if dead rows ever become material.
