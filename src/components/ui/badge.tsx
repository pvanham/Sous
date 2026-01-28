import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline:
          "text-foreground border-slate-300 dark:border-white/20",
        // Status variants with glass-like backgrounds
        draft:
          "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-mono uppercase tracking-wide",
        published:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-mono uppercase tracking-wide",
        warning:
          "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        success:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        info:
          "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
