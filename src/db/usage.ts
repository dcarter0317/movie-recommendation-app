/**
 * Per user rate limiting for calls that reach a paid AI provider (spec
 * 0001, spec 0002 AC-10). One row per `(user_id, resource, window_start)`,
 * a tumbling UTC window: hourly for `vibe_search`, daily for the rest.
 *
 * The limits themselves (30/hr, 50/day, 3/day) and the shared rejection
 * shape are not decided here (spec 0002, Follow-up): the first feature
 * that calls `incrementUsageCounter` settles them.
 */
import { sql } from "drizzle-orm";

import { db } from "./client";
import { usageCounters } from "./schema";

export type UsageResource = "vibe_search" | "reason_regeneration" | "letterboxd_import";

const HOURLY_RESOURCES: ReadonlySet<UsageResource> = new Set(["vibe_search"]);

/** Pure: the tumbling window a given instant falls into for a resource. No I/O. */
export function usageWindowStart(resource: UsageResource, now: Date): Date {
  const truncated = new Date(now);
  truncated.setUTCMilliseconds(0);
  truncated.setUTCSeconds(0);
  truncated.setUTCMinutes(0);
  if (!HOURLY_RESOURCES.has(resource)) {
    truncated.setUTCHours(0);
  }
  return truncated;
}

/**
 * Atomic, increment-first: `insert ... on conflict (...) do update set count
 * = count + 1 returning count`. The caller rejects the action only if the
 * *returned* count exceeds its limit; a read-then-write check-then-increment
 * races under concurrent requests even inside one transaction (spec 0002,
 * key invariants).
 */
export async function incrementUsageCounter(input: {
  readonly userId: string;
  readonly resource: UsageResource;
  readonly now: Date;
}): Promise<number> {
  const windowStart = usageWindowStart(input.resource, input.now);

  const [row] = await db
    .insert(usageCounters)
    .values({
      userId: input.userId,
      resource: input.resource,
      windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.resource, usageCounters.windowStart],
      set: { count: sql`${usageCounters.count} + 1` },
    })
    .returning({ count: usageCounters.count });

  if (!row) {
    throw new Error("incrementUsageCounter: insert returned no row");
  }
  return row.count;
}
