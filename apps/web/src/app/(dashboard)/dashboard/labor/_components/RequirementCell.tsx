"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { LaborRequirementDTO, LaborPriority } from "@/types/labor-requirement";

interface RequirementCellProps {
  station: string;
  dayOfWeek: number;
  requirements: LaborRequirementDTO[];
  onCellClick: (station: string, dayOfWeek: number, requirement?: LaborRequirementDTO) => void;
  /** Whether bulk edit mode is active */
  bulkEditMode?: boolean;
  /** Whether this cell is selected in bulk edit mode */
  isSelected?: boolean;
  /** Toggle selection for this cell */
  onToggleSelect?: () => void;
}

/**
 * Get priority accent color classes (left border)
 */
function getPriorityClasses(priority: LaborPriority): string {
  switch (priority) {
    case "critical":
      return "border-l-[3px] border-l-red-500 dark:border-l-red-400";
    case "high":
      return "border-l-[3px] border-l-orange-500 dark:border-l-orange-400";
    case "normal":
      return "border-l-[3px] border-l-slate-400 dark:border-l-slate-500";
    case "low":
      return "border-l-[3px] border-l-slate-300 dark:border-l-slate-600";
    default:
      return "border-l-[3px] border-l-slate-400";
  }
}

/**
 * Format time for display (e.g., "9a", "5p", "10:30a")
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "p" : "a";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  if (minutes === 0) {
    return `${displayHours}${period}`;
  }
  return `${displayHours}:${minutes.toString().padStart(2, "0")}${period}`;
}

/**
 * Format time range compactly (e.g., "9a-5p")
 */
function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)}-${formatTime(endTime)}`;
}

export function RequirementCell({
  station,
  dayOfWeek,
  requirements,
  onCellClick,
  bulkEditMode = false,
  isSelected = false,
  onToggleSelect,
}: RequirementCellProps) {
  const hasRequirements = requirements.length > 0;

  // In bulk edit mode, clicking the cell toggles selection
  const handleCellClick = () => {
    if (bulkEditMode && onToggleSelect) {
      onToggleSelect();
    }
  };

  // Wrapper for bulk edit mode selection
  const cellWrapper = (children: React.ReactNode) => (
    <div
      className={cn(
        "relative h-full",
        bulkEditMode && "cursor-pointer",
        bulkEditMode && isSelected && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
      onClick={bulkEditMode ? handleCellClick : undefined}
    >
      {bulkEditMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="absolute top-1 right-1 z-10"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {children}
    </div>
  );

  // Empty cell - show dashed add area
  if (!hasRequirements) {
    if (bulkEditMode) {
      return cellWrapper(
        <div className="h-full px-2 py-2 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Empty</span>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onCellClick(station, dayOfWeek)}
        className="h-full w-full px-2 py-2 flex items-center justify-center border border-dashed border-transparent hover:border-muted-foreground/30 transition-colors rounded-sm group"
        aria-label={`Add shift slot for ${station}`}
      >
        <Plus className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
      </button>
    );
  }

  // Cell with shift slots
  const content = (
    <div className={cn("h-full px-1 py-1.5 flex flex-col gap-0.5", bulkEditMode && "pt-6")}>
      {requirements.map((req) => {
        const isZeroStaff = req.minStaff === 0 && req.preferredStaff === 0;
        const staffLabel = isZeroStaff
          ? "Closed"
          : req.minStaff === req.preferredStaff
            ? `${req.minStaff} staff`
            : `${req.minStaff}-${req.preferredStaff}`;

        return (
          <button
            key={req.id}
            type="button"
            onClick={(e) => {
              if (bulkEditMode) {
                e.stopPropagation();
                return;
              }
              onCellClick(station, dayOfWeek, req);
            }}
            disabled={bulkEditMode}
            className={cn(
              "text-left px-1.5 py-1 rounded-sm text-xs transition-colors",
              !bulkEditMode && "hover:bg-muted/70",
              isZeroStaff ? "bg-muted/30 opacity-50" : "bg-muted/20",
              getPriorityClasses(req.priority)
            )}
          >
            {/* Compact single-line layout: time range + staff count */}
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-medium whitespace-nowrap">
                {formatTimeRange(req.startTime, req.endTime)}
              </span>
              <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                {staffLabel}
              </span>
            </div>
          </button>
        );
      })}
      
      {/* Add more button at bottom - dashed affordance, only in normal mode */}
      {!bulkEditMode && (
        <button
          type="button"
          onClick={() => onCellClick(station, dayOfWeek)}
          className="mt-auto px-1.5 py-0.5 flex items-center justify-center border border-dashed border-transparent hover:border-muted-foreground/30 transition-colors rounded-sm group"
          aria-label={`Add another shift slot for ${station}`}
        >
          <Plus className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors" />
        </button>
      )}
    </div>
  );

  if (bulkEditMode) {
    return cellWrapper(content);
  }

  return content;
}
