import { NextResponse } from "next/server";

// The background jobs work replaces this stub with the real Inngest handler
// (`serve()` with the Inngest client and the registered functions). Until
// then every method returns 501 so a half-configured deploy is obvious.
export const runtime = "nodejs";

function notImplemented() {
  return NextResponse.json({ error: "Inngest handler not configured yet" }, { status: 501 });
}

export const GET = notImplemented;
export const POST = notImplemented;
export const PUT = notImplemented;
