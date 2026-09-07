/**
 * The movie shape the display components read. Callers build it from the
 * `movies` table columns (specs 0002 and 0003); the components never query.
 */
export type MovieSummary = {
  id: string;
  title: string;
  year: number | undefined;
  posterPath: string | undefined;
  genres?: string[];
  overview?: string;
};

/** A reaction a person gives a movie in the swipe deck. */
export type Reaction = "like" | "dislike" | "seen" | "skip";
