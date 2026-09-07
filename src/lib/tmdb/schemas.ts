/**
 * Zod schemas for the slices of the TMDB API this app reads (spec 0003,
 * AC-3). Every TMDB response is parsed through one of these at the network
 * boundary; nothing downstream trusts raw TMDB JSON.
 *
 * Normalisation happens here: an empty `release_date` string and a zero
 * `runtime` both become `undefined`, so `toMovieRow` and `qualifies` never
 * see a sentinel value.
 */
import { z } from "zod";

const emptyStringToUndefined = z
  .string()
  .nullish()
  .transform((value) => (value == null || value.trim() === "" ? undefined : value));

const zeroToUndefined = z
  .number()
  .nullish()
  .transform((value) => (value == null || value === 0 ? undefined : value));

/** One page of `/discover/movie`. Only the fields the seed uses are kept. */
export const discoverResponseSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  total_results: z.number().int(),
  results: z.array(
    z.object({
      id: z.number().int().positive(),
    }),
  ),
});

export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

const genreSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

const keywordSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

const castSchema = z.object({
  name: z.string(),
  character: z.string().optional().default(""),
  order: z.number().int().optional(),
});

/** `/movie/{id}?append_to_response=keywords,credits&language=en-US`. */
export const movieDetailSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  overview: emptyStringToUndefined,
  release_date: emptyStringToUndefined,
  runtime: zeroToUndefined,
  status: z.string(),
  adult: z.boolean(),
  poster_path: z.string().nullable().optional(),
  original_language: z.string().optional(),
  vote_average: z.number().optional().default(0),
  vote_count: z.number().int().optional().default(0),
  popularity: z.number().optional().default(0),
  genres: z.array(genreSchema).optional().default([]),
  keywords: z
    .object({ keywords: z.array(keywordSchema).optional().default([]) })
    .optional()
    .default({ keywords: [] }),
  credits: z
    .object({ cast: z.array(castSchema).optional().default([]) })
    .optional()
    .default({ cast: [] }),
});

export type MovieDetail = z.infer<typeof movieDetailSchema>;
