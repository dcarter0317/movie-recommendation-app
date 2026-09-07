import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "./contrast";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Pull `--token: #value;` pairs from a `:root {}` or `.dark {}` block. */
function themeTokens(selector: string): Record<string, string> {
  const block = globalsCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`no ${selector} block in globals.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(
    /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    out[name] = value;
  }
  return out;
}

const THEMES = {
  light: themeTokens(":root"),
  dark: themeTokens("\\.dark"),
};

// The pairs and targets documented in docs/design.md's contrast table.
const PAIRS: ReadonlyArray<{ fg: string; bg: string; target: number }> = [
  { fg: "--foreground", bg: "--background", target: 4.5 },
  { fg: "--card-foreground", bg: "--card", target: 4.5 },
  { fg: "--primary-foreground", bg: "--primary", target: 4.5 },
  { fg: "--secondary-foreground", bg: "--secondary", target: 4.5 },
  { fg: "--accent-foreground", bg: "--accent", target: 4.5 },
  { fg: "--muted-foreground", bg: "--background", target: 4.5 },
  { fg: "--muted-foreground", bg: "--card", target: 4.5 },
  { fg: "--destructive", bg: "--background", target: 4.5 },
  { fg: "--destructive", bg: "--card", target: 4.5 },
  { fg: "--ring", bg: "--background", target: 3 },
  { fg: "--ring", bg: "--card", target: 3 },
  { fg: "--primary", bg: "--background", target: 3 },
  { fg: "--like", bg: "--background", target: 3 },
  { fg: "--dislike", bg: "--background", target: 3 },
  { fg: "--seen", bg: "--background", target: 3 },
  { fg: "--skip", bg: "--background", target: 3 },
];

describe("contrastRatio() helper", () => {
  it("black on white is ~21:1, white on white is 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is order independent", () => {
    expect(contrastRatio("#09090b", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#09090b"),
      10,
    );
  });
});

describe("design token contrast (spec 0005 AC-10)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const { fg, bg, target } of PAIRS) {
      it(`${theme}: ${fg} on ${bg} meets ${target}:1`, () => {
        const tokens = THEMES[theme];
        const fgValue = tokens[fg];
        const bgValue = tokens[bg];
        expect(fgValue, `${fg} missing from ${theme}`).toBeTruthy();
        expect(bgValue, `${bg} missing from ${theme}`).toBeTruthy();
        expect(contrastRatio(fgValue, bgValue)).toBeGreaterThanOrEqual(target);
      });
    }
  }
});
