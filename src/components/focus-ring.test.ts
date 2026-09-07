import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 0005 AC-10: every interactive component exposes a `:focus-visible`
 * ring built from `--ring` as `ring-2 ring-offset-2 ring-offset-background`.
 * This guards against a future edit quietly dropping it.
 */

const RING =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const INTERACTIVE_FILES = [
  "src/components/ui/button.tsx",
  "src/components/ui/input.tsx",
  "src/components/movie/movie-card.tsx",
  "src/components/movie/swipe-card.tsx",
];

describe("focus ring (spec 0005 AC-10)", () => {
  for (const file of INTERACTIVE_FILES) {
    it(`${file} uses the --ring focus pattern`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain(RING);
    });
  }
});
