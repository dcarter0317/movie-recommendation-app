/**
 * Every Inngest function this feature registers, in one array (spec 0003).
 *
 * `src/app/api/inngest/route.ts` serves exactly this list. Functions are
 * added here as the build plan milestones land:
 *   - `catalog-ingest-movie`, `catalog-embed-movies`  (thin thread)
 *   - `catalog-seed`                                   (backfill)
 *   - `catalog-refresh`                                (weekly cron)
 */
import { catalogEmbedMovies } from "./embed-movies";
import { catalogIngestMovie } from "./ingest-movie";
import { catalogRefresh } from "./refresh";
import { catalogSeed } from "./seed";

export const catalogFunctions = [
  catalogSeed,
  catalogIngestMovie,
  catalogEmbedMovies,
  catalogRefresh,
];
