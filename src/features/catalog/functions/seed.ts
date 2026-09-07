/**
 * `catalog-seed` (spec 0003, AC-1, AC-2, AC-9). The one-time backfill
 * driver, triggered by `pnpm catalog:seed`.
 *
 * For each entry in `DISCOVER_SORTS` it pages `/discover/movie` with that
 * sort's vote floor, collecting result ids into one in-memory `Set` that
 * spans every sort (the only dedupe; the upsert handles the rest). It emits
 * one `catalog/movie.ingest.requested` per newly seen id until the sort
 * hits its `budget` or the run hits the global `CANDIDATE_CAP`.
 *
 * `singleton` keeps two backfills from overlapping; `throttle` bounds the
 * outbound TMDB rate. A seed that dies mid-run restarts from page 1 (the
 * `Set` does not survive); the upsert makes that correct, if not cheap.
 */
import { catalogMovieIngestRequested, catalogSeedRequested, inngest } from "@/lib/inngest/client";
import { discoverMovies } from "@/lib/tmdb";
import {
  CANDIDATE_CAP,
  DISCOVER_SORTS,
  MAX_DISCOVER_PAGES,
  TMDB_THROTTLE,
} from "../catalog.config";

const SEND_CHUNK = 200;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const catalogSeed = inngest.createFunction(
  {
    id: "catalog-seed",
    retries: 1,
    singleton: { mode: "skip" },
    throttle: TMDB_THROTTLE,
    triggers: [catalogSeedRequested],
  },
  async ({ step, logger }) => {
    const releasedBefore = todayIso();
    const seen = new Set<number>();
    let emitted = 0;

    for (const sort of DISCOVER_SORTS) {
      if (sort.budget <= 0) continue;

      let sortEmitted = 0;
      let page = 1;
      let totalPages = 1;

      while (
        page <= totalPages &&
        page <= MAX_DISCOVER_PAGES &&
        sortEmitted < sort.budget &&
        emitted < CANDIDATE_CAP
      ) {
        const stepId = `discover-${sort.sortBy}-p${page}`;
        const currentPage = page;
        const result = await step.run(stepId, () =>
          discoverMovies({
            page: currentPage,
            sortBy: sort.sortBy,
            voteCountGte: sort.voteCountGte,
            releasedBefore,
          }),
        );

        if (!result.ok) {
          logger.warn("catalog-seed: discover page failed, stopping this sort", {
            sortBy: sort.sortBy,
            page: currentPage,
            error: result.error,
          });
          break;
        }

        totalPages = Math.min(result.value.total_pages, MAX_DISCOVER_PAGES);

        const fresh: number[] = [];
        for (const { id } of result.value.results) {
          if (seen.has(id)) continue;
          seen.add(id);
          fresh.push(id);
          sortEmitted += 1;
          emitted += 1;
          if (sortEmitted >= sort.budget || emitted >= CANDIDATE_CAP) break;
        }

        for (let i = 0; i < fresh.length; i += SEND_CHUNK) {
          const chunk = fresh.slice(i, i + SEND_CHUNK);
          await step.sendEvent(
            `emit-${sort.sortBy}-p${currentPage}-${i}`,
            chunk.map((tmdbId) => catalogMovieIngestRequested.create({ tmdbId, source: "seed" })),
          );
        }

        page += 1;
      }

      logger.info("catalog-seed: sort complete", { sortBy: sort.sortBy, sortEmitted });
    }

    logger.info("catalog-seed: done", { candidatesEmitted: emitted, uniqueIds: seen.size });
    return { candidatesEmitted: emitted };
  },
);
