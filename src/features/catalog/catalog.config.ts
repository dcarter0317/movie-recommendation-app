/**
 * Every tuning knob for the movie catalog pipeline, in one typed place
 * (spec 0003, AC-9). No new environment variable is added; the starting
 * values here are the recommended defaults, tune them in this file.
 */

/** Target number of `active` rows after the backfill. A target, not a hard constraint (discover drift + detail-time filtering). */
export const TARGET_CATALOG_SIZE = 10_000;

/** The seed over-fetches candidates by this factor to absorb detail-time filter loss. */
export const CANDIDATE_OVERFETCH = 1.25;

/** The global candidate cap for one seed run. */
export const CANDIDATE_CAP = Math.ceil(TARGET_CATALOG_SIZE * CANDIDATE_OVERFETCH);

/**
 * The `/discover/movie` sweeps the seed runs, each with its own sort, vote
 * floor, and candidate budget. The third is a reserve: raise its `budget`
 * if the first two under-fill.
 */
export const DISCOVER_SORTS: readonly {
  readonly sortBy: string;
  readonly voteCountGte: number;
  readonly budget: number;
}[] = [
  { sortBy: "popularity.desc", voteCountGte: 200, budget: 6_500 },
  { sortBy: "vote_average.desc", voteCountGte: 1_000, budget: 3_500 },
  { sortBy: "revenue.desc", voteCountGte: 500, budget: 0 },
];

/** The `qualifies()` vote-count floor, separate from the per-sort discover floors. */
export const MIN_VOTE_COUNT = 200;

/** TMDB's hard cap on pages per `/discover` query. */
export const MAX_DISCOVER_PAGES = 500;

/** Up to this many keyword tags are stored per movie, in TMDB order. */
export const KEYWORD_LIMIT = 15;

/** Up to this many cast entries are stored per movie, by billing order. */
export const CAST_LIMIT = 5;

/** Rows re-fetched per weekly refresh, oldest `last_refreshed_at` first. */
export const WEEKLY_REFRESH_SLICE = 2_000;

/** Rows with a null `embedding` re-queued per weekly refresh. */
export const EMBED_SWEEP_LIMIT = 2_000;

/** The `language` query parameter for TMDB metadata. */
export const TMDB_METADATA_LANGUAGE = "en-US";

/** Outbound TMDB request throttle, applied as Inngest `throttle` on the fetching functions. */
export const TMDB_THROTTLE = { limit: 40, period: "1s" } as const;

/** How many days back the weekly "new releases" discover pass looks. */
export const NEW_RELEASE_LOOKBACK_DAYS = 8;

/** Poster path prefix; the caller appends a size segment and the stored `poster_path`. */
export const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

/** Text blocks per `embedMany` call in `catalog-embed-movies`, and the Inngest batch size. */
export const EMBED_BATCH_SIZE = 100;

/** `catalog-ingest-movie` concurrency limit. */
export const INGEST_CONCURRENCY = 10;

/**
 * Prefixed into the hashed embedding text. Bumping it makes a deliberate
 * text-format change a greppable, intentional ~10k-row re-embed rather than
 * a silent drift.
 */
export const EMBEDDING_TEXT_VERSION = "v1";

/** Weekly refresh cron: Mondays 04:00 UTC. */
export const REFRESH_CRON = "0 4 * * 1";

/** Build a full poster URL from a stored `poster_path` and a TMDB size token (e.g. `"w500"`, `"original"`). */
export function posterUrl(posterPath: string, size: string): string {
  return `${IMAGE_BASE_URL}${size}${posterPath}`;
}
