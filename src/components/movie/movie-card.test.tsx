import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MovieCard } from "./movie-card";
import type { MovieSummary } from "./types";

const movie: MovieSummary = {
  id: "27205",
  title: "Inception",
  year: 2010,
  posterPath: "/inception.jpg",
  genres: ["Action", "Sci-Fi", "Adventure", "Thriller"],
};

describe("MovieCard (spec 0005 AC-7)", () => {
  it("shows the poster, title, year, and up to three genres", () => {
    render(<MovieCard movie={movie} />);

    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByText("2010")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Adventure")).toBeInTheDocument();
    expect(screen.queryByText("Thriller")).not.toBeInTheDocument();
  });

  it("is a single link when given href, activated by Enter or Space", async () => {
    render(<MovieCard movie={movie} href="#movie-27205" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#movie-27205");
    // one focusable element, not nested tab stops
    expect(screen.getAllByRole("link")).toHaveLength(1);

    link.focus();
    const spy = vi.spyOn(link, "click");
    await userEvent.keyboard(" ");
    expect(spy).toHaveBeenCalled();
  });

  it("is a button when given onSelect", async () => {
    const onSelect = vi.fn();
    render(<MovieCard movie={movie} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
