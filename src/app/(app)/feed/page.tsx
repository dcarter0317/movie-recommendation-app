import type { Metadata } from "next";

import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Your feed",
};

export default function FeedPage() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      {/* Placeholder home for the theme control until features 6 and 7 build the app shell. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Your feed</h1>
      <p className="text-muted-foreground max-w-md">
        Slice 1 builds this: swipe a starter deck, cross the &ldquo;enough to start&rdquo;
        threshold, then see a ranked feed of unseen movies with a reason for each pick.
      </p>
    </main>
  );
}
