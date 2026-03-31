"use client";

import { AlertTriangle } from "lucide-react";
import { computeShiftDurationHours } from "@/lib/utils/time-overlap";

const MIN_SOFT_WARNING_HOURS = 4;
const MAX_SOFT_WARNING_HOURS = 12;

interface ShiftLengthWarningProps {
  startTime: string;
  endTime: string;
}

/**
 * Soft warning banner when a shift slot is shorter than 4 hours
 * or longer than 12 hours. Non-blocking — informational only.
 */
export function ShiftLengthWarning({ startTime, endTime }: ShiftLengthWarningProps) {
  const duration = computeShiftDurationHours(startTime, endTime);
  if (
    duration === null ||
    (duration >= MIN_SOFT_WARNING_HOURS && duration <= MAX_SOFT_WARNING_HOURS)
  ) {
    return null;
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {duration < MIN_SOFT_WARNING_HOURS
          ? `This shift is only ${duration.toFixed(1)} hours. Shifts shorter than ${MIN_SOFT_WARNING_HOURS} hours are unusual and may be hard to fill.`
          : `This shift is ${duration.toFixed(1)} hours. Shifts longer than ${MAX_SOFT_WARNING_HOURS} hours may cause scheduling issues.`}
      </span>
    </div>
  );
}
