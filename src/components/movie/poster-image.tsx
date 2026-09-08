"use client";

import { useState } from "react";
import Image from "next/image";

import { Skeleton } from "@/components/ui/skeleton";
import { posterUrl, type PosterSize } from "@/lib/tmdb/images";

import { PosterFallback } from "./poster-fallback";

type PosterImageProps = {
  path: string;
  alt: string;
  size: PosterSize;
  sizes: string;
  priority: boolean;
};

/**
 * The client half of `Poster`: owns the load skeleton and the runtime
 * `onError` fallback. `Poster` decides the "no path" case before this renders.
 */
export function PosterImage({ path, alt, size, sizes, priority }: PosterImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (status === "error") {
    return <PosterFallback label={alt} />;
  }

  return (
    <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
      {status === "loading" ? (
        <Skeleton className="absolute inset-0 h-full w-full rounded-2xl" />
      ) : undefined}
      <Image
        src={posterUrl(path, size)}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}
