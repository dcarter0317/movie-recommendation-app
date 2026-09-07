import { serve } from "inngest/next";

import { catalogFunctions } from "@/features/catalog/functions";
import { inngest } from "@/lib/inngest/client";

/**
 * The Inngest handler (spec 0003). Serves every catalog job to the Inngest
 * dev server locally and to Inngest Cloud in production; the POST path is
 * signature-verified with `INNGEST_SIGNING_KEY` (set on the client).
 *
 * All catalog jobs touch the Postgres and provider SDKs, so this route runs
 * on the Node runtime, never Edge.
 */
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: catalogFunctions,
});
