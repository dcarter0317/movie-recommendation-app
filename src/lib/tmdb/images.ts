/**
 * TMDB image URL construction (spec 0005). The catalog stores the bare
 * `poster_path` (for example `/abc123.jpg`); display code turns it into a
 * full URL here.
 */

/** Poster path prefix. The caller appends a size segment then the stored path. */
export const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

/** TMDB poster width tokens, smallest to largest, plus the source image. */
export const POSTER_SIZES = ["w185", "w342", "w500", "w780", "original"] as const;

export type PosterSize = (typeof POSTER_SIZES)[number];

/**
 * Build a full poster URL from a stored `poster_path` and a TMDB size token.
 * `path` must be a non empty TMDB path (a leading-slash string); callers that
 * may not have one branch to a fallback before calling this.
 */
export function posterUrl(path: string, size: PosterSize = "w500"): string {
  return `${IMAGE_BASE_URL}${size}${path}`;
}
