"use client";

import { Clock, Users, CalendarDays, DollarSign } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";

interface WeekSummaryProps {
  shifts: ShiftDTO[];
  staff?: StaffDTO[];
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
 * Calculates the total labor cost based on shifts and staff hourly rates.
 */
function calculateLaborCost(shifts: ShiftDTO[], staff: StaffDTO[] = []): number {
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const totalCost = shifts.reduce((acc, shift) => {
    const start = new Date(shift.start).getTime();
    const end = new Date(shift.end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    const hourlyRate = staffMap.get(shift.staffId)?.hourlyRate || 0;
    return acc + (hours * hourlyRate);
  }, 0);

  return totalCost;
}

/**
 * WeekSummary - Displays aggregate statistics for the current week's schedule.
 * Shows total shifts, total hours, number of staff members scheduled, and total labor cost.
 * Uses Warm Industrial styling with monospace numbers.
 */
export function WeekSummary({ shifts, staff }: WeekSummaryProps) {
  const totalShifts = shifts.length;
  const totalHours = calculateTotalHours(shifts);
  const staffScheduled = countUniqueStaff(shifts);
  const laborCost = calculateLaborCost(shifts, staff);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-around gap-6">
          {/* Total Shifts */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-amber-700/15 p-2">
              <CalendarDays className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Total Shifts
              </p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                {totalShifts}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-stone-300 dark:bg-white/10" />

          {/* Total Hours */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-emerald-700/15 p-2">
              <Clock className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Total Hours
              </p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                {totalHours}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-stone-300 dark:bg-white/10" />

          {/* Staff Scheduled */}
          <div className="flex items-center gap-3">
            <div className="rounded bg-stone-600/15 p-2">
              <Users className="h-5 w-5 text-stone-600 dark:text-stone-400" />
            </div>
            <div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Staff Scheduled
              </p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                {staffScheduled}
              </p>
            </div>
          </div>

          {/* Divider */}
          {staff !== undefined && (
            <div className="h-12 w-px bg-stone-300 dark:bg-white/10" />
          )}

          {/* Labor Cost */}
          {staff !== undefined && (
            <div className="flex items-center gap-3">
              <div className="rounded bg-blue-700/15 p-2">
                <DollarSign className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Total Cost
                </p>
                <p className="text-2xl font-mono font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(laborCost)}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
