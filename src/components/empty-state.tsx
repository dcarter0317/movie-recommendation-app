import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Centered block for an empty or exhausted list. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="text-muted-foreground [&_svg]:size-8" aria-hidden>
          {icon}
        </div>
      ) : undefined}
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-base font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
        ) : undefined}
      </div>
      {action ? <div className="mt-1">{action}</div> : undefined}
    </div>
  );
}
