import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";

// Always run at request time on the Node runtime: this pings the database
// and must never be statically evaluated at build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Returns `{ ok: true }` when the app is up and the database answers.
 * Used to verify a local boot and by deploy health checks.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("health check: database unreachable", error);
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
