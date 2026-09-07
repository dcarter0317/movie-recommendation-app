import { vi } from "vitest";

/**
 * `window.matchMedia` stub for jsdom, shared by `useReducedMotion()`
 * (motion/react) and next-themes. Default: reduce motion off. A test calls
 * `setReducedMotion(true)` before rendering to exercise the reduced path.
 */
let reducedMotion = false;
let installed = false;

export function setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

export function installMatchMediaStub(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
