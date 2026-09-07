import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setReducedMotion } from "@/test/reduced-motion";

import { SwipeCard } from "./swipe-card";
import type { MovieSummary } from "./types";

const movie: MovieSummary = {
  id: "1",
  title: "Inception",
  year: 2010,
  posterPath: undefined,
  genres: ["Sci-Fi"],
  overview: "A thief who steals corporate secrets through dream-sharing.",
};

describe("SwipeCard (spec 0005 AC-8, AC-9, AC-11)", () => {
  beforeEach(() => {
    setReducedMotion(false);
  });

  it("fires onReact once from an on screen button", async () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);

    await userEvent.click(screen.getByRole("button", { name: "Seen it" }));

    expect(onReact).toHaveBeenCalledExactlyOnceWith("seen");
  });

  it("fires onReact once from an arrow key on the card root", () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);

    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowLeft" });

    expect(onReact).toHaveBeenCalledExactlyOnceWith("dislike");
  });

  it("ignores a second input on the same card", async () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);
    const root = screen.getByRole("group");

    fireEvent.keyDown(root, { key: "ArrowRight" });
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(onReact).toHaveBeenCalledExactlyOnceWith("like");
  });

  it("moves focus to the card root after a reaction and announces it", () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);
    const root = screen.getByRole("group");

    fireEvent.keyDown(root, { key: "ArrowUp" });

    expect(root).toHaveFocus();
    expect(screen.getByText("Marked as seen Inception")).toBeInTheDocument();
  });

  it("disables the buttons once a reaction has fired", () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);

    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });

    for (const name of ["Dislike", "Seen it", "Skip", "Like"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("ignores non arrow keys without preventing default", () => {
    const onReact = vi.fn();
    render(<SwipeCard movie={movie} onReact={onReact} />);

    const notPrevented = fireEvent.keyDown(screen.getByRole("group"), {
      key: "Tab",
    });

    expect(onReact).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true); // event was not preventDefault()ed
  });

  it("renders the draggable wrapper when motion is allowed", () => {
    const { container } = render(<SwipeCard movie={movie} onReact={vi.fn()} />);
    expect(container.querySelector(".cursor-grab")).not.toBeNull();
  });
});
