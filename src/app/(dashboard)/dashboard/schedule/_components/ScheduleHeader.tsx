"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatWeekLabel } from "@/lib/utils/date";

interface ScheduleHeaderProps {
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  isLoading: boolean;
}

export function ScheduleHeader({
  weekStart,
  onPrevWeek,
  onNextWeek,
  isLoading,
}: ScheduleHeaderProps) {
  return (
    <div className="flex items-center justify-center">
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

        <h2 className="text-lg font-sans font-semibold min-w-[220px] text-center text-stone-900 dark:text-stone-100">
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : (
            <span className="font-mono">{formatWeekLabel(weekStart)}</span>
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
    </div>
  );
}
