/**
 * `catalog-ingest-movie` (spec 0003, AC-2, AC-3, AC-7, AC-8, AC-10).
 *
 * One invocation per candidate movie. Fetches `/movie/{id}`, decides with
 * `qualifies()`, maps with `toMovieRow()`, and upserts idempotently on
 * `tmdb_id` over the fixed set-list (never the embedding columns). If the
 * versioned embedding text or model has moved, or the row has no vector, it
 * emits `catalog/movie.embed.requested`.
 *
 * One dead movie never fails the run: a 404 is a logged skip on the seed
 * path and a narrow `tmdb_status = 'removed'` on the refresh path; an
 * exhausted transient failure is logged and swallowed.
 */
import { sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { asInngest, type InngestDbTx } from "@/db/inngest-client";
import { movies } from "@/db/schema";
import { EMBEDDING_MODEL_KEY } from "@/lib/ai/registry";
import {
  catalogMovieEmbedRequested,
  catalogMovieIngestRequested,
  inngest,
} from "@/lib/inngest/client";
import { getMovieDetail } from "@/lib/tmdb";
import { INGEST_CONCURRENCY, TMDB_METADATA_LANGUAGE, TMDB_THROTTLE } from "../catalog.config";
import {
  buildEmbeddingText,
  embeddingInputHash,
  qualifies,
  toMovieRow,
  type MovieRow,
} from "../catalog";

type TmdbStatus = "active" | "disqualified";

/** The fixed upsert set-list: no `id`, no `tmdb_id` beyond the conflict key, no embedding columns. */
async function upsertMovie(
  tx: InngestDbTx,
  row: MovieRow,
  status: TmdbStatus,
): Promise<{
  id: string;
  storedHash: string | null;
  storedModel: string | null;
  hasEmbedding: boolean;
}> {
  const values = {
    tmdbId: row.tmdbId,
    title: row.title,
    overview: row.overview,
    releaseDate: row.releaseDate,
    releaseYear: row.releaseYear,
    runtime: row.runtime,
    genres: [...row.genres],
    keywords: [...row.keywords],
    castMembers: row.castMembers,
    posterPath: row.posterPath,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    popularity: row.popularity,
    originalLanguage: row.originalLanguage,
    tmdbStatus: status,
  };

  const [updated] = await tx
    .insert(movies)
    .values(values)
    .onConflictDoUpdate({
      target: movies.tmdbId,
      set: {
        title: sql`excluded.title`,
        overview: sql`excluded.overview`,
        releaseDate: sql`excluded.release_date`,
        releaseYear: sql`excluded.release_year`,
        runtime: sql`excluded.runtime`,
        genres: sql`excluded.genres`,
        keywords: sql`excluded.keywords`,
        castMembers: sql`excluded.cast_members`,
        posterPath: sql`excluded.poster_path`,
        voteAverage: sql`excluded.vote_average`,
        voteCount: sql`excluded.vote_count`,
        popularity: sql`excluded.popularity`,
        originalLanguage: sql`excluded.original_language`,
        tmdbStatus: sql`excluded.tmdb_status`,
        lastRefreshedAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      id: movies.id,
      storedHash: movies.embeddingInputHash,
      storedModel: movies.embeddingModel,
      hasEmbedding: sql<boolean>`${movies.embedding} is not null`,
    });

  if (!updated)
    throw new Error(`catalog-ingest-movie: upsert returned no row for tmdb_id ${row.tmdbId}`);
  return updated;
}

/** Narrow update for a movie that 404s on a refresh re-fetch: flag only, touch no metadata. */
async function markRemovedIfPresent(tmdbId: number): Promise<number> {
  return asInngest(async (tx) => {
    const rows = await tx
      .update(movies)
      .set({ tmdbStatus: "removed" })
      .where(sql`${movies.tmdbId} = ${tmdbId}`)
      .returning({ id: movies.id });
    return rows.length;
  });
}

export const catalogIngestMovie = inngest.createFunction(
  {
    id: "catalog-ingest-movie",
    retries: 1,
    concurrency: { limit: INGEST_CONCURRENCY },
    throttle: TMDB_THROTTLE,
    triggers: [catalogMovieIngestRequested],
  },
  async ({ event, step, logger }) => {
    const { tmdbId, source } = event.data;

    const todayIso = await step.run("today", () =>
      Promise.resolve(new Date().toISOString().slice(0, 10)),
    );

    let detailResult;
    try {
      detailResult = await step.run("fetch-detail", () =>
        getMovieDetail(tmdbId, TMDB_METADATA_LANGUAGE),
      );
    } catch (caught) {
      if (caught instanceof NonRetriableError) {
        if (source === "refresh") {
          const touched = await step.run("mark-removed", () => markRemovedIfPresent(tmdbId));
          logger.info("catalog-ingest-movie: TMDB 404 on refresh", { tmdbId, marked: touched });
        } else {
          logger.info("catalog-ingest-movie: TMDB 404 on seed, skipped", { tmdbId });
        }
        return { tmdbId, outcome: "removed_or_skipped" as const };
      }
      throw caught;
    }

    if (!detailResult.ok) {
      logger.warn("catalog-ingest-movie: TMDB fetch failed after retries, skipped", {
        tmdbId,
        error: detailResult.error,
      });
      return { tmdbId, outcome: "fetch_failed" as const };
    }

    const detail = detailResult.value;
    const isQualified = qualifies(detail, todayIso);

    if (!isQualified && source === "seed") {
      logger.info("catalog-ingest-movie: does not qualify on seed, not stored", { tmdbId });
      return { tmdbId, outcome: "not_qualified" as const };
    }

    const row = toMovieRow(detail);
    const status: TmdbStatus = isQualified ? "active" : "disqualified";

    const stored = await step.run("upsert", () => asInngest((tx) => upsertMovie(tx, row, status)));

    if (!isQualified) {
      logger.info("catalog-ingest-movie: disqualified on refresh, metadata refreshed", { tmdbId });
      return { tmdbId, outcome: "disqualified" as const };
    }

    const newHash = embeddingInputHash(
      buildEmbeddingText({
        title: row.title,
        releaseYear: row.releaseYear,
        genres: row.genres,
        keywords: row.keywords,
        castMembers: row.castMembers,
        overview: row.overview,
      }),
    );

    const needsEmbed =
      !stored.hasEmbedding ||
      stored.storedHash !== newHash ||
      stored.storedModel !== EMBEDDING_MODEL_KEY;

    if (needsEmbed) {
      await step.sendEvent("request-embed", [
        catalogMovieEmbedRequested.create({ movieId: stored.id, tmdbId }),
      ]);
    }

    return { tmdbId, outcome: "active" as const, embedRequested: needsEmbed };
  },
);
