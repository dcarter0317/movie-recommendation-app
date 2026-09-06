import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals are off, so Testing Library's automatic per-test cleanup is not
// registered for us. Do it here once for every test file.
afterEach(() => {
  cleanup();
});
