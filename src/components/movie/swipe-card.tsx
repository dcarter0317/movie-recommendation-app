"use client";

import type { JSX, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { Eye, SkipForward, ThumbsDown, ThumbsUp } from "lucide-react";
import { domAnimation, LazyMotion, m, useMotionValue, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Poster } from "./poster";
import {
  directionForOffset,
  REACTION_BY_ARROW_KEY,
  REACTION_BY_DIRECTION,
  reactionForDrag,
} from "./reaction";
import type { MovieSummary, Reaction } from "./types";

type DragInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

type SwipeCardProps = {
  movie: MovieSummary;
  /** Called exactly once per mounted card. Focus across cards is the caller's job. */
  onReact: (reaction: Reaction) => void;
};

const CONTROLS: ReadonlyArray<{
  reaction: Reaction;
  label: string;
  Icon: typeof Eye;
}> = [
  { reaction: "dislike", label: "Dislike", Icon: ThumbsDown },
  { reaction: "seen", label: "Seen it", Icon: Eye },
  { reaction: "skip", label: "Skip", Icon: SkipForward },
  { reaction: "like", label: "Like", Icon: ThumbsUp },
];

const HINT_CLASS: Record<Reaction, string> = {
  like: "bg-like",
  dislike: "bg-dislike",
  seen: "bg-seen",
  skip: "bg-skip",
};

const REACTION_LABEL: Record<Reaction, string> = {
  like: "Liked",
  dislike: "Disliked",
  seen: "Marked as seen",
  skip: "Skipped",
};

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * One card in the swipe deck. Take a reaction three ways: a drag that flings
 * past the threshold, an on screen button, or an arrow key. All three resolve
 * through `reactionForDrag` / `REACTION_BY_DIRECTION`, so they cannot disagree.
 * Uncontrolled: the caller sets `key={movie.id}` to reset it for the next card,
 * and owns moving focus onward.
 */
export function SwipeCard({ movie, onReact }: SwipeCardProps): JSX.Element {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const reactedRef = useRef<Reaction | undefined>(undefined);
  const [reacted, setReacted] = useState<Reaction | undefined>(undefined);
  const [hint, setHint] = useState<Reaction | undefined>(undefined);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const fire = useCallback(
    (reaction: Reaction) => {
      if (reactedRef.current) return;
      reactedRef.current = reaction;
      setReacted(reaction);
      setHint(undefined);
      rootRef.current?.focus();
      onReact(reaction);
    },
    [onReact],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const reaction = REACTION_BY_ARROW_KEY[event.key];
    if (!reaction) return;
    event.preventDefault();
    fire(reaction);
  };

  const handleDrag = (_: unknown, info: DragInfo) => {
    if (reactedRef.current) return;
    setHint(REACTION_BY_DIRECTION[directionForOffset(info.offset)]);
  };

  const handleDragEnd = (_: unknown, info: DragInfo) => {
    const reaction = reactionForDrag(info.offset, info.velocity);
    if (reaction) {
      fire(reaction);
    } else {
      setHint(undefined);
    }
  };

  const card = (
    <div
      className={cn(
        "bg-card text-card-foreground ring-foreground/10 relative flex w-full max-w-sm flex-col gap-3 overflow-hidden rounded-xl p-4 ring-1 transition-opacity",
        reacted !== undefined && "opacity-60",
      )}
    >
      {hint !== undefined && reacted === undefined ? (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 opacity-15", HINT_CLASS[hint])}
        />
      ) : undefined}
      <div className="mx-auto w-40">
        <Poster path={movie.posterPath} alt={movie.title} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {movie.title}
          {movie.year !== undefined ? ` (${movie.year})` : ""}
        </p>
        {movie.genres && movie.genres.length > 0 ? (
          <p className="text-muted-foreground text-xs">{movie.genres.slice(0, 3).join(" · ")}</p>
        ) : undefined}
        {movie.overview ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">{movie.overview}</p>
        ) : undefined}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Rate ${movie.title}`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn("flex flex-col items-center gap-4 rounded-xl", FOCUS_RING)}
    >
      {prefersReducedMotion ? (
        card
      ) : (
        <LazyMotion features={domAnimation}>
          <m.div
            drag
            dragElastic={0.2}
            dragSnapToOrigin
            style={{ x, y }}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            className="cursor-grab touch-none active:cursor-grabbing"
          >
            {card}
          </m.div>
        </LazyMotion>
      )}

      <div className="flex items-center gap-2">
        {CONTROLS.map(({ reaction, label, Icon }) => (
          <Button
            key={reaction}
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            disabled={reacted !== undefined}
            onClick={() => fire(reaction)}
          >
            <Icon />
          </Button>
        ))}
      </div>

      <div aria-live="polite" className="sr-only">
        {reacted !== undefined ? `${REACTION_LABEL[reacted]} ${movie.title}` : ""}
      </div>
    </div>
  );
}
