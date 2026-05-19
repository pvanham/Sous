"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TimePickerProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * TimePicker - A styled time input component.
 * Uses native HTML time input for browser-native time selection.
 * Format: 24-hour HH:mm (e.g., "14:30")
 *
 * Integrates with react-hook-form via forwardRef.
 * Uses monospace font for precise time display (Warm Industrial design).
 */
const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <input
        type="time"
        className={cn(
          // Base styles
          "flex h-9 w-full rounded px-3 py-2 text-sm",
          // Monospace for time precision (data is always mono)
          "font-mono tabular-nums",
          // Inset background (darker than surface)
          "bg-stone-200 dark:bg-stone-800",
          // Inner shadow for recessed feel
          "shadow-[inset_0_2px_4px_0_rgb(0_0_0/0.05)]",
          // Border - always visible so the control reads against any surface
          "border border-border",
          // Placeholder
          "placeholder:text-stone-500 dark:placeholder:text-stone-400",
          // Focus state - sharp 1px Rust ring
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-700 dark:focus-visible:ring-amber-600",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-shadow",
          // Calendar picker indicator styling
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
          className,
        )}
        ref={ref}
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  },
);
TimePicker.displayName = "TimePicker";

export { TimePicker };
