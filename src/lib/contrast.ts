/**
 * WCAG 2.x relative luminance and contrast ratio, for the design token
 * contrast gate (spec 0005, AC-10). Operates on the hex token values.
 */

function toChannel(value8bit: number): number {
  const c = value8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parse `#rgb` or `#rrggbb` into `[r, g, b]` (0..255). */
function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a hex color: ${hex}`);
  }
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of a hex color, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * toChannel(r) + 0.7152 * toChannel(g) + 0.0722 * toChannel(b);
}

/**
 * WCAG contrast ratio between two hex colors, from 1:1 (identical) to
 * 21:1 (black on white). Order independent.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
