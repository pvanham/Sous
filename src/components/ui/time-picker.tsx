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
 */
const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <input
        type="time"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          // Additional styling for time input to ensure consistent appearance
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
