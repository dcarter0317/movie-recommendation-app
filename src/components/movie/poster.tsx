import type { JSX } from "react";

import type { PosterSize } from "@/lib/tmdb/images";

import { PosterFallback } from "./poster-fallback";
import { PosterImage } from "./poster-image";

type PosterProps = {
  path: string | undefined;
  alt: string;
  size?: PosterSize;
  sizes?: string;
  priority?: boolean;
};

const DEFAULT_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px";

/**
 * A movie poster at a locked 2:3 ratio. Renders a labelled fallback tile when
 * `path` is missing; otherwise delegates to `PosterImage`, which adds the load
 * skeleton and the runtime `onError` fallback.
 */
export function Poster({
  path,
  alt,
  size = "w500",
  sizes = DEFAULT_SIZES,
  priority = false,
}: PosterProps): JSX.Element {
  if (!path) {
    return <PosterFallback label={alt} />;
  }

  return <PosterImage path={path} alt={alt} size={size} sizes={sizes} priority={priority} />;
}
