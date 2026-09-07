import type { ComponentProps, JSX } from "react";

import { cn } from "@/lib/utils";

type GapKey = 1 | 2 | 3 | 4 | 6 | 8;
type Align = "start" | "center" | "end" | "stretch";

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
  stretch: "items-stretch",
};

type StackProps = ComponentProps<"div"> & {
  gap?: GapKey;
  align?: Align;
};

/** Vertical flex stack. Layout only, no logic. */
export function Stack({
  gap = 4,
  align = "stretch",
  className,
  ...props
}: StackProps): JSX.Element {
  return <div className={cn("flex flex-col", GAP[gap], ALIGN[align], className)} {...props} />;
}
