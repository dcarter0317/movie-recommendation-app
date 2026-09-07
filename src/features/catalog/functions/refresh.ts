/**
 * `catalog-refresh` (spec 0003, AC-6, AC-7). The weekly cron that keeps the
 * catalog current, in three passes:
 *
 *   a. new releases  — discover the last `NEW_RELEASE_LOOKBACK_DAYS` days
 *      and enqueue them as `source: "seed"` (insert only if they qualify;
 *      a 404 is a skip, never a stored row).
 *   b. stalest slice — re-fetch the `WEEKLY_REFRESH_SLICE` rows with the
 *      oldest `last_refreshed_at`, as `source: "refresh"` so
 *      `catalog-ingest-movie` applies the `disqualified` / `removed`
 *      transitions.
 *   c. null sweep    — re-queue up to `EMBED_SWEEP_LIMIT` rows that still
 *      have no embedding.
 */
import { asc, isNull, sql } from "drizzle-orm";

import { asInngest } from "@/db/inngest-client";
import { movies } from "@/db/schema";
import {
  catalogMovieEmbedRequested,
  catalogMovieIngestRequested,
  inngest,
} from "@/lib/inngest/client";
import { discoverMovies } from "@/lib/tmdb";
import {
  DISCOVER_SORTS,
  EMBED_SWEEP_LIMIT,
  MAX_DISCOVER_PAGES,
  NEW_RELEASE_LOOKBACK_DAYS,
  REFRESH_CRON,
  TMDB_THROTTLE,
  WEEKLY_REFRESH_SLICE,
} from "../catalog.config";

const SEND_CHUNK = 200;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const catalogRefresh = inngest.createFunction(
  {
    id: "catalog-refresh",
    retries: 1,
    throttle: TMDB_THROTTLE,
    triggers: [{ cron: REFRESH_CRON }],
  },
  async ({ step, logger }) => {
    const sendIngest = async (
      ids: readonly number[],
      source: "seed" | "refresh",
      tag: string,
    ): Promise<void> => {
      for (let i = 0; i < ids.length; i += SEND_CHUNK) {
        const chunk = ids.slice(i, i + SEND_CHUNK);
        await step.sendEvent(
          `${tag}-${i}`,
          chunk.map((tmdbId) => catalogMovieIngestRequested.create({ tmdbId, source })),
        );
      }
    };

    // (a) New releases: one discover sweep over the primary sort.
    const releasedAfter = isoDaysAgo(NEW_RELEASE_LOOKBACK_DAYS);
    const primarySort = DISCOVER_SORTS[0];
    const newReleaseIds = new Set<number>();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= MAX_DISCOVER_PAGES) {
      const currentPage = page;
      const result = await step.run(`new-releases-p${currentPage}`, () =>
        discoverMovies({
          page: currentPage,
          sortBy: primarySort.sortBy,
          voteCountGte: 0,
          releasedAfter,
        }),
      );
      if (!result.ok) {
        logger.warn("catalog-refresh: new-releases discover failed", { page: currentPage });
        break;
      }
      totalPages = Math.min(result.value.total_pages, MAX_DISCOVER_PAGES);
      for (const { id } of result.value.results) newReleaseIds.add(id);
      page += 1;
    }
    await sendIngest([...newReleaseIds], "seed", "emit-new-releases");

    // (b) Stalest slice: oldest last_refreshed_at first, nulls first.
    const staleRows = await step.run("select-stale", () =>
      asInngest((tx) =>
        tx
          .select({ tmdbId: movies.tmdbId })
          .from(movies)
          .orderBy(sql`${movies.lastRefreshedAt} asc nulls first`)
          .limit(WEEKLY_REFRESH_SLICE),
      ),
    );
    await sendIngest(
      staleRows.map((r) => r.tmdbId),
      "refresh",
      "emit-stale",
    );

    // (c) Null sweep: rows still missing an embedding.
    const nullRows = await step.run("select-null-embeddings", () =>
      asInngest((tx) =>
        tx
          .select({ id: movies.id, tmdbId: movies.tmdbId })
          .from(movies)
          .where(isNull(movies.embedding))
          .orderBy(asc(movies.id))
          .limit(EMBED_SWEEP_LIMIT),
      ),
    );
    for (let i = 0; i < nullRows.length; i += SEND_CHUNK) {
      const chunk = nullRows.slice(i, i + SEND_CHUNK);
      await step.sendEvent(
        `emit-embed-sweep-${i}`,
        chunk.map((row) =>
          catalogMovieEmbedRequested.create({ movieId: row.id, tmdbId: row.tmdbId }),
        ),
      );
    }

    logger.info("catalog-refresh: done", {
      newReleases: newReleaseIds.size,
      staleRequeued: staleRows.length,
      embedSweep: nullRows.length,
    });

    return {
      newReleases: newReleaseIds.size,
      staleRequeued: staleRows.length,
      embedSweep: nullRows.length,
    };
  },
);
