/**
 * `catalog-embed-movies` (spec 0003, AC-4). The only writer of the four
 * embedding columns, and it writes them as a set.
 *
 * Inngest batches `catalog/movie.embed.requested` events (up to
 * `EMBED_BATCH_SIZE`, or a 10s wait). For each batch it re-selects the
 * rows by id (never trusting the event payload for the text), builds one
 * labelled block per row, makes a single `embedMany` call, asserts the
 * response count matches, then bulk-updates in one statement. If anything
 * throws, the whole batch stays null and the weekly sweep retries it.
 */
import { embedMany } from "ai";
import { sql } from "drizzle-orm";
import { inArray } from "drizzle-orm";

import { asInngest } from "@/db/inngest-client";
import { movies } from "@/db/schema";
import { EMBEDDING_MODEL_KEY, getEmbeddingModel } from "@/lib/ai/registry";
import { catalogMovieEmbedRequested, inngest } from "@/lib/inngest/client";
import { EMBED_BATCH_SIZE } from "../catalog.config";
import { buildEmbeddingText, embeddingInputHash } from "../catalog";

type EmbedRow = {
  readonly id: string;
  readonly title: string;
  readonly releaseYear: number | null;
  readonly genres: string[];
  readonly keywords: string[];
  readonly castMembers: readonly { name: string; character: string }[];
  readonly overview: string | null;
};

export const catalogEmbedMovies = inngest.createFunction(
  {
    id: "catalog-embed-movies",
    retries: 2,
    batchEvents: { maxSize: EMBED_BATCH_SIZE, timeout: "10s" },
    triggers: [catalogMovieEmbedRequested],
  },
  async ({ events, step, logger }) => {
    const movieIds = [...new Set(events.map((e) => e.data.movieId))];

    const rows = (await step.run("load-rows", () =>
      asInngest((tx) =>
        tx
          .select({
            id: movies.id,
            title: movies.title,
            releaseYear: movies.releaseYear,
            genres: movies.genres,
            keywords: movies.keywords,
            castMembers: movies.castMembers,
            overview: movies.overview,
          })
          .from(movies)
          .where(inArray(movies.id, movieIds)),
      ),
    )) as EmbedRow[];

    if (rows.length === 0) {
      logger.info("catalog-embed-movies: no rows for batch", { requested: movieIds.length });
      return { embedded: 0 };
    }

    const prepared = rows.map((row) => {
      const text = buildEmbeddingText({
        title: row.title,
        releaseYear: row.releaseYear,
        genres: row.genres,
        keywords: row.keywords,
        castMembers: row.castMembers,
        overview: row.overview,
      });
      return { id: row.id, text, hash: embeddingInputHash(text) };
    });

    const embeddings = await step.run("embed", async () => {
      const result = await embedMany({
        model: getEmbeddingModel(),
        values: prepared.map((p) => p.text),
      });
      if (result.embeddings.length !== prepared.length) {
        throw new Error(
          `catalog-embed-movies: expected ${prepared.length} embeddings, got ${result.embeddings.length}`,
        );
      }
      return result.embeddings;
    });

    const written = await step.run("write-embeddings", () =>
      asInngest(async (tx) => {
        const tuples = prepared.map(
          (p, i) =>
            sql`(${p.id}::uuid, ${JSON.stringify(embeddings[i])}::vector, ${EMBEDDING_MODEL_KEY}, ${p.hash})`,
        );
        const result = await tx.execute(sql`
          update ${movies} as m set
            embedding = v.embedding,
            embedding_model = v.model,
            embedded_at = now(),
            embedding_input_hash = v.hash
          from (values ${sql.join(tuples, sql`, `)}) as v(id, embedding, model, hash)
          where m.id = v.id
        `);
        return result.count ?? prepared.length;
      }),
    );

    logger.info("catalog-embed-movies: batch embedded", { requested: movieIds.length, written });
    return { embedded: written };
  },
);
