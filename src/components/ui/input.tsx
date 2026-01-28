import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles - Industrial inset design
          "flex h-9 w-full rounded px-3 py-2 text-sm font-sans",
          // Inset background (darker than card for recessed feel)
          "bg-slate-100 dark:bg-slate-800",
          // Border
          "border border-slate-200 dark:border-white/10",
          // Placeholder
          "placeholder:text-slate-500 dark:placeholder:text-slate-400",
          // Focus state - Electric Indigo ring
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
