import type { ReactNode } from "react";

/**
 * The authenticated product (onboarding, feed, import, search, watchlist).
 *
 * Feature 6 (accounts and sign in) adds `clerkMiddleware` guarding this
 * route group, the lazy `users` upsert on the first authed request, and
 * the `withUser` transaction helper. For the scaffold this is just a shell.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
