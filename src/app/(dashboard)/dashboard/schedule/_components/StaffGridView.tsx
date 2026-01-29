"use client";

import { Fragment } from "react";

import { formatDayLabel } from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";

import { StaffRow } from "./StaffRow";
import { ShiftCard } from "./ShiftCard";
import { GridCell } from "./GridCell";

interface StaffGridViewProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  weekDays: Date[];
  onCreateShift: (staffId: string, date: Date) => void;
  onEditShift: (shift: ShiftDTO) => void;
}

/**
 * Helper function to find a shift for a specific staff member on a specific day.
 */
function getShiftForStaffAndDay(
  shifts: ShiftDTO[],
  staffId: string,
  day: Date,
): ShiftDTO | undefined {
  return shifts.find((shift) => {
    if (shift.staffId !== staffId) return false;

    // Check if shift starts on this day
    const shiftDay = new Date(shift.start);
    return (
      shiftDay.getFullYear() === day.getFullYear() &&
      shiftDay.getMonth() === day.getMonth() &&
      shiftDay.getDate() === day.getDate()
    );
  });
}

/**
 * StaffGridView - Staff-based schedule grid.
 * Y-axis: Staff members
 * X-axis: Days of the week (Mon-Sun)
 *
 * This is the original/default view for the schedule.
 * Uses Warm Industrial styling with stone palette.
 */
export function StaffGridView({
  shifts,
  staff,
  weekDays,
  onCreateShift,
  onEditShift,
}: StaffGridViewProps) {
  // Filter to active staff only
  const activeStaff = staff.filter((s) => s.isActive);

  if (activeStaff.length === 0) {
    return (
      <div className="rounded border border-stone-300 dark:border-white/10 bg-muted/50 p-8 text-center">
        <p className="text-muted-foreground">No active staff members found.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add staff members to start creating schedules.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[150px_repeat(7,minmax(100px,1fr))] gap-1 min-w-[900px]">
        {/* Header Row - Column Labels - Industrial style */}
        <div className="font-sans font-semibold uppercase tracking-widest text-[10px] p-2 border-b border-stone-300 dark:border-white/10 text-stone-500 dark:text-stone-400">
          Staff
        </div>
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className="font-sans font-semibold uppercase tracking-widest text-[10px] text-center p-2 border-b border-stone-300 dark:border-white/10 text-stone-500 dark:text-stone-400"
          >
            {formatDayLabel(day)}
          </div>
        ))}

        {/* Staff Rows */}
        {activeStaff.map((staffMember) => (
          <Fragment key={staffMember.id}>
            <StaffRow staff={staffMember} />
            {weekDays.map((day) => {
              const shift = getShiftForStaffAndDay(shifts, staffMember.id, day);
              return shift ? (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  onClick={() => onEditShift(shift)}
                />
              ) : (
                <GridCell
                  key={`cell-${staffMember.id}-${day.toISOString()}`}
                  staffId={staffMember.id}
                  date={day}
                  onClick={() => onCreateShift(staffMember.id, day)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
