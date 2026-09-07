import { describe, expect, it } from "vitest";

import {
  directionForOffset,
  REACTION_BY_ARROW_KEY,
  REACTION_BY_DIRECTION,
  reactionForDrag,
  SWIPE_DISTANCE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
} from "./reaction";

const still = { x: 0, y: 0 };

describe("reactionForDrag (spec 0005 AC-8, AC-11)", () => {
  it("resolves each direction past the distance threshold", () => {
    expect(reactionForDrag({ x: 140, y: 10 }, still)).toBe("like");
    expect(reactionForDrag({ x: -140, y: 10 }, still)).toBe("dislike");
    expect(reactionForDrag({ x: 10, y: -140 }, still)).toBe("seen");
    expect(reactionForDrag({ x: 10, y: 140 }, still)).toBe("skip");
  });

  it("uses the spec threshold constants", () => {
    expect(SWIPE_DISTANCE_THRESHOLD).toBe(120);
    expect(SWIPE_VELOCITY_THRESHOLD).toBe(500);
  });

  it("returns nothing below both the distance and velocity thresholds", () => {
    expect(reactionForDrag({ x: 90, y: 0 }, { x: 100, y: 0 })).toBeUndefined();
    expect(reactionForDrag({ x: 0, y: 90 }, { x: 0, y: 100 })).toBeUndefined();
  });

  it("commits on velocity alone even with a small offset", () => {
    expect(reactionForDrag({ x: 30, y: 0 }, { x: 900, y: 0 })).toBe("like");
    expect(reactionForDrag({ x: 0, y: -20 }, { x: 0, y: -700 })).toBe("seen");
  });

  it("commits exactly at the distance threshold", () => {
    expect(reactionForDrag({ x: 120, y: 0 }, still)).toBe("like");
    expect(reactionForDrag({ x: 119, y: 0 }, { x: 0, y: 0 })).toBeUndefined();
  });

  it("resolves a diagonal by its dominant axis", () => {
    // horizontal wins: |130| > |100|
    expect(reactionForDrag({ x: 130, y: 100 }, still)).toBe("like");
    // vertical wins: |130| > |100|
    expect(reactionForDrag({ x: 100, y: 130 }, still)).toBe("skip");
  });

  it("breaks an exact tie toward the horizontal axis", () => {
    expect(directionForOffset({ x: 100, y: 100 })).toBe("right");
    expect(directionForOffset({ x: -100, y: -100 })).toBe("left");
  });
});

describe("the one direction map", () => {
  it("keys drag, buttons, and arrows off the same mapping", () => {
    expect(REACTION_BY_DIRECTION).toEqual({
      right: "like",
      left: "dislike",
      up: "seen",
      down: "skip",
    });
    expect(REACTION_BY_ARROW_KEY).toEqual({
      ArrowRight: "like",
      ArrowLeft: "dislike",
      ArrowUp: "seen",
      ArrowDown: "skip",
    });
  });
});
