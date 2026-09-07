import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Poster } from "./poster";

describe("Poster (spec 0005 AC-6)", () => {
  it("renders the labelled fallback tile when there is no poster path", () => {
    render(<Poster path={undefined} alt="Blade Runner" />);

    expect(screen.getByText("Blade Runner")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders an image at a locked 2:3 ratio when a path is given", () => {
    const { container } = render(<Poster path="/br.jpg" alt="Blade Runner" />);

    const img = screen.getByRole("img", { name: "Blade Runner" });
    expect(img).toBeInTheDocument();
    expect(container.querySelector(".aspect-2\\/3")).not.toBeNull();
  });
});
