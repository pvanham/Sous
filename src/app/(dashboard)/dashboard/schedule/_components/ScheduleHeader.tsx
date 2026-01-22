"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatWeekLabel } from "@/lib/utils/date";
import type { ScheduleStatus } from "@/types/schedule";

interface ScheduleHeaderProps {
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  scheduleStatus: ScheduleStatus;
  isLoading: boolean;
}

export function ScheduleHeader({
  weekStart,
  onPrevWeek,
  onNextWeek,
  scheduleStatus,
  isLoading,
}: ScheduleHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button
          onClick={onPrevWeek}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Prev Week
        </Button>

        <h2 className="text-lg font-semibold min-w-[220px] text-center">
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : (
            formatWeekLabel(weekStart)
          )}
        </h2>

        <Button
          onClick={onNextWeek}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          Next Week
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <Badge
        variant={scheduleStatus === "PUBLISHED" ? "default" : "secondary"}
        className="text-xs"
      >
        {scheduleStatus}
      </Badge>
    </div>
  );
}
