import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Token parity gate for spec 0005 (AC-2).
 *
 * `globals.css` is canonical for token values. This test asserts:
 *   1. `:root` (light) and `.dark` declare the exact same token names.
 *   2. Every token named in a table row of `docs/design.md` exists in
 *      `globals.css`.
 */

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const designMd = readFileSync(resolve(process.cwd(), "docs/design.md"), "utf8");

function tokenNamesInBlock(css: string, selector: string): Set<string> {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no \`${selector}\` block found in globals.css`);
  const names = match[1].match(/--[a-z0-9-]+(?=\s*:)/g) ?? [];
  return new Set(names);
}

describe("design token parity (spec 0005 AC-2)", () => {
  it(":root and .dark declare the same token names", () => {
    const root = tokenNamesInBlock(globalsCss, ":root");
    const dark = tokenNamesInBlock(globalsCss, "\\.dark");

    const onlyInRoot = [...root].filter((n) => !dark.has(n)).sort();
    const onlyInDark = [...dark].filter((n) => !root.has(n)).sort();

    expect({ onlyInRoot, onlyInDark }).toEqual({
      onlyInRoot: [],
      onlyInDark: [],
    });
  });

  it("every token in a docs/design.md table row exists in globals.css", () => {
    const tableRows = designMd
      .split("\n")
      .filter((line) => line.trimStart().startsWith("|"))
      // drop the |---|---| separator rows
      .filter((line) => /[a-z]/i.test(line));

    const referenced = new Set<string>();
    for (const row of tableRows) {
      for (const token of row.match(/--[a-z][a-z0-9-]*/g) ?? []) {
        referenced.add(token);
      }
    }

    // Documented but not yet a real declaration (spec 0005 Follow-up).
    referenced.delete("--link");

    const missing = [...referenced].filter((token) => !globalsCss.includes(`${token}:`)).sort();

    expect(missing).toEqual([]);
  });
});
