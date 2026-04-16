import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-stone-300 dark:border-white/20",
        // Status variants with glass-like backgrounds - earth tones
        draft:
          "bg-amber-700/15 text-amber-800 dark:text-amber-300 border-amber-700/30 font-mono uppercase tracking-wide",
        published:
          "bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 border-emerald-700/30 font-mono uppercase tracking-wide",
        warning:
          "bg-amber-700/15 text-amber-800 dark:text-amber-300 border-amber-700/30",
        success:
          "bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 border-emerald-700/30",
        info: "bg-teal-700/15 text-teal-800 dark:text-teal-300 border-teal-700/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
