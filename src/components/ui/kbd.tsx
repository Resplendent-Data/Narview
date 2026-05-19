import * as React from "react";
import { cn } from "../../lib/utils";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 text-[11px] font-medium text-muted-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
