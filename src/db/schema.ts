/**
 * Database schema.
 *
 * Feature 3 (data model), spec 0002. Every user owned table (all but
 * `movies`) enables and forces row level security, scoped to `app.user_id`,
 * enforced against the dedicated `app_user` role declared below (not the
 * table owning role `drizzle-kit` migrates as; a table owner is exempt from
 * its own RLS policies unless the policy runs as some other role). `FORCE
 * ROW LEVEL SECURITY` itself has no Drizzle Kit API yet, it is added as
 * `--custom` SQL in the migration (see src/db/migrations).
 *
 * `movies` carries no RLS: it is a shared, publicly readable catalog.
 *
 * See docs/specs/0002-data-model/index.md for the full data model sketch,
 * upsert semantics, and security model this file implements.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * A single billed cast entry on a movie (spec 0003, AC-3). Stored in
 * `movies.cast_members` as a JSON array; validated by a Zod schema at the
 * TMDB import boundary, never trusted raw.
 */
export type CastMember = {
  readonly name: string;
  readonly character: string;
};

/**
 * The request path's application role. Enforced-but-non-owner: granted
 * exactly `SELECT, INSERT, UPDATE, DELETE` on every user owned table below
 * and `SELECT` on `movies` (grants applied as `--custom` SQL, Drizzle Kit
 * only tracks the role's existence). Declared in `drizzle.config.ts`'s
 * `entities.roles` so `generate` emits `CREATE ROLE` for it without trying
 * to manage Supabase's own built-in roles.
 *
 * No LOGIN of its own for now: feature 6 (accounts & sign in) decides how
 * the request path's connection actually assumes this role (a dedicated
 * login + password, or `SET ROLE` from an already authenticated
 * connection) when it wires `withUser()`. This schema only needs the role
 * to exist so policies below can target it. Plain `inherit`, no
 * `createRole`/`createDb`: `app_user` gets exactly the table grants below,
 * nothing more.
 */
export const appUser = pgRole("app_user", { inherit: true });

export const reactionTypeEnum = pgEnum("reaction_type", ["like", "dislike", "seen", "skip"]);
export const reasonSourceEnum = pgEnum("reason_source", ["generated", "templated"]);

