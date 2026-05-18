"use client";

import { CalendarOff } from "lucide-react";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimeOffPillProps {
  request: TimeOffRequestDTO;
  className?: string;
}

/**
 * Compact overlay rendered behind the shift cards on the manager grid
 * when a staff member has an approved or pending time-off request that
 * overlaps the day. Approved requests render as a solid pill; pending
 * requests render with a dashed border and reduced opacity so a manager
 * can spot conflicts at a glance without confusing decided vs.
 * undecided.
 *
 * The tooltip surfaces the request reason on hover so the manager
 * doesn't have to leave the grid to triage the conflict.
 */
export function TimeOffPill({ request, className }: TimeOffPillProps) {
  const isApproved = request.status === "approved";
  const label = isApproved ? "Time off" : "Pending";
  const reason = request.reason?.trim().length
    ? request.reason
    : isApproved
      ? "Approved time off"
      : "Pending time-off request";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              isApproved
                ? "bg-primary/15 text-primary"
                : "border border-dashed border-primary/50 bg-primary/5 text-primary/80 opacity-80",
              className,
            )}
            role="note"
            aria-label={`${label}: ${reason}`}
          >
            <CalendarOff className="h-3 w-3" aria-hidden />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">
            {isApproved ? "Approved time off" : "Pending time off"}
          </p>
          {reason !== "Approved time off" &&
            reason !== "Pending time-off request" && (
              <p className="mt-1 text-muted-foreground">{reason}</p>
            )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
