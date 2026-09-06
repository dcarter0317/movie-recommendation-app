import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

/**
 * Request-path database client.
 *
 * Connects through Supabase's Supavisor pooler in transaction mode
 * (`DATABASE_URL`, port 6543). Prepared statements are disabled because
 * transaction pooling reuses server connections between statements.
 *
 * The client is created lazily on first use so that loading this module
 * (during a build, say) does not require a live connection string.
 *
 * Migrations and Inngest steps use a separate direct connection
 * (`DATABASE_URL_UNPOOLED`, port 5432), configured where they run.
 *
 * Feature 6 adds the `withUser(db, userId, fn)` helper that opens a short
 * transaction and sets `app.user_id` so row level security policies apply.
 */
type Db = PostgresJsDatabase<typeof schema>;

let cached: Db | undefined;

function getDb(): Db {
  if (!cached) {
    const client = postgres(env.DATABASE_URL, { prepare: false });
    cached = drizzle(client, { schema });
  }
  return cached;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
