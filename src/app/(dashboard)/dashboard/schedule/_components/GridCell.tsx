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
        "min-h-[80px] border border-border rounded-sm bg-background",
        onClick && "cursor-pointer hover:bg-accent/50 transition-colors"
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
      {/* Empty cell - content added in Sprint 2.3 */}
    </div>
  );
}
