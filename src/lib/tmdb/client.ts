/**
 * The TMDB API client (spec 0003, AC-1, AC-3).
 *
 * `tmdbFetch` is the one network primitive: Bearer auth from `src/env.ts`,
 * a 10s per-attempt timeout, up to 3 attempts with jittered backoff on
 * 429 / 5xx / network errors (the spec 0001 retry policy), and a thrown
 * `NonRetriableError` on a 404 (the movie is gone; retrying will not help).
 * Every other outcome, including exhausted retries and a schema mismatch,
 * comes back as a `Result` for the caller to handle.
 *
 * `discoverMovies` and `getMovieDetail` are thin typed wrappers over it.
 */
import { NonRetriableError } from "inngest";
import type { z } from "zod";

import { env } from "@/env";
import {
  discoverResponseSchema,
  movieDetailSchema,
  type DiscoverResponse,
  type MovieDetail,
} from "./schemas";
import { err, ok, type Result } from "./result";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 10_000;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full jitter: a random wait in `[0, base * 2^attempt]`, so retries do not thunder. */
function backoffDelay(attempt: number): number {
  return Math.random() * BASE_BACKOFF_MS * 2 ** attempt;
}

type FetchArgs = {
  readonly path: string;
  readonly query?: Record<string, string | number | undefined>;
};

function buildUrl({ path, query }: FetchArgs): string {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Fetch a TMDB endpoint and parse it with `schema`. Retries transient
 * failures; throws `NonRetriableError` on 404; returns `Result` otherwise.
 */
export async function tmdbFetch<TSchema extends z.ZodTypeAny>(
  args: FetchArgs,
  schema: TSchema,
): Promise<Result<z.infer<TSchema>>> {
  const url = buildUrl(args);
  let lastError: Result<never> = err({ kind: "network_error", message: "no attempt made" });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(backoffDelay(attempt));

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.TMDB_API_READ_ACCESS_TOKEN}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (response.status === 404) {
        throw new NonRetriableError(`TMDB 404 for ${args.path}`);
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = err({
          kind: response.status === 429 ? "rate_limited" : "server_error",
          message: `TMDB ${response.status} for ${args.path}`,
        });
        continue;
      }
      if (!response.ok) {
        return err({
          kind: "invalid_response",
          message: `TMDB ${response.status} for ${args.path}`,
        });
      }

      const json: unknown = await response.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return err({
          kind: "invalid_response",
          message: `TMDB ${args.path} failed schema: ${parsed.error.message}`,
        });
      }
      return ok(parsed.data);
    } catch (caught) {
      if (caught instanceof NonRetriableError) throw caught;
      lastError = err({
        kind: "network_error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  return lastError;
}

type DiscoverArgs = {
  readonly page: number;
  readonly sortBy: string;
  readonly voteCountGte: number;
  /** `primary_release_date.lte` — the seed's "released on or before today". */
  readonly releasedBefore?: string;
  /** `primary_release_date.gte` — the weekly "new releases" window. */
  readonly releasedAfter?: string;
};

export async function discoverMovies(args: DiscoverArgs): Promise<Result<DiscoverResponse>> {
  return tmdbFetch(
    {
      path: "/discover/movie",
      query: {
        page: args.page,
        sort_by: args.sortBy,
        "vote_count.gte": args.voteCountGte,
        "primary_release_date.lte": args.releasedBefore,
        "primary_release_date.gte": args.releasedAfter,
        include_adult: "false",
        include_video: "false",
        language: "en-US",
      },
    },
    discoverResponseSchema,
  );
}

export async function getMovieDetail(
  tmdbId: number,
  language: string,
): Promise<Result<MovieDetail>> {
  return tmdbFetch(
    {
      path: `/movie/${tmdbId}`,
      query: {
        append_to_response: "keywords,credits",
        language,
      },
    },
    movieDetailSchema,
  );
}
