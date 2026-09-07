/**
 * The write-path database client for the Inngest catalog jobs (spec 0003,
 * AC-8).
 *
 * Connects over the direct, unpooled connection (`DATABASE_URL_UNPOOLED`,
 * port 5432), never the request-path pooler: `set local role` is
 * transaction-scoped and the transaction pooler reuses server connections
 * between statements.
 *
 * Every catalog write goes through `asInngest(fn)`, which opens one
 * transaction, switches to the `app_inngest` role (a `BYPASSRLS` role
 * granted write access to `movies`; the migration grants `app_inngest` to
 * `postgres` so the unpooled client can assume it), and runs `fn` in it.
 * No user request ever reaches this module.
 */
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

type InngestDb = PostgresJsDatabase<typeof schema>;

/** The transaction handle passed to an `asInngest` callback. */
export type InngestDbTx = Parameters<Parameters<InngestDb["transaction"]>[0]>[0];

let cached: InngestDb | undefined;

function getInngestDb(): InngestDb {
  if (!cached) {
    const client = postgres(env.DATABASE_URL_UNPOOLED, { prepare: false });
    cached = drizzle(client, { schema });
  }
  return cached;
}

/**
 * Run `fn` inside one transaction that has first switched to the
 * `app_inngest` role. `set local` reverts automatically when the
 * transaction ends, so a later use of the same pooled server connection is
 * unaffected.
 */
export async function asInngest<T>(fn: (tx: InngestDbTx) => Promise<T>): Promise<T> {
  return getInngestDb().transaction(async (tx) => {
    await tx.execute(sql`set local role app_inngest`);
    return fn(tx);
  });
}
