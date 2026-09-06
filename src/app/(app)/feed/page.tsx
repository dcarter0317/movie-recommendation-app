import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your feed",
};

export default function FeedPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your feed</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Slice 1 builds this: swipe a starter deck, cross the &ldquo;enough to start&rdquo;
        threshold, then see a ranked feed of unseen movies with a reason for each pick.
      </p>
    </main>
  );
}
