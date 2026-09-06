import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500">Reel</span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A movie feed that knows your taste and explains every pick.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Import your Letterboxd ratings or swipe through a starter deck, then get personalized
          recommendations with a reason for each one, plus natural-language vibe search.
        </p>
      </div>
      <Link
        href="/feed"
        className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Get started
      </Link>
    </main>
  );
}
