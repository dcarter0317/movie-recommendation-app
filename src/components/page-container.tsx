import type { ComponentProps, JSX } from "react";

import { cn } from "@/lib/utils";

type Width = "default" | "prose" | "wide";

const WIDTH: Record<Width, string> = {
  default: "max-w-6xl",
  prose: "max-w-2xl",
  wide: "max-w-7xl",
};

type PageContainerProps = ComponentProps<"div"> & {
  as?: "main" | "div";
  width?: Width;
};

/**
 * Page width + gutter wrapper. `main` by default (`div` when nesting inside
 * another `main`). Gutter steps at `sm` and `lg`.
 */
export function PageContainer({
  as = "main",
  width = "default",
  className,
  ...props
}: PageContainerProps): JSX.Element {
  const Comp = as;
  return (
    <Comp
      className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTH[width], className)}
      {...props}
    />
  );
}
