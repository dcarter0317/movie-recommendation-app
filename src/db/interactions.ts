/**
 * The one write path to `user_movie_interactions` (spec 0002, AC-1, AC-2).
 *
 * Every feature that records a swipe, a star rating, or a "not interested"
 * dismissal calls `upsertUserMovieInteraction` instead of composing its own
 * insert/update: a single `insert ... on conflict (user_id, movie_id) do
 * update`, never a read then write. Competing writes to `reaction_type`,
 * `rating`, and `source` resolve by provenance precedence (`manual_rating`
 * > `letterboxd_import` > `swipe`), so a hand typed rating is never
 * silently clobbered by a re-run import. `dismissed_at` merges as
 * `coalesce(...)` so it is monotonic regardless of precedence, once set by
 * a feed dismissal, no later write clears it.
 *
 * See docs/specs/0002-data-model/index.md, "Upsert semantics".
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "./client";
import { userMovieInteractions } from "./schema";

export type InteractionSource = "swipe" | "letterboxd_import" | "manual_rating";
export type ReactionType = "like" | "dislike" | "seen" | "skip";

export type UpsertUserMovieInteractionInput = {
  readonly userId: string;
  readonly movieId: string;
  readonly source: InteractionSource;
  readonly reactionType?: ReactionType;
  /** 0.5 to 5.0 in exact half star increments; the exact decimal scale, no lossy conversion (AC-9). */
  readonly rating?: number;
  readonly dismissedAt?: Date;
};

export type UserMovieInteractionRow = typeof userMovieInteractions.$inferSelect;

/** `manual_rating` > `letterboxd_import` > `swipe`. Defined once, this is the only call site. */
const sourceRank = (sourceRef: SQL): SQL => sql`(case ${sourceRef}
    when 'manual_rating' then 3
    when 'letterboxd_import' then 2
    when 'swipe' then 1
    else 0
  end)`;

const winsOverExisting = sql`${sourceRank(sql`excluded.source`)} >= ${sourceRank(
  sql`user_movie_interactions.source`,
)}`;

/**
 * Per column precedence, not "the whole row from whichever source wins":
 * a higher (or equal) precedence write only overwrites a column it
 * actually supplies a value for, so a swipe's `reaction_type` survives an
 * import that carries none. Spec 0002's own worked SQL example omits the
 * `coalesce` here, which would null out a column the winning write left
 * unset, contradicting its own critical test scenario ("the swipe's
 * reaction_type is preserved only if the import carries none"); flagged
 * for `/architect` to correct the spec, built to the documented intent.
 */
const winningValueOr = (excludedColumn: SQL, existingColumn: SQL): SQL =>
  sql`coalesce(case when ${winsOverExisting} then ${excludedColumn} end, ${existingColumn})`;

export async function upsertUserMovieInteraction(
  input: UpsertUserMovieInteractionInput,
): Promise<UserMovieInteractionRow> {
  const [row] = await db
    .insert(userMovieInteractions)
    .values({
      userId: input.userId,
      movieId: input.movieId,
      source: input.source,
      reactionType: input.reactionType,
      rating: input.rating,
      dismissedAt: input.dismissedAt,
    })
    .onConflictDoUpdate({
      target: [userMovieInteractions.userId, userMovieInteractions.movieId],
      set: {
        reactionType: winningValueOr(
          sql`excluded.reaction_type`,
          sql`user_movie_interactions.reaction_type`,
        ),
        rating: winningValueOr(sql`excluded.rating`, sql`user_movie_interactions.rating`),
        source: winningValueOr(sql`excluded.source`, sql`user_movie_interactions.source`),
        dismissedAt: sql`coalesce(user_movie_interactions.dismissed_at, excluded.dismissed_at)`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  if (!row) {
    throw new Error("upsertUserMovieInteraction: insert returned no row");
  }
  return row;
}
