import type { JSX } from "react";

import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";

const SIZE: Record<SpinnerSize, string> = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-9 border-[3px]",
};

type SpinnerProps = {
  size?: SpinnerSize;
  label?: string;
  className?: string;
};

/**
 * Loading spinner. `role="status"` with a visually hidden label so assistive
 * tech announces it. Stops spinning when the operating system asks for
 * reduced motion (`motion-reduce:animate-none`), leaving a static ring.
 */
export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps): JSX.Element {
  return (
    <span role="status" className={cn("inline-flex", className)}>
      <span
        aria-hidden
        className={cn(
          "animate-spin rounded-full border-current border-t-transparent text-muted-foreground motion-reduce:animate-none",
          SIZE[size],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
