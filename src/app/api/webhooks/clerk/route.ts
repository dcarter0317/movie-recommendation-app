import { NextResponse } from "next/server";

// Feature 6 (accounts and sign in) fills in the body: verify the Svix
// signature with `CLERK_WEBHOOK_SIGNING_SECRET`, then reconcile the `users`
// row on `user.created` / `user.updated` / `user.deleted`. The lazy upsert
// on the first authed request is the source of truth; this is reconciliation
// only. Until then it returns 501.
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "Clerk webhook not configured yet" }, { status: 501 });
}
