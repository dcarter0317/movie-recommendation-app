"use client";

import type { JSX, ReactNode } from "react";
import { useState } from "react";
import { Clapperboard, Search, Star } from "lucide-react";
import { toast } from "sonner";

import { Cluster } from "@/components/cluster";
import { EmptyState } from "@/components/empty-state";
import { MovieCard } from "@/components/movie/movie-card";
import { Poster } from "@/components/movie/poster";
import { SwipeCard } from "@/components/movie/swipe-card";
import type { MovieSummary, Reaction } from "@/components/movie/types";
import { PageContainer } from "@/components/page-container";
import { Spinner } from "@/components/spinner";
import { Stack } from "@/components/stack";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A visual reference for every design token and component from spec 0005, on
 * one page. This is a developer reference, not a product screen: nothing links
 * to it, and it can be deleted once features 6 and 7 build the real app shell.
 * Spec 0005 Follow-up lists a live `/styleguide` route as a deferred nice to
 * have.
 */

const SAMPLE_MOVIE: MovieSummary = {
  id: "550",
  title: "Fight Club",
  year: 1999,
  posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  genres: ["Drama", "Thriller"],
  overview:
    "An insomniac office worker and a soap maker form an underground fight club that evolves into much more.",
};

const NO_POSTER_MOVIE: MovieSummary = {
  id: "no-poster",
  title: "A Film With No Poster On File",
  year: 2024,
  posterPath: undefined,
  genres: ["Mystery"],
};

const COLOR_TOKENS: ReadonlyArray<{ name: string; className: string }> = [
  { name: "background", className: "bg-background" },
  { name: "foreground", className: "bg-foreground" },
  { name: "card", className: "bg-card" },
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "muted", className: "bg-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "destructive", className: "bg-destructive" },
  { name: "border", className: "bg-border" },
  { name: "ring", className: "bg-ring" },
  { name: "rating", className: "bg-rating" },
  { name: "like", className: "bg-like" },
  { name: "dislike", className: "bg-dislike" },
  { name: "seen", className: "bg-seen" },
  { name: "skip", className: "bg-skip" },
];

