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
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Shifts</p>
              <p className="text-2xl font-semibold">{totalShifts}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-border" />

          {/* Total Hours */}
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Hours</p>
              <p className="text-2xl font-semibold">{totalHours}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-border" />

          {/* Staff Scheduled */}
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Staff Scheduled</p>
              <p className="text-2xl font-semibold">{staffScheduled}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
