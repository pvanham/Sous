"use client";

import { Clock, Users, CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ShiftDTO } from "@/types/shift";

interface WeekSummaryProps {
  shifts: ShiftDTO[];
}

/**
 * Calculates the total hours from an array of shifts.
 * @param shifts - Array of ShiftDTO objects
 * @returns Total hours as a number (rounded to 1 decimal)
 */
function calculateTotalHours(shifts: ShiftDTO[]): number {
  const totalMs = shifts.reduce((acc, shift) => {
    const start = new Date(shift.start).getTime();
    const end = new Date(shift.end).getTime();
    return acc + (end - start);
  }, 0);

  // Convert milliseconds to hours and round to 1 decimal
  return Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
}

/**
 * Counts unique staff members scheduled.
 * @param shifts - Array of ShiftDTO objects
 * @returns Number of unique staff IDs
 */
function countUniqueStaff(shifts: ShiftDTO[]): number {
  const uniqueStaffIds = new Set(shifts.map((shift) => shift.staffId));
  return uniqueStaffIds.size;
}

/**
 * WeekSummary - Displays aggregate statistics for the current week's schedule.
 * Shows total shifts, total hours, and number of staff members scheduled.
 * Uses Modern Industrial styling with monospace numbers.
 */
export function WeekSummary({ shifts }: WeekSummaryProps) {
  const totalShifts = shifts.length;
  const totalHours = calculateTotalHours(shifts);
  const staffScheduled = countUniqueStaff(shifts);

  return (
    <Card className="mb-4">
      <CardContent className="py-4">
        <div className="flex items-center justify-around gap-6">
          {/* Total Shifts */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-indigo-500/15 p-2">
              <CalendarDays className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Shifts</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {totalShifts}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-slate-200 dark:bg-white/10" />

          {/* Total Hours */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-emerald-500/15 p-2">
              <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Hours</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {totalHours}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-slate-200 dark:bg-white/10" />

          {/* Staff Scheduled */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-violet-500/15 p-2">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Staff Scheduled</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {staffScheduled}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
