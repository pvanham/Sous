"use client";

import { cn } from "@/lib/utils";
import { formatTimeRange, formatShiftDuration } from "@/lib/utils/date";
import { getStationClasses } from "@/lib/utils/station-colors";
import type { ShiftDTO } from "@/types/shift";

interface ShiftCardProps {
  shift: ShiftDTO;
  onClick?: () => void;
}

export function ShiftCard({ shift, onClick }: ShiftCardProps) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);

  return (
    <div
      className={cn(
        // Base layout - compact height
        "rounded p-2 min-h-[44px] flex flex-col justify-center",
        // Glass effect - stone-based warm industrial
        "bg-stone-100/50 dark:bg-stone-900/40 backdrop-blur-sm",
        // Border - subtle outline around the card
        "border border-stone-300/50 dark:border-white/10",
        // Station-specific colors (includes 4px left border accent)
        getStationClasses(shift.station),
        // Interactive states - brighten border only, NO lift
        onClick &&
          "cursor-pointer hover:border-stone-400 dark:hover:border-white/20",
        // Smooth transition
        "transition-colors duration-150",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={`${shift.station}${shift.notes ? ` - ${shift.notes}` : ""}`}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Time range and duration inline - Monospace for precision */}
      <div className="font-mono text-[12px] text-stone-700 dark:text-stone-300">
        {formatTimeRange(start, end)} ({formatShiftDuration(start, end)})
      </div>

      {/* Notes - Small text, truncated, only shown if present */}
      {shift.notes && (
        <div className="text-muted-foreground truncate text-[10px] font-sans">
          {shift.notes}
        </div>
      )}
    </div>
  );
}
