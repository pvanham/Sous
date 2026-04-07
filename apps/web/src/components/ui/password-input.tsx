"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        className={cn(
          // Base styles - Industrial inset design (matches Input)
          "flex h-9 w-full rounded px-3 py-2 pr-10 text-sm font-sans",
          // Inset background (darker than card for recessed feel)
          "bg-stone-200 dark:bg-stone-700/30",
          // Inner shadow for depth
          "shadow-[inset_0_2px_4px_0_rgb(0_0_0/0.05)]",
          // Border - transparent until focused
          "border border-transparent",
          // Placeholder
          "placeholder:text-stone-500 dark:placeholder:text-stone-400",
          // Focus state - sharp 1px Rust ring
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-700 dark:focus-visible:ring-amber-600",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-shadow",
          className
        )}
        ref={ref}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShowPassword((prev) => !prev)}
        className={cn(
          "absolute right-2.5 top-1/2 -translate-y-1/2",
          "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300",
          "transition-colors focus:outline-none"
        )}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
