// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/db/client";
import { GET, dynamic, runtime } from "./route";

const execute = vi.mocked(db.execute);

afterEach(() => {
  vi.restoreAllMocks();
  execute.mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 { ok: true } when the database answers", async () => {
    execute.mockResolvedValueOnce(undefined as never);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns 503 { ok: false } when the database query throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "database unreachable",
    });
  });

  it("is pinned to the dynamic Node runtime so it is never statically evaluated", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
  });
});
