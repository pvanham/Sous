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
        // Base layout
        "rounded p-3 min-h-[80px]",
        // Glass effect - transparent background
        "bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm",
        // Border - subtle on edges, solid accent on left (from station colors)
        "border-y border-r border-slate-200 dark:border-white/10",
        // Station-specific colors (glass background + left border accent)
        getStationClasses(shift.station),
        // Interactive states
        onClick && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-900/80",
        // Smooth transition
        "transition-colors duration-150"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
      {/* Station name - UI text */}
      <div className="font-sans font-medium text-sm">{shift.station}</div>

      {/* Time range - Monospace for precision */}
      <div className="font-mono text-xs text-muted-foreground mt-1">
        {formatTimeRange(start, end)}
      </div>

      {/* Duration - Monospace for data */}
      <div className="font-mono text-xs text-muted-foreground">
        {formatShiftDuration(start, end)}
      </div>

      {/* Notes - Small text, truncated */}
      {shift.notes && (
        <div className="text-muted-foreground mt-1 truncate text-[10px]">
          {shift.notes}
        </div>
      )}
    </div>
  );
}
