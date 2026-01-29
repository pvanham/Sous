"use client";

import { cn } from "@/lib/utils";

interface GridCellProps {
  staffId: string;
  date: Date;
  onClick?: () => void;
}

export function GridCell({ staffId, date, onClick }: GridCellProps) {
  return (
    <div
      className={cn(
        // Base styling - subtle grid (compact height)
        "min-h-[44px] rounded bg-background",
        // Subtle border - stone palette (Industrial grid)
        "border border-stone-300/50 dark:border-white/5",
        // Interactive states
        onClick &&
          "cursor-pointer hover:bg-stone-100/50 dark:hover:bg-stone-800/50 transition-colors",
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
      data-staff-id={staffId}
      data-date={date.toISOString()}
    >
      {/* Empty cell */}
    </div>
  );
}
