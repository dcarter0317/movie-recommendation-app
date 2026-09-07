/**
 * `pnpm catalog:seed` (spec 0003, AC-1, AC-9).
 *
 * Sends one `catalog/seed.requested` event and exits. The Inngest dev
 * server (or Inngest Cloud) then runs `catalog-seed`, which fans out the
 * per-movie ingest work.
 *
 * Run against a local stack with `inngest dev` and the Next.js dev server
 * both up, and `INNGEST_DEV=1` in the environment so the SDK targets the
 * local dev server rather than Inngest Cloud. This is the one place the
 * Inngest SDK's own `INNGEST_DEV` / base-URL lookup is relied on, a
 * documented exemption to the `src/env.ts` rule.
 */
import { catalogSeedRequested, inngest } from "@/lib/inngest/client";

async function main(): Promise<void> {
  const reason = process.argv.slice(2).join(" ") || undefined;
  const { ids } = await inngest.send(catalogSeedRequested.create({ reason }));
  console.info(`catalog:seed sent catalog/seed.requested (event id ${ids[0]})`);
  console.info("Watch the run in the Inngest dev dashboard (http://localhost:8288).");
}

main().catch((error: unknown) => {
  console.error("catalog:seed failed to send the seed event:", error);
  process.exitCode = 1;
});
