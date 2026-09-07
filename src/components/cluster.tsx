import type { ComponentProps, JSX } from "react";

import { cn } from "@/lib/utils";

type GapKey = 1 | 2 | 3 | 4 | 6 | 8;
type Align = "start" | "center" | "end" | "baseline";

const GAP: Record<GapKey, string> = {
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
};

const ALIGN: Record<Align, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
};

type ClusterProps = ComponentProps<"div"> & {
  gap?: GapKey;
  align?: Align;
};

/** Horizontal flex row that wraps. Layout only, no logic. */
export function Cluster({
  gap = 2,
  align = "center",
  className,
  ...props
}: ClusterProps): JSX.Element {
  return <div className={cn("flex flex-wrap", GAP[gap], ALIGN[align], className)} {...props} />;
}
