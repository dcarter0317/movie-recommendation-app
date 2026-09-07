"use client";

import type { JSX, KeyboardEvent } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { Poster } from "./poster";
import type { MovieSummary } from "./types";

type MovieCardProps = {
  movie: MovieSummary;
  href?: string;
  onSelect?: () => void;
  priority?: boolean;
  className?: string;
};

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * A movie poster with its title, year, and up to three genre badges, as one
 * focusable element: a link when `href` is set, a button when `onSelect` is,
 * a plain block otherwise. Enter and Space both activate it.
 */
export function MovieCard({
  movie,
  href,
  onSelect,
  priority = false,
  className,
}: MovieCardProps): JSX.Element {
  const body = (
    <>
      <Poster
        path={movie.posterPath}
        alt={movie.title}
        priority={priority}
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
      />
      <div className="flex flex-col gap-1">
        <span className="line-clamp-2 text-sm font-medium">{movie.title}</span>
        {movie.year !== undefined ? (
          <span className="text-muted-foreground text-xs">{movie.year}</span>
        ) : undefined}
        {movie.genres && movie.genres.length > 0 ? (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {movie.genres.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary">
                {genre}
              </Badge>
            ))}
          </span>
        ) : undefined}
      </div>
    </>
  );

  const shared = cn("group flex w-full flex-col gap-2 rounded-xl text-left", FOCUS_RING, className);

  if (href) {
    return (
      <Link
        href={href}
        className={shared}
        onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
          if (event.key === " ") {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        {body}
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={shared}>
        {body}
      </button>
    );
  }

  return <div className={cn(shared, "cursor-default")}>{body}</div>;
}
