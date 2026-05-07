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
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-background/80 px-1.5 py-1.5 shadow-sm backdrop-blur-sm">
      <Button
        onClick={onPrevWeek}
        variant="outline"
        size="icon"
        disabled={isLoading}
        className="h-8 w-8 shrink-0 border-border/60"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <span className="min-w-[190px] select-none px-2 text-center font-mono text-sm font-semibold tracking-wide text-foreground">
        {isLoading ? (
          <span className="flex items-center justify-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </span>
        ) : (
          formatWeekLabel(weekStart)
        )}
      </span>

      <Button
        onClick={onNextWeek}
        variant="outline"
        size="icon"
        disabled={isLoading}
        className="h-8 w-8 shrink-0 border-border/60"
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
