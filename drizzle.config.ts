import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. This file runs under the `drizzle-kit` CLI, not the
 * app, so it reads `process.env` directly (drizzle-kit loads `.env` itself).
 *
 * Migrations run against the direct connection (port 5432), never the pooler.
 * `drizzle-kit generate` produces SQL that is committed to the repo;
 * `drizzle-kit push` is for local development only.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? "",
  },
  strict: true,
  verbose: true,
});
