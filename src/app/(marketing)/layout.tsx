import type { ReactNode } from "react";

/**
 * Public marketing pages (feature 13 builds these out).
 *
 * This route group must stay static and self-contained: no per-request or
 * authed data, and it stays out of the Clerk middleware matcher, so a
 * product outage can never take the public pages down. `force-static`
 * makes that a build-time guarantee.
 */
export const dynamic = "force-static";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
