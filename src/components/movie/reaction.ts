import type { Reaction } from "./types";

/** Drag distance (px) on the dominant axis past which a fling commits. */
export const SWIPE_DISTANCE_THRESHOLD = 120;

/** Drag speed (px/s) on the dominant axis past which a short flick commits. */
export const SWIPE_VELOCITY_THRESHOLD = 500;

/**
 * The single source of direction resolution. Drag, the on screen buttons, and
 * the arrow keys all map through this, so they cannot disagree.
 */
export const REACTION_BY_DIRECTION = {
  right: "like",
  left: "dislike",
  up: "seen",
  down: "skip",
} as const satisfies Record<string, Reaction>;

export type SwipeDirection = keyof typeof REACTION_BY_DIRECTION;

/** Arrow key to reaction, derived from the one direction map. */
export const REACTION_BY_ARROW_KEY: Readonly<Record<string, Reaction>> = {
  ArrowRight: REACTION_BY_DIRECTION.right,
  ArrowLeft: REACTION_BY_DIRECTION.left,
  ArrowUp: REACTION_BY_DIRECTION.up,
  ArrowDown: REACTION_BY_DIRECTION.down,
};

type Vector = { x: number; y: number };

/** The dominant axis direction of a drag offset. Horizontal wins ties. */
export function directionForOffset(offset: Vector): SwipeDirection {
  const horizontalDominant = Math.abs(offset.x) >= Math.abs(offset.y);
  if (horizontalDominant) {
    return offset.x > 0 ? "right" : "left";
  }
  return offset.y > 0 ? "down" : "up";
}

/**
 * Resolve a drag gesture to a reaction, or `undefined` when it did not cross a
 * threshold. The dominant axis is chosen first; on that axis, distance past
 * `SWIPE_DISTANCE_THRESHOLD` or speed past `SWIPE_VELOCITY_THRESHOLD` commits.
 * Pointer coordinates run y-down, so a downward drag is "skip" and an upward
 * drag is "seen".
 */
export function reactionForDrag(offset: Vector, velocity: Vector): Reaction | undefined {
  const direction = directionForOffset(offset);
  const horizontal = direction === "left" || direction === "right";
  const axisOffset = horizontal ? offset.x : offset.y;
  const axisVelocity = horizontal ? velocity.x : velocity.y;

  const committed =
    Math.abs(axisOffset) >= SWIPE_DISTANCE_THRESHOLD ||
    Math.abs(axisVelocity) >= SWIPE_VELOCITY_THRESHOLD;

  return committed ? REACTION_BY_DIRECTION[direction] : undefined;
}
