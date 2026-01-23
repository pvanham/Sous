"use client";

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getOrCreateScheduleForWeek } from "@/server/actions/schedule.actions";
import {
  listShiftsBySchedule,
  deleteShift,
} from "@/server/actions/shift.actions";
import { listStaff } from "@/server/actions/staff.actions";
import {
  getWeekDays,
  getNextWeekStart,
  getPrevWeekStart,
  formatDayLabel,
} from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";

import { ScheduleHeader } from "./ScheduleHeader";
import { ScheduleActions } from "./ScheduleActions";
import { WeekSummary } from "./WeekSummary";
import { StaffRow } from "./StaffRow";
import { ShiftCard } from "./ShiftCard";
import { GridCell } from "./GridCell";
import { ShiftFormDialog } from "./ShiftFormDialog";
import { ShiftDeleteConfirm } from "./ShiftDeleteConfirm";

// Query keys for TanStack Query
const scheduleKeys = {
  all: ["schedules"] as const,
  week: (weekStart: string) =>
    [...scheduleKeys.all, "week", weekStart] as const,
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

// Dialog state type
interface DialogState {
  mode: "create" | "edit";
  open: boolean;
  staffId?: string;
  date?: Date;
  shift?: ShiftDTO;
}

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
  const queryClient = useQueryClient();

  // State for current week
  const [currentWeek, setCurrentWeek] = useState<Date>(initialWeek);

  // State for shift form dialog
  const [dialogState, setDialogState] = useState<DialogState>({
    mode: "create",
    open: false,
  });

  // State for delete confirmation dialog
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    open: boolean;
    shift: ShiftDTO | null;
  }>({
    open: false,
    shift: null,
  });

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
  const { data: shiftsResponse, isLoading: isShiftsLoading } = useQuery({
    queryKey: shiftKeys.bySchedule(schedule?.id ?? ""),
    queryFn: () => listShiftsBySchedule({ scheduleId: schedule!.id }),
    enabled: !!schedule?.id, // Only run when we have a schedule ID
  });

  // Extract shifts data
  const shifts = shiftsResponse?.success ? shiftsResponse.data : [];

  // Query: Get all staff members
  const { data: staffResponse, isLoading: isStaffLoading } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => listStaff(),
  });

  // Extract active staff (filter to active only)
  const allStaff = staffResponse?.success ? staffResponse.data : [];
  const activeStaff = allStaff.filter((s) => s.isActive);

  // Get week days for column headers
  const weekDays = getWeekDays(currentWeek);

  // Delete mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return deleteShift({ shiftId });
    },
    onMutate: async (shiftId) => {
      if (!schedule?.id) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });

      // Snapshot previous value
      const previousShifts = queryClient.getQueryData(
        shiftKeys.bySchedule(schedule.id)
      );

      // Optimistically remove shift
      queryClient.setQueryData(
        shiftKeys.bySchedule(schedule.id),
        (old: { success: boolean; data: ShiftDTO[] } | undefined) => {
          if (!old?.success) return old;
          return {
            ...old,
            data: old.data.filter((s) => s.id !== shiftId),
          };
        }
      );

      return { previousShifts };
    },
    onError: (err, _shiftId, context) => {
      // Rollback on error
      if (context?.previousShifts && schedule?.id) {
        queryClient.setQueryData(
          shiftKeys.bySchedule(schedule.id),
          context.previousShifts
        );
      }
      toast.error("Failed to delete shift");
    },
    onSettled: () => {
      // Refetch to sync with server
      if (schedule?.id) {
        queryClient.invalidateQueries({
          queryKey: shiftKeys.bySchedule(schedule.id),
        });
      }
    },
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Shift deleted successfully");
        setDeleteConfirmState({ open: false, shift: null });
      } else {
        toast.error(response.error);
      }
    },
  });

  // Week navigation handlers
  const handlePrevWeek = () => {
    setCurrentWeek((prev) => getPrevWeekStart(prev));
  };

  const handleNextWeek = () => {
    setCurrentWeek((prev) => getNextWeekStart(prev));
  };

  // Dialog handlers
  const handleCreateShift = (staffId: string, date: Date) => {
    setDialogState({
      mode: "create",
      open: true,
      staffId,
      date,
    });
  };

  const handleEditShift = (shift: ShiftDTO) => {
    setDialogState({
      mode: "edit",
      open: true,
      shift,
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogState((prev) => ({ ...prev, open }));
  };

  const handleDeleteClick = () => {
    if (dialogState.shift) {
      // Close the edit dialog first
      setDialogState((prev) => ({ ...prev, open: false }));
      // Open delete confirmation
      setDeleteConfirmState({
        open: true,
        shift: dialogState.shift,
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmState.shift) {
      deleteMutation.mutate(deleteConfirmState.shift.id);
    }
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

  // Handler for refreshing schedule data after status change
  const handleStatusChange = () => {
    queryClient.invalidateQueries({
      queryKey: scheduleKeys.week(weekStartKey),
    });
    if (schedule?.id) {
      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });
    }
  };

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

      {/* Schedule Actions (Publish, Copy Week) and Week Summary */}
      {!isLoading && schedule && (
        <>
          <ScheduleActions
            schedule={schedule}
            shifts={shifts}
            weekStart={currentWeek}
            onStatusChange={handleStatusChange}
          />
          <WeekSummary shifts={shifts} />
        </>
      )}

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
                  <Fragment key={staff.id}>
                    <StaffRow staff={staff} />
                    {weekDays.map((day) => {
                      const shift = getShiftForStaffAndDay(
                        shifts,
                        staff.id,
                        day
                      );
                      return shift ? (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                          onClick={() => handleEditShift(shift)}
                        />
                      ) : (
                        <GridCell
                          key={`cell-${staff.id}-${day.toISOString()}`}
                          staffId={staff.id}
                          date={day}
                          onClick={() => handleCreateShift(staff.id, day)}
                        />
                      );
                    })}
                  </Fragment>
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

      {/* Shift Form Dialog */}
      {schedule?.id && (
        <ShiftFormDialog
          mode={dialogState.mode}
          open={dialogState.open}
          onOpenChange={handleDialogOpenChange}
          scheduleId={schedule.id}
          staffId={dialogState.staffId}
          date={dialogState.date}
          shift={dialogState.shift}
          onDeleteClick={dialogState.mode === "edit" ? handleDeleteClick : undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmState.shift && (
        <ShiftDeleteConfirm
          shift={deleteConfirmState.shift}
          open={deleteConfirmState.open}
          onOpenChange={(open) =>
            setDeleteConfirmState((prev) => ({ ...prev, open }))
          }
          onConfirm={handleDeleteConfirm}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
