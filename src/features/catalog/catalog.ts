/**
 * The pure core of the catalog pipeline (spec 0003, AC-3, AC-4, AC-9,
 * AC-10). Every function here takes data and returns a value: no fetch, no
 * database, no clock of its own. The Inngest functions do the I/O and call
 * these.
 */
import { createHash } from "node:crypto";

import type { CastMember } from "@/db/schema";
import {
  CAST_LIMIT,
  EMBEDDING_TEXT_VERSION,
  KEYWORD_LIMIT,
  MIN_VOTE_COUNT,
} from "./catalog.config";

/**
 * The shape `qualifies` and `toMovieRow` read: a structural subset of a
 * parsed TMDB `/movie/{id}` response. Hand-written rather than the Zod
 * inference so the pure core does not couple to the schema module and so it
 * accepts the JSON-serialised value an Inngest `step.run` hands back (where
 * `T | undefined` fields become optional keys).
 */
export type MovieDetailInput = {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly adult: boolean;
  readonly overview?: string | undefined;
  readonly release_date?: string | undefined;
  readonly runtime?: number | undefined;
  readonly poster_path?: string | null | undefined;
  readonly original_language?: string | undefined;
  readonly vote_average: number;
  readonly vote_count: number;
  readonly popularity: number;
  readonly genres: readonly { readonly name: string }[];
  readonly keywords: { readonly keywords: readonly { readonly name: string }[] };
  readonly credits: {
    readonly cast: readonly { readonly name: string; readonly character: string }[];
  };
};

/**
 * The columns `catalog-ingest-movie` writes (the fixed upsert set-list).
 * Never includes `id`, `tmdb_id` is the conflict key, and none of the four
 * embedding columns appear: those are `catalog-embed-movies`' alone.
 */
export type MovieRow = {
  readonly tmdbId: number;
  readonly title: string;
  readonly overview: string | undefined;
  readonly releaseDate: string | undefined;
  readonly releaseYear: number | undefined;
  readonly runtime: number | undefined;
  readonly genres: readonly string[];
  readonly keywords: readonly string[];
  readonly castMembers: readonly CastMember[];
  readonly posterPath: string | undefined;
  readonly voteAverage: number;
  readonly voteCount: number;
  readonly popularity: number | undefined;
  readonly originalLanguage: string | undefined;
};

/**
 * Does this movie belong in the catalog right now? Released, dated on or
 * before `todayIso` (a `YYYY-MM-DD` string), has a poster and an overview,
 * not adult, and enough votes. `todayIso` is passed in so this stays pure.
 */
export function qualifies(detail: MovieDetailInput, todayIso: string): boolean {
  return (
    detail.status === "Released" &&
    detail.adult === false &&
    detail.release_date !== undefined &&
    detail.release_date <= todayIso &&
    (detail.poster_path ?? "").trim() !== "" &&
    (detail.overview ?? "").trim() !== "" &&
    detail.vote_count >= MIN_VOTE_COUNT
  );
}

/** Map a validated TMDB detail response to the upsert set-list columns. */
export function toMovieRow(detail: MovieDetailInput): MovieRow {
  const releaseDate = detail.release_date;
  const releaseYear =
    releaseDate !== undefined ? Number(releaseDate.slice(0, 4)) || undefined : undefined;

  const keywords = detail.keywords.keywords.slice(0, KEYWORD_LIMIT).map((k) => k.name);

  const castMembers: readonly CastMember[] = detail.credits.cast
    .slice(0, CAST_LIMIT)
    .map((member) => ({ name: member.name, character: member.character }));

  return {
    tmdbId: detail.id,
    title: detail.title,
    overview: detail.overview,
    releaseDate,
    releaseYear,
    runtime: detail.runtime,
    genres: detail.genres.map((g) => g.name),
    keywords,
    castMembers,
    posterPath:
      (detail.poster_path ?? "").trim() === "" ? undefined : (detail.poster_path ?? undefined),
    voteAverage: Math.round(detail.vote_average * 10) / 10,
    voteCount: detail.vote_count,
    popularity: detail.popularity === 0 ? undefined : detail.popularity,
    originalLanguage: detail.original_language,
  };
}

/** The fields `buildEmbeddingText` reads; a structural subset of a stored `movies` row. */
export type EmbeddingTextInput = {
  readonly title: string;
  readonly releaseYear: number | null | undefined;
  readonly genres: readonly string[];
  readonly keywords: readonly string[];
  readonly castMembers: readonly CastMember[];
  readonly overview: string | null | undefined;
};

/**
 * A fixed, labelled text block for embedding. Lines whose value is empty
 * are dropped, so a movie with no keywords does not embed a bare "Keywords:"
 * label. The `EMBEDDING_TEXT_VERSION` prefix is added by
 * `embeddingInputHash`, not here, so the human-readable text stays clean.
 */
export function buildEmbeddingText(input: EmbeddingTextInput): string {
  const titleLine =
    input.releaseYear != null ? `${input.title} (${input.releaseYear})` : input.title;

  const castLine = input.castMembers
    .map((member) => (member.character ? `${member.name} as ${member.character}` : member.name))
    .join(", ");

  const lines: readonly (readonly [string, string])[] = [
    ["Title", titleLine],
    ["Genres", input.genres.join(", ")],
    ["Keywords", input.keywords.join(", ")],
    ["Cast", castLine],
    ["Overview", (input.overview ?? "").trim()],
  ];

  return lines
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/** SHA-256 hex of the versioned text block. A change in text or version changes the hash, triggering a re-embed. */
export function embeddingInputHash(text: string): string {
  return createHash("sha256").update(`${EMBEDDING_TEXT_VERSION}${text}`).digest("hex");
}
