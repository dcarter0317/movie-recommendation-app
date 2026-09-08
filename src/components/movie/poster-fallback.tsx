import { Film } from "lucide-react";

/** Labelled placeholder tile shown when a movie has no poster, or its image fails to load. */
export function PosterFallback({ label }: { label: string }) {
  return (
    <div className="bg-muted text-muted-foreground flex aspect-2/3 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl p-3 text-center">
      <Film className="size-6" aria-hidden />
      <span className="line-clamp-3 text-xs font-medium">{label}</span>
    </div>
  );
}
