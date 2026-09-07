import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Cluster } from "./cluster";
import { EmptyState } from "./empty-state";
import { PageContainer } from "./page-container";
import { Spinner } from "./spinner";
import { Stack } from "./stack";

describe("EmptyState (spec 0005 AC-5)", () => {
  it("renders the title, description, and action", () => {
    render(
      <EmptyState
        title="No movies yet"
        description="Swipe a deck to start."
        action={<button type="button">Start</button>}
      />,
    );

    expect(screen.getByText("No movies yet")).toBeInTheDocument();
    expect(screen.getByText("Swipe a deck to start.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});

describe("Spinner (spec 0005 AC-5)", () => {
  it("has role status and a visually hidden label", () => {
    render(<Spinner label="Loading feed" />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(screen.getByText("Loading feed")).toHaveClass("sr-only");
  });

  it("stops animating under reduced motion", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector(".motion-reduce\\:animate-none")).not.toBeNull();
  });
});

describe("PageContainer (spec 0005 AC-5)", () => {
  it("renders a main by default with the default width and gutter", () => {
    const { container } = render(<PageContainer>content</PageContainer>);
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main).toHaveClass("max-w-6xl", "px-4", "sm:px-6", "lg:px-8");
  });

  it("renders a div and the prose width when asked", () => {
    const { container } = render(
      <PageContainer as="div" width="prose">
        content
      </PageContainer>,
    );
    expect(container.querySelector("main")).toBeNull();
    expect(container.firstElementChild).toHaveClass("max-w-2xl");
  });
});

describe("Stack and Cluster (spec 0005 AC-5)", () => {
  it("Stack is a vertical flex with the mapped gap", () => {
    const { container } = render(<Stack gap={6}>x</Stack>);
    expect(container.firstElementChild).toHaveClass("flex", "flex-col", "gap-6");
  });

  it("Cluster is a wrapping flex row with the mapped gap", () => {
    const { container } = render(<Cluster gap={3}>x</Cluster>);
    expect(container.firstElementChild).toHaveClass("flex", "flex-wrap", "gap-3");
  });
});
