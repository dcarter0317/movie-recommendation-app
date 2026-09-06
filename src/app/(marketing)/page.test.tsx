import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "./page";

describe("marketing landing page", () => {
  it("shows the product headline", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: /knows your taste and explains every pick/i }),
    ).toBeInTheDocument();
  });

  it("offers a 'Get started' path into the product feed", () => {
    render(<LandingPage />);

    const cta = screen.getByRole("link", { name: /get started/i });
    expect(cta).toHaveAttribute("href", "/feed");
  });
});
