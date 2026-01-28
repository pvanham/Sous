"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TimePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * TimePicker - A styled time input component.
 * Uses native HTML time input for browser-native time selection.
 * Format: 24-hour HH:mm (e.g., "14:30")
 *
 * Integrates with react-hook-form via forwardRef.
 * Uses monospace font for precise time display (Industrial design).
 */
const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <input
        type="time"
        className={cn(
          // Base styles
          "flex h-9 w-full rounded px-3 py-2 text-sm",
          // Monospace for time precision
          "font-mono tabular-nums",
          // Inset background
          "bg-slate-100 dark:bg-slate-800",
          // Border
          "border border-slate-200 dark:border-white/10",
          // Placeholder
          "placeholder:text-slate-500",
          // Focus state
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-colors",
          // Calendar picker indicator styling
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
          className
        )}
        ref={ref}
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  }
);
TimePicker.displayName = "TimePicker";

export { TimePicker };
