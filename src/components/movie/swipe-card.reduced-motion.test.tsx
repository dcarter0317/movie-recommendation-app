import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setReducedMotion } from "@/test/reduced-motion";

import { SwipeCard } from "./swipe-card";
import type { MovieSummary } from "./types";

// Set before the first render so motion/react initialises its reduced-motion
// global to `true`. Vitest isolates this file, so the global starts fresh.
setReducedMotion(true);

const movie: MovieSummary = {
  id: "1",
  title: "Inception",
  year: 2010,
  posterPath: undefined,
};

describe("SwipeCard with reduced motion (spec 0005 AC-9, AC-11)", () => {
  it("renders no draggable wrapper (no fling transform)", () => {
    const { container } = render(<SwipeCard movie={movie} onReact={vi.fn()} />);
    expect(container.querySelector(".cursor-grab")).toBeNull();
  });

  it("still reacts to buttons and arrow keys", () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);

    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowDown" });

    expect(onReact).toHaveBeenCalledExactlyOnceWith("skip");
  });
});
