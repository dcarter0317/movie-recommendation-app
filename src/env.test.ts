import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract under test (spec 0001, "Environment keys" + the module docstring):
 * `src/env.ts` is the one place env vars are read. It parses `process.env`
 * with Zod, lazily and once, and throws a message that names every bad or
 * missing variable when parsing fails.
 */

const VALID_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:6543/reel",
  DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5432/reel",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_abc",
  OPENAI_API_KEY: "sk-openai-abc",
  ANTHROPIC_API_KEY: "sk-ant-abc",
  TMDB_API_READ_ACCESS_TOKEN: "tmdb-abc",
  INNGEST_EVENT_KEY: "ievt-abc",
  INNGEST_SIGNING_KEY: "signkey-abc",
};

const KNOWN_KEYS = Object.keys(VALID_ENV);

function setEnv(vars: Record<string, string | undefined>): void {
  for (const key of KNOWN_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/**
 * Re-import the module fresh so its lazy cache starts empty each test.
 * Returns the module namespace, not `env` itself: returning the `env` Proxy
 * from an async function makes the runtime probe it for a `.then` method,
 * which would trip validation before the test can assert on it.
 */
async function loadEnvModule(): Promise<typeof import("./env")> {
  vi.resetModules();
  return import("./env");
}

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  for (const key of KNOWN_KEYS) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

describe("env", () => {
  it("parses a complete, valid environment", async () => {
    setEnv(VALID_ENV);
    const { env } = await loadEnvModule();

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.DATABASE_URL_UNPOOLED).toBe(VALID_ENV.DATABASE_URL_UNPOOLED);
    expect(env.OPENAI_API_KEY).toBe(VALID_ENV.OPENAI_API_KEY);
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development when it is not set", async () => {
    setEnv({ ...VALID_ENV, NODE_ENV: undefined });
    const { env } = await loadEnvModule();

    expect(env.NODE_ENV).toBe("development");
  });

  it("throws and names the variable when a required one is missing", async () => {
    setEnv({ ...VALID_ENV, OPENAI_API_KEY: undefined });
    const { env } = await loadEnvModule();

    expect(() => env.DATABASE_URL).toThrow(/OPENAI_API_KEY/);
    expect(() => env.DATABASE_URL).toThrow(/Invalid or missing environment variables/);
    expect(() => env.DATABASE_URL).toThrow(/Copy \.env\.example to \.env/);
  });

  it("throws when a URL variable is malformed", async () => {
    setEnv({ ...VALID_ENV, DATABASE_URL: "not-a-url" });
    const { env } = await loadEnvModule();

    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });

  it("reports every invalid variable in one message, not just the first", async () => {
    setEnv({ ...VALID_ENV, CLERK_SECRET_KEY: undefined, ANTHROPIC_API_KEY: undefined });
    const { env } = await loadEnvModule();

    try {
      void env.NODE_ENV;
      expect.unreachable("reading env should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("CLERK_SECRET_KEY");
      expect(message).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("validates once and caches, so a later process.env change is ignored", async () => {
    setEnv(VALID_ENV);
    const { env } = await loadEnvModule();

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);

    process.env.DATABASE_URL = "postgres://user:pass@localhost:6543/changed";

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
  });
});
