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
 * Uses the Modern Industrial glass-pill style badges.
 * - DRAFT: Amber styling
 * - PUBLISHED: Emerald styling
 */
export function ScheduleStatusBadge({ status, className }: ScheduleStatusBadgeProps) {
  return (
    <Badge
      variant={status === "DRAFT" ? "draft" : "published"}
      className={cn("text-xs", className)}
    >
      {status}
    </Badge>
  );
}
