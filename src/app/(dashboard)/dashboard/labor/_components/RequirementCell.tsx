"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LaborRequirementDTO, LaborPriority } from "@/types/labor-requirement";

interface RequirementCellProps {
  station: string;
  dayOfWeek: number;
  requirements: LaborRequirementDTO[];
  onCellClick: (station: string, dayOfWeek: number, requirement?: LaborRequirementDTO) => void;
}

/**
 * Get priority border classes for visual indication
 */
function getPriorityBorderClasses(priority: LaborPriority): string {
  switch (priority) {
    case "critical":
      return "border-l-4 border-red-600 dark:border-red-500";
    case "high":
      return "border-l-4 border-orange-600 dark:border-orange-500";
    case "normal":
      return "border-l-4 border-slate-500 dark:border-slate-400";
    case "low":
      return "border-l-4 border-slate-300 dark:border-slate-500";
    default:
      return "border-l-4 border-slate-400";
  }
}

/**
 * Format time range for display (e.g., "9a-5p")
 */
function formatTimeRange(startTime: string, endTime: string): string {
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "p" : "a";
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    // Only show minutes if non-zero
    if (minutes === 0) {
      return `${displayHours}${period}`;
    }
    return `${displayHours}:${minutes.toString().padStart(2, "0")}${period}`;
  };
  
  return `${formatTime(startTime)}-${formatTime(endTime)}`;
}

export function RequirementCell({
  station,
  dayOfWeek,
  requirements,
  onCellClick,
}: RequirementCellProps) {
  const hasRequirements = requirements.length > 0;

  // Empty cell - show add button
  if (!hasRequirements) {
    return (
      <button
        type="button"
        onClick={() => onCellClick(station, dayOfWeek)}
        className="min-h-[60px] px-2 py-2 flex items-center justify-center hover:bg-muted/50 transition-colors rounded-sm group"
        aria-label={`Add requirement for ${station}`}
      >
        <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  // Cell with requirements - show them as clickable items
  return (
    <div className="min-h-[60px] px-1 py-1 flex flex-col gap-1">
      {requirements.map((req) => (
        <button
          key={req.id}
          type="button"
          onClick={() => onCellClick(station, dayOfWeek, req)}
          className={cn(
            "text-left px-2 py-1.5 rounded-sm text-xs hover:bg-muted transition-colors",
            "bg-background",
            getPriorityBorderClasses(req.priority)
          )}
        >
          <div className="font-medium">
            {req.minStaff === req.preferredStaff
              ? `${req.minStaff} staff`
              : `${req.minStaff}-${req.preferredStaff} staff`}
          </div>
          <div className="text-muted-foreground">
            {formatTimeRange(req.startTime, req.endTime)}
          </div>
        </button>
      ))}
      
      {/* Add more button at bottom */}
      <button
        type="button"
        onClick={() => onCellClick(station, dayOfWeek)}
        className="px-2 py-1 flex items-center justify-center hover:bg-muted/50 transition-colors rounded-sm group text-xs text-muted-foreground"
        aria-label={`Add another requirement for ${station}`}
      >
        <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}
