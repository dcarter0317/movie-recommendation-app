import { z } from "zod";

/**
 * The one place environment variables are read and validated.
 *
 * Validation runs once, lazily, the first time any variable is read. A
 * missing or malformed one throws then, so the first request that needs
 * config fails fast with a clear message instead of a confusing error
 * deep in a driver. Build steps that only load modules (they never read
 * `env.X`) are unaffected.
 *
 * Do not read `process.env.X` anywhere else in the app code; import `env`
 * from this module instead.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database: Supabase Postgres reached through Drizzle + postgres-js.
  // Pooled connection (Supavisor, transaction mode, port 6543) for request paths.
  DATABASE_URL: z.url(),
  // Direct connection (port 5432) for migrations and Inngest steps.
  DATABASE_URL_UNPOOLED: z.url(),

  // Auth: Clerk (feature 6 wires it in).
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),

  // AI providers, both reached through the Vercel AI SDK.
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),

  // Movie data: TMDB (v4 read access token).
  TMDB_API_READ_ACCESS_TOKEN: z.string().min(1),

  // Background jobs: Inngest.
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\n` +
        "Copy .env.example to .env and fill in the values.",
    );
  }

  cached = parsed.data;
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
