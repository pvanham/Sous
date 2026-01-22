"use client";

import { cn } from "@/lib/utils";
import { formatTimeRange, formatShiftDuration } from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";

// Station color mapping - uses index for consistent colors
const stationColors: Record<string, string> = {
  // Common stations with specific colors
  Grill: "bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-700",
  Prep: "bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700",
  Assembly: "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700",
  Register: "bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700",
  // Default fallback
  default: "bg-gray-100 border-gray-300 dark:bg-gray-800/50 dark:border-gray-600",
};

function getStationColor(station: string): string {
  return stationColors[station] ?? stationColors.default;
}

interface ShiftCardProps {
  shift: ShiftDTO;
  onClick?: () => void;
}

export function ShiftCard({ shift, onClick }: ShiftCardProps) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const stationColor = getStationColor(shift.station);

  return (
    <div
      className={cn(
        "rounded-md border p-2 text-xs min-h-[80px]",
        stationColor,
        onClick && "cursor-pointer hover:shadow-md transition-shadow"
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
      <div className="font-medium text-sm">{shift.station}</div>
      <div className="text-muted-foreground mt-1">
        {formatTimeRange(start, end)}
      </div>
      <div className="text-muted-foreground">
        {formatShiftDuration(start, end)}
      </div>
      {shift.notes && (
        <div className="text-muted-foreground mt-1 truncate text-[10px]">
          {shift.notes}
        </div>
      )}
    </div>
  );
}
