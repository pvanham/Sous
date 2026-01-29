import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles - Industrial inset design
          "flex h-9 w-full rounded px-3 py-2 text-sm font-sans",
          // Inset background (darker than card for recessed feel)
          "bg-stone-200 dark:bg-stone-800",
          // Inner shadow for depth
          "shadow-[inset_0_2px_4px_0_rgb(0_0_0/0.05)]",
          // Border - transparent until focused
          "border border-transparent",
          // Placeholder
          "placeholder:text-stone-500 dark:placeholder:text-stone-400",
          // Focus state - sharp 1px Rust ring
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-700 dark:focus-visible:ring-amber-600",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-shadow",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
