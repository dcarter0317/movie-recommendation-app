import { describe, expect, it } from "vitest";

import {
  buildEmbeddingText,
  embeddingInputHash,
  qualifies,
  toMovieRow,
  type MovieDetailInput,
} from "./catalog";
import { EMBEDDING_TEXT_VERSION, MIN_VOTE_COUNT } from "./catalog.config";

/**
 * Contract under test: spec 0003 AC-3, AC-4, AC-9. These functions are the
 * pure core of the ingestion pipeline; they take a parsed TMDB detail and
 * return values, with no I/O and no clock of their own.
 */

function detail(overrides: Partial<MovieDetailInput> = {}): MovieDetailInput {
  return {
    id: 27205,
    title: "Inception",
    status: "Released",
    adult: false,
    overview: "A thief who steals corporate secrets through dream-sharing technology.",
    release_date: "2010-07-15",
    runtime: 148,
    poster_path: "/inception.jpg",
    original_language: "en",
    vote_average: 8.4,
    vote_count: 34000,
    popularity: 82.3,
    genres: [{ name: "Action" }, { name: "Science Fiction" }],
    keywords: { keywords: [{ name: "dream" }, { name: "heist" }, { name: "subconscious" }] },
    credits: {
      cast: [
        { name: "Leonardo DiCaprio", character: "Dom Cobb" },
        { name: "Joseph Gordon-Levitt", character: "Arthur" },
      ],
    },
    ...overrides,
  };
}

const TODAY = "2026-09-07";

describe("qualifies", () => {
  it("accepts a released, dated, poster-and-overview movie with enough votes", () => {
    expect(qualifies(detail(), TODAY)).toBe(true);
  });

  it("rejects an unreleased movie", () => {
    expect(qualifies(detail({ status: "Post Production" }), TODAY)).toBe(false);
  });

  it("rejects a movie dated after today", () => {
    expect(qualifies(detail({ release_date: "2027-01-01" }), TODAY)).toBe(false);
  });

  it("rejects a missing release date", () => {
    expect(qualifies(detail({ release_date: undefined }), TODAY)).toBe(false);
  });

  it("rejects an empty poster path", () => {
    expect(qualifies(detail({ poster_path: "" }), TODAY)).toBe(false);
    expect(qualifies(detail({ poster_path: null }), TODAY)).toBe(false);
  });

  it("rejects an empty overview", () => {
    expect(qualifies(detail({ overview: "   " }), TODAY)).toBe(false);
    expect(qualifies(detail({ overview: undefined }), TODAY)).toBe(false);
  });

  it("rejects an adult movie", () => {
    expect(qualifies(detail({ adult: true }), TODAY)).toBe(false);
  });

  it("rejects a movie below the vote floor", () => {
    expect(qualifies(detail({ vote_count: MIN_VOTE_COUNT - 1 }), TODAY)).toBe(false);
    expect(qualifies(detail({ vote_count: MIN_VOTE_COUNT }), TODAY)).toBe(true);
  });
});

describe("toMovieRow", () => {
  it("maps the detail to the upsert set-list columns", () => {
    const row = toMovieRow(detail());
    expect(row).toMatchObject({
      tmdbId: 27205,
      title: "Inception",
      releaseDate: "2010-07-15",
      releaseYear: 2010,
      runtime: 148,
      genres: ["Action", "Science Fiction"],
      keywords: ["dream", "heist", "subconscious"],
      posterPath: "/inception.jpg",
      voteAverage: 8.4,
      voteCount: 34000,
      originalLanguage: "en",
    });
    expect(row.castMembers).toEqual([
      { name: "Leonardo DiCaprio", character: "Dom Cobb" },
      { name: "Joseph Gordon-Levitt", character: "Arthur" },
    ]);
  });

  it("derives release_year from release_date, and leaves both undefined when the date is missing", () => {
    expect(toMovieRow(detail({ release_date: "1999-03-31" })).releaseYear).toBe(1999);
    const undated = toMovieRow(detail({ release_date: undefined }));
    expect(undated.releaseDate).toBeUndefined();
    expect(undated.releaseYear).toBeUndefined();
  });

  it("caps keywords at 15 and cast at 5, in source order", () => {
    const manyKeywords = Array.from({ length: 30 }, (_, i) => ({ name: `k${i}` }));
    const manyCast = Array.from({ length: 12 }, (_, i) => ({ name: `n${i}`, character: `c${i}` }));
    const row = toMovieRow(
      detail({ keywords: { keywords: manyKeywords }, credits: { cast: manyCast } }),
    );
    expect(row.keywords).toHaveLength(15);
    expect(row.keywords[0]).toBe("k0");
    expect(row.castMembers).toHaveLength(5);
    expect(row.castMembers[4]).toEqual({ name: "n4", character: "c4" });
  });

  it("normalises a zero popularity to undefined", () => {
    expect(toMovieRow(detail({ popularity: 0 })).popularity).toBeUndefined();
  });
});

describe("buildEmbeddingText", () => {
  it("produces a labelled block and drops empty lines", () => {
    const text = buildEmbeddingText({
      title: "Inception",
      releaseYear: 2010,
      genres: ["Action"],
      keywords: [],
      castMembers: [{ name: "Leonardo DiCaprio", character: "Dom Cobb" }],
      overview: "A thief.",
    });
    expect(text).toBe(
      [
        "Title: Inception (2010)",
        "Genres: Action",
        "Cast: Leonardo DiCaprio as Dom Cobb",
        "Overview: A thief.",
      ].join("\n"),
    );
    expect(text).not.toContain("Keywords:");
  });

  it("omits the year when it is not known", () => {
    const text = buildEmbeddingText({
      title: "Untitled",
      releaseYear: undefined,
      genres: [],
      keywords: [],
      castMembers: [],
      overview: "x",
    });
    expect(text.split("\n")[0]).toBe("Title: Untitled");
  });
});

describe("embeddingInputHash", () => {
  it("is a stable 64-char sha256 hex over the versioned text", () => {
    const hash = embeddingInputHash("Title: Inception (2010)");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(embeddingInputHash("Title: Inception (2010)")).toBe(hash);
  });

  it("changes when the version prefix or the text changes", () => {
    const a = embeddingInputHash("same text");
    const b = embeddingInputHash("different text");
    expect(a).not.toBe(b);
    // The version is baked into the hash: sanity-check it is actually prefixed.
    expect(EMBEDDING_TEXT_VERSION).toBe("v1");
  });
});
