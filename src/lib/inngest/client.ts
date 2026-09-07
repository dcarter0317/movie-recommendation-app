/**
 * The shared Inngest client and the typed `catalog/*` events (spec 0003).
 *
 * Inngest SDK v4 declares typed events with `eventType(name, { schema })`
 * rather than the older `new EventSchemas()` builder: an `EventType` doubles
 * as a `createFunction` trigger and as the argument to `inngest.send(...)`,
 * so the event name and its payload shape are checked in one place. Zod v4
 * schemas satisfy the Standard Schema interface `eventType` expects, so they
 * are passed straight through.
 *
 * No idempotency `id` is set on any of these events: a second `pnpm
 * catalog:seed` run must fan out again and re-upsert every movie (spec 0003,
 * AC-2), not be silently deduplicated by Inngest.
 *
 * The event key and signing key come from `src/env.ts` (the one place
 * environment variables are read). Local development still needs
 * `INNGEST_DEV=1` so the SDK talks to the local dev server instead of
 * Inngest Cloud; the `dev` script sets it.
 */
import { Inngest, eventType } from "inngest";
import { z } from "zod";

import { env } from "@/env";

/** `pnpm catalog:seed` sends this; `catalog-seed` fans it out. */
export const catalogSeedRequested = eventType("catalog/seed.requested", {
  schema: z.object({
    reason: z.string().optional(),
  }),
});

/** One per candidate movie; `catalog-ingest-movie` fetches, qualifies, and upserts it. */
export const catalogMovieIngestRequested = eventType("catalog/movie.ingest.requested", {
  schema: z.object({
    tmdbId: z.number().int().positive(),
    source: z.enum(["seed", "refresh"]),
  }),
});

/** Emitted by `catalog-ingest-movie` on a hash/model mismatch; `catalog-embed-movies` batches these. */
export const catalogMovieEmbedRequested = eventType("catalog/movie.embed.requested", {
  schema: z.object({
    movieId: z.string().uuid(),
    tmdbId: z.number().int().positive(),
  }),
});

export const inngest = new Inngest({
  id: "reel",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});