const TYPE_STEPS: ReadonlyArray<{ cls: string; label: string }> = [
  { cls: "text-5xl font-semibold tracking-tight", label: "text-5xl · semibold · tight — display" },
  {
    cls: "text-4xl font-semibold tracking-tight",
    label: "text-4xl · semibold · tight — page title",
  },
  { cls: "text-3xl font-semibold tracking-tight", label: "text-3xl · semibold · tight — section" },
  {
    cls: "text-2xl font-semibold tracking-tight",
    label: "text-2xl · semibold · tight — subsection",
  },
  { cls: "text-xl font-medium", label: "text-xl · medium — card title" },
  { cls: "text-lg", label: "text-lg — lead paragraph" },
  { cls: "text-base", label: "text-base — body" },
  { cls: "text-sm", label: "text-sm — secondary" },
  { cls: "text-xs text-muted-foreground", label: "text-xs · muted — meta" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="border-border/60 flex flex-col gap-4 border-t pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : undefined}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  const [swipeKey, setSwipeKey] = useState(0);

  return (
    <PageContainer width="default" className="py-12">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Reel
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Style guide</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Every token and component from the design system (spec 0005), on one page. A developer
          reference, not a product screen. Toggle the theme in the top corner to check both looks.
          The prose lives in{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">docs/design.md</code>.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-8">
        <Section
          title="Color tokens"
          description="From src/app/globals.css. Use the --color-* utilities, never a raw hex in JSX."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {COLOR_TOKENS.map((token) => (
              <div key={token.name} className="flex flex-col gap-1.5">
                <div className={`border-border h-14 w-full rounded-xl border ${token.className}`} />
                <span className="text-xs font-medium">--{token.name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Type scale"
          description="One family (Geist Sans). Headings carry hierarchy through weight and tracking, not a second face."
        >
          <div className="flex flex-col gap-3">
            {TYPE_STEPS.map((step) => (
              <div key={step.label} className="flex flex-col gap-0.5">
                <span className={step.cls}>The quick brown fox</span>
                <span className="text-muted-foreground text-xs">{step.label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Button" description="rounded-full pill. Variants, then sizes.">
          <div className="flex flex-col gap-4">
            <Cluster gap={3}>
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Disabled</Button>
            </Cluster>
            <Cluster gap={3}>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Search">
                <Search />
              </Button>
            </Cluster>
          </div>
        </Section>

        <Section
          title="Badge"
          description="rounded-full pill. Genre chips and counts, never a styled span."
        >
          <Cluster gap={2}>
            <Badge>Active</Badge>
            <Badge variant="secondary">Drama</Badge>
            <Badge variant="outline">Thriller</Badge>
            <Badge variant="destructive">Removed</Badge>
            <Badge variant="ghost">Ghost</Badge>
          </Cluster>
        </Section>

        <Section title="Input and Label" description="Always pair an Input with a Label.">
          <div className="flex max-w-sm flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-name">Name</Label>
              <Input id="sg-name" placeholder="Ada Lovelace" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-disabled">Disabled</Label>
              <Input id="sg-disabled" placeholder="Unavailable" disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-invalid">Invalid</Label>
              <Input id="sg-invalid" defaultValue="not an email" aria-invalid />
            </div>
          </div>
        </Section>

        <Section
          title="Card"
          description="--card surface, hairline ring, rounded-xl. Compose the sub-parts."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recommended for you</CardTitle>
                <CardDescription>Because you liked slow-burn thrillers.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Card body content sits here. Do not dump everything into the content slot.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Open</Button>
              </CardFooter>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Compact card</CardTitle>
                <CardDescription>size=&quot;sm&quot; tightens the spacing.</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-rating flex items-center gap-1">
                  <Star className="size-4 fill-current" />
                  <span className="text-foreground text-sm font-medium">4.6</span>
                </span>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          title="Skeleton and Spinner"
          description="Loading placeholders. Both go static under reduce motion."
        >
          <div className="flex flex-col gap-6">
            <div className="flex max-w-sm flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <Cluster gap={6}>
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </Cluster>
          </div>
        </Section>

        <Section title="EmptyState" description="Centered block for an empty or exhausted list.">
          <Card>
            <CardContent>
              <EmptyState
                icon={<Clapperboard />}
                title="No movies yet"
                description="Swipe a starter deck to teach Reel your taste, then your feed fills in."
                action={<Button size="sm">Start swiping</Button>}
              />
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Toast"
          description="sonner, mounted once at the root layout (position top-center, richColors off)."
        >
          <Cluster gap={3}>
            <Button variant="outline" onClick={() => toast("Added to your watchlist")}>
              Default
            </Button>
            <Button variant="outline" onClick={() => toast.success("Saved")}>
              Success
            </Button>
            <Button variant="outline" onClick={() => toast.error("Could not load the feed")}>
              Error
            </Button>
            <Button variant="outline" onClick={() => toast.info("Syncing your ratings")}>
              Info
            </Button>
          </Cluster>
        </Section>

        <Section title="Stack and Cluster" description="Layout helpers, no logic.">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Stack (gap 3)</p>
              <Stack gap={3}>
                <div className="bg-muted rounded-lg p-3 text-sm">One</div>
                <div className="bg-muted rounded-lg p-3 text-sm">Two</div>
                <div className="bg-muted rounded-lg p-3 text-sm">Three</div>
              </Stack>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Cluster (gap 2)</p>
              <Cluster gap={2}>
                {["Action", "Sci-Fi", "Drama", "Horror", "Comedy"].map((genre) => (
                  <span key={genre} className="bg-muted rounded-full px-3 py-1 text-sm">
                    {genre}
                  </span>
                ))}
              </Cluster>
            </div>
          </div>
        </Section>

        <Section
          title="Poster"
          description="Locked 2:3 ratio, rounded-2xl. Labelled fallback tile when the path is missing."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="w-full max-w-[180px]">
              <Poster path={SAMPLE_MOVIE.posterPath} alt={SAMPLE_MOVIE.title} />
            </div>
            <div className="w-full max-w-[180px]">
              <Poster path={undefined} alt="No poster on file" />
            </div>
          </div>
        </Section>

        <Section
          title="MovieCard"
          description="Poster, title, year, genre pills as one focusable element. Tab to it, then press Enter or Space."
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
            <MovieCard movie={SAMPLE_MOVIE} href="/styleguide" />
            <MovieCard
              movie={{ ...SAMPLE_MOVIE, id: "selectable", title: "Selectable (button)" }}
              onSelect={() => toast("MovieCard selected")}
            />
            <MovieCard movie={NO_POSTER_MOVIE} onSelect={() => toast("No-poster card selected")} />
          </div>
        </Section>

        <Section
          title="SwipeCard"
          description="Drag to fling, click a reaction, or use the arrow keys. Fires once per card; Reset remounts it."
        >
          <div className="flex flex-col items-center gap-4">
            <SwipeCard
              key={swipeKey}
              movie={SAMPLE_MOVIE}
              onReact={(reaction: Reaction) => toast(`Reacted: ${reaction}`)}
            />
            <Button variant="outline" size="sm" onClick={() => setSwipeKey((key) => key + 1)}>
              Reset card
            </Button>
          </div>
        </Section>

        <Section
          title="Surface recipes"
          description="Token-bound utility recipes from docs/design.md, not new tokens."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative max-w-[220px] overflow-hidden rounded-2xl">
              <Poster path={SAMPLE_MOVIE.posterPath} alt={SAMPLE_MOVIE.title} />
              <div className="from-background via-background/80 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-12">
                <p className="text-sm font-medium">Warm poster scrim</p>
                <p className="text-muted-foreground text-xs">
                  from-background via-background/80 to-transparent
                </p>
              </div>
            </div>
            <div className="relative max-w-[220px] overflow-hidden rounded-2xl">
              <Poster path={SAMPLE_MOVIE.posterPath} alt={SAMPLE_MOVIE.title} />
              <div className="border-border/60 bg-card/70 absolute inset-x-4 top-4 rounded-3xl border p-4 backdrop-blur-xl">
                <p className="text-sm font-medium">Frosted glass panel</p>
                <p className="text-muted-foreground text-xs">
                  bg-card/70 backdrop-blur-xl border rounded-3xl
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
