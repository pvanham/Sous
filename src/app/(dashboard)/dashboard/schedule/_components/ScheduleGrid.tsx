"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { getOrCreateScheduleForWeek } from "@/server/actions/schedule.actions";
import { listShiftsBySchedule } from "@/server/actions/shift.actions";
import { listStaff } from "@/server/actions/staff.actions";
import {
  getWeekDays,
  getNextWeekStart,
  getPrevWeekStart,
  formatDayLabel,
} from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";

import { ScheduleHeader } from "./ScheduleHeader";
import { StaffRow } from "./StaffRow";
import { ShiftCard } from "./ShiftCard";
import { GridCell } from "./GridCell";

// Query keys for TanStack Query
const scheduleKeys = {
  all: ["schedules"] as const,
  week: (weekStart: string) => [...scheduleKeys.all, "week", weekStart] as const,
};

const shiftKeys = {
  all: ["shifts"] as const,
  bySchedule: (scheduleId: string) =>
    [...shiftKeys.all, "schedule", scheduleId] as const,
};

const staffKeys = {
  all: ["staff"] as const,
  list: () => [...staffKeys.all, "list"] as const,
};

interface ScheduleGridProps {
  initialWeek: Date;
}

/**
 * Helper function to find a shift for a specific staff member on a specific day.
 */
function getShiftForStaffAndDay(
  shifts: ShiftDTO[],
  staffId: string,
  day: Date
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

export function ScheduleGrid({ initialWeek }: ScheduleGridProps) {
  // State for current week
  const [currentWeek, setCurrentWeek] = useState<Date>(initialWeek);

  // Convert week start to ISO string for query key
  const weekStartKey = currentWeek.toISOString();

  // Query: Get or create schedule for current week
  const {
    data: scheduleResponse,
    isLoading: isScheduleLoading,
    error: scheduleError,
  } = useQuery({
    queryKey: scheduleKeys.week(weekStartKey),
    queryFn: () => getOrCreateScheduleForWeek({ weekStartDate: currentWeek }),
  });

  // Extract schedule data
  const schedule = scheduleResponse?.success ? scheduleResponse.data : null;

  // Query: Get shifts for the schedule (only if we have a schedule)
  const {
    data: shiftsResponse,
    isLoading: isShiftsLoading,
  } = useQuery({
    queryKey: shiftKeys.bySchedule(schedule?.id ?? ""),
    queryFn: () => listShiftsBySchedule({ scheduleId: schedule!.id }),
    enabled: !!schedule?.id, // Only run when we have a schedule ID
  });

  // Extract shifts data
  const shifts = shiftsResponse?.success ? shiftsResponse.data : [];

  // Query: Get all staff members
  const {
    data: staffResponse,
    isLoading: isStaffLoading,
  } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => listStaff(),
  });

  // Extract active staff (filter to active only)
  const allStaff = staffResponse?.success ? staffResponse.data : [];
  const activeStaff = allStaff.filter((s) => s.isActive);

  // Get week days for column headers
  const weekDays = getWeekDays(currentWeek);

  // Week navigation handlers
  const handlePrevWeek = () => {
    setCurrentWeek((prev) => getPrevWeekStart(prev));
  };

  const handleNextWeek = () => {
    setCurrentWeek((prev) => getNextWeekStart(prev));
  };

  // Loading state
  const isLoading = isScheduleLoading || isStaffLoading;

  // Error state
  if (scheduleError) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
        <p>Failed to load schedule. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Schedule Header with navigation */}
      <ScheduleHeader
        weekStart={currentWeek}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        scheduleStatus={schedule?.status ?? "DRAFT"}
        isLoading={isLoading}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Grid */}
      {!isLoading && (
        <>
          {/* Empty state - no staff */}
          {activeStaff.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/50 p-8 text-center">
              <p className="text-muted-foreground">
                No active staff members found.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Add staff members to start creating schedules.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[150px_repeat(7,minmax(100px,1fr))] gap-1 min-w-[900px]">
                {/* Header Row - Column Labels */}
                <div className="font-semibold text-sm p-2 border-b border-border">
                  Staff
                </div>
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="font-semibold text-sm text-center p-2 border-b border-border"
                  >
                    {formatDayLabel(day)}
                  </div>
                ))}

                {/* Staff Rows */}
                {activeStaff.map((staff) => (
                  <>
                    <StaffRow key={`staff-${staff.id}`} staff={staff} />
                    {weekDays.map((day) => {
                      const shift = getShiftForStaffAndDay(shifts, staff.id, day);
                      return shift ? (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                        />
                      ) : (
                        <GridCell
                          key={`cell-${staff.id}-${day.toISOString()}`}
                          staffId={staff.id}
                          date={day}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          )}

          {/* Loading shifts indicator */}
          {isShiftsLoading && shifts.length === 0 && (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading shifts...
            </div>
          )}
        </>
      )}
    </div>
  );
}
