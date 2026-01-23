"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScheduleStatus } from "@/types/schedule";

interface ScheduleStatusBadgeProps {
  status: ScheduleStatus;
  className?: string;
}

/**
 * ScheduleStatusBadge - Displays the schedule status with appropriate color coding.
 * - DRAFT: Yellow/amber styling
 * - PUBLISHED: Green styling
 */
export function ScheduleStatusBadge({ status, className }: ScheduleStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        status === "DRAFT" &&
          "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
        status === "PUBLISHED" &&
          "border-green-400 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300",
        className
      )}
    >
      {status}
    </Badge>
  );
}
