"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function OTPInput({ length = 6, value, onChange, disabled = false }: OTPInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Split value into individual digits
  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  const focusInput = (index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[clamped]?.focus();
  };

  const handleChange = (index: number, char: string) => {
    if (disabled) return;

    // Only allow digits
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...digits];
    newDigits[index] = char;
    const newValue = newDigits.join("");
    onChange(newValue);

    // Auto-advance to next cell
    if (char && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        // Clear current cell
        handleChange(index, "");
      } else if (index > 0) {
        // Move to previous cell and clear it
        handleChange(index - 1, "");
        focusInput(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (disabled) return;

    const pasted = e.clipboardData.getData("text/plain").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      // Focus the cell after the last pasted digit, or the last cell
      focusInput(Math.min(pasted.length, length - 1));
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <React.Fragment key={index}>
          {/* Separator dash in the middle */}
          {index === Math.floor(length / 2) && (
            <div className="w-3 flex items-center justify-center">
              <span className="text-stone-400 dark:text-stone-500 text-lg">–</span>
            </div>
          )}
          <input
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onFocus={handleFocus}
            onChange={(e) => handleChange(index, e.target.value.slice(-1))}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={cn(
              // Size and shape
              "h-12 w-10 rounded-md text-center text-lg font-mono font-semibold",
              // Inset background (matching Input component)
              "bg-stone-200 dark:bg-stone-700/30",
              // Inner shadow for depth
              "shadow-[inset_0_2px_4px_0_rgb(0_0_0/0.05)]",
              // Border
              "border border-transparent",
              // Focus state - amber ring
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-700 dark:focus-visible:ring-amber-600",
              // Filled state - subtle highlight
              digit && "border-stone-300 dark:border-stone-600",
              // Disabled
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Transition
              "transition-all"
            )}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

OTPInput.displayName = "OTPInput";

export { OTPInput };
export type { OTPInputProps };