/** Fixed by spec 0001. */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("users_self_access", {
      for: "all",
      to: appUser,
      using: sql`${table.id} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.id} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/**
 * Fixed by spec 0001, extended by spec 0003 (movie catalog & ingestion).
 * No RLS: a shared, publicly readable catalog. Writes happen only from the
 * Inngest catalog jobs, over the `app_inngest` bypassrls role on the direct
 * connection, never from a user request (the request path role `app_user`
 * holds only `SELECT` here).
 *
 * The four embedding columns (`embedding`, `embedding_model`, `embedded_at`,
 * `embedding_input_hash`) are written only by `catalog-embed-movies`, and
 * only as a complete set. Every other write path (`catalog-ingest-movie`'s
 * upsert) omits them, so a metadata refresh can never null an existing
 * vector (spec 0003, key invariants).
 */
export const movies = pgTable(
  "movies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tmdbId: integer("tmdb_id").notNull().unique(),
    title: text("title").notNull(),
    overview: text("overview"),
    /** Full date, for recency weighting and the weekly "new releases" pass. `release_year` is derived from it in `toMovieRow`. */
    releaseDate: date("release_date"),
    releaseYear: integer("release_year"),
    /** Minutes. */
    runtime: integer("runtime"),
    genres: text("genres")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Top five { name, character } entries; validated by a Zod schema at the TMDB import boundary (spec 0003). */
    castMembers: jsonb("cast_members")
      .$type<readonly CastMember[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    posterPath: text("poster_path"),
    /** TMDB rating, 0.0 to 10.0. `{ mode: "number" }` so it reads back as a number, not a string. */
    voteAverage: numeric("vote_average", { precision: 3, scale: 1, mode: "number" }),
    /** Sample size behind `vote_average`, and the qualification floor input. */
    voteCount: integer("vote_count").notNull().default(0),
    /** TMDB trending score; refreshed weekly, decays on TMDB's side, best effort between refreshes. */
    popularity: real("popularity"),
    /** ISO 639-1 code, kept for reference and filtering. */
    originalLanguage: text("original_language"),
    /** `active` while it passes the filters; `disqualified` / `removed` rows are retained, never deleted. */
    tmdbStatus: text("tmdb_status").notNull().default("active"),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    /** SHA-256 hex of the versioned embedding text block; written only alongside `embedding`, by `catalog-embed-movies`. */
    embeddingInputHash: text("embedding_input_hash"),
    /** `now()` on every successful upsert from TMDB; monotonic non-decreasing. Drives the weekly stalest-slice refresh. */
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "movies_tmdb_status_check",
      sql`${table.tmdbStatus} in ('active', 'disqualified', 'removed')`,
    ),
    index("movies_genres_idx").using("gin", table.genres),
    index("movies_keywords_idx").using("gin", table.keywords),
    // For the `catalog-refresh` re-embed sweep: find rows still missing a vector.
    index("movies_embedding_null_idx")
      .on(table.id)
      .where(sql`${table.embedding} is null`),
    // HNSW on `embedding` (vector_cosine_ops) is declared here and generated
    // as its own migration *after* the initial ~10k backfill drains (spec
    // 0003, AC-5 and Build plan step 8): building it once on a full table is
    // much faster than incrementally during the bulk load. Not present yet.
  ],
);

/**
 * One row per `(user_id, movie_id)`, no surrogate id: the natural key is
 * the only key anything looks this table up by. Every write is a single
 * `insert ... on conflict (user_id, movie_id) do update` (see
 * `src/db/interactions.ts`), never a read then write.
 *
 * `updated_at` is maintained by a `BEFORE UPDATE` trigger (added as
 * `--custom` SQL), not Drizzle's `$onUpdate`, which does not fire on the
 * `ON CONFLICT DO UPDATE` path this table relies on.
 */
export const userMovieInteractions = pgTable(
  "user_movie_interactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    reactionType: reactionTypeEnum("reaction_type"),
    rating: numeric("rating", { mode: "number", precision: 2, scale: 1 }),
    /** Monotonic: once set by a feed dismissal, never cleared by a later write (enforced in the upsert, not a constraint). */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    /**
     * `text` + check, not a Postgres enum: this is the value most likely to
     * grow (e.g. a future import source), and `ALTER TYPE ... ADD VALUE` is
     * a migration hazard a `CHECK` constraint does not have.
     */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.movieId] }),
    check(
      "user_movie_interactions_source_check",
      sql`${table.source} in ('swipe', 'letterboxd_import', 'manual_rating')`,
    ),
    check(
      "user_movie_interactions_rating_range_check",
      sql`${table.rating} is null or (${table.rating} between 0.5 and 5.0)`,
    ),
    check(
      "user_movie_interactions_rating_half_step_check",
      sql`${table.rating} is null or (${table.rating} * 2 = trunc(${table.rating} * 2))`,
    ),
    check(
      "user_movie_interactions_has_signal_check",
      sql`${table.reactionType} is not null or ${table.rating} is not null or ${table.dismissedAt} is not null`,
    ),
    index("user_movie_interactions_dismissed_idx")
      .on(table.userId)
      .where(sql`${table.dismissedAt} is not null`),
    pgPolicy("user_movie_interactions_owner_access", {
      for: "all",
      to: appUser,
      using: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/** One row per user, created lazily on first interaction. */
export const tasteProfile = pgTable(
  "taste_profile",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1536 }),
    /** Mirrors `movies.embedding_model`, so a model change is detectable rather than silently ranking on incompatible vectors. */
    embeddingModel: text("embedding_model"),
    basedOnCount: integer("based_on_count").notNull().default(0),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
  },
  (table) => [
    pgPolicy("taste_profile_owner_access", {
      for: "all",
      to: appUser,
      using: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/** One row per `(user_id, movie_id)`, no surrogate id. Never generated inline on a render request. */
export const reasons = pgTable(
  "reasons",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    reasonText: text("reason_text").notNull(),
    source: reasonSourceEnum("source").notNull(),
    /** The model id from the `src/lib/ai` registry (spec 0001). */
    model: text("model"),
    promptVersion: text("prompt_version"),
    /** Snapshot of `taste_profile.based_on_count` at generation time, so staleness is detectable later. */
    basedOnCount: integer("based_on_count"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.movieId] }),
    pgPolicy("reasons_owner_access", {
      for: "all",
      to: appUser,
      using: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/** One row per `(user_id, movie_id)`; no history kept after a removal. */
export const watchlistItems = pgTable(
  "watchlist_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.movieId] }),
    index("watchlist_items_user_added_idx").on(table.userId, table.addedAt.desc()),
    pgPolicy("watchlist_items_owner_access", {
      for: "all",
      to: appUser,
      using: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/**
 * Fixed by spec 0001. Per user rate limiting for paid AI provider calls.
 * Increments are atomic and increment-first (see `src/db/usage.ts`): a
 * read-then-write check-then-increment races under concurrent requests
 * even inside one transaction.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    /** A tumbling UTC window: hourly for `vibe_search`, daily for the rest. */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.resource, table.windowStart] }),
    check(
      "usage_counters_resource_check",
      sql`${table.resource} in ('vibe_search', 'reason_regeneration', 'letterboxd_import')`,
    ),
    pgPolicy("usage_counters_owner_access", {
      for: "all",
      to: appUser,
      using: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${table.userId} = nullif(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
).enableRLS();
