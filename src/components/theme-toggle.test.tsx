import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle (spec 0005 AC-3, AC-11)", () => {
  it("renders a labelled control that cycles dark -> light -> system", async () => {
    renderToggle();

    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName(/Dark\. Switch to Light/);

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/Light\. Switch to System/);

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/System\. Switch to Dark/);

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/Dark\. Switch to Light/);
  });
});
