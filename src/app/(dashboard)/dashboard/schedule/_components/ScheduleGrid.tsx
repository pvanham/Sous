"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getOrCreateScheduleForWeek } from "@/server/actions/schedule.actions";
import {
  listShiftsBySchedule,
  deleteShift,
} from "@/server/actions/shift.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import {
  getWeekDays,
  getNextWeekStart,
  getPrevWeekStart,
} from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";

import { ScheduleHeader } from "./ScheduleHeader";
import { ScheduleActions } from "./ScheduleActions";
import { WeekSummary } from "./WeekSummary";
import { StationLegend } from "./StationLegend";
import { ViewSwitcher, type ScheduleViewType } from "./ViewSwitcher";
import { Button } from "@/components/ui/button";
import { formatDayLabel } from "@/lib/utils/date";
import { StaffGridView } from "./StaffGridView";
import { TimeGridView } from "./TimeGridView";
import { DayStationView } from "./DayStationView";
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

const kitchenConfigKeys = {
  all: ["kitchenConfig"] as const,
};

// Dialog state type - extended for new views
interface DialogState {
  mode: "create" | "edit";
  open: boolean;
  staffId?: string;
  date?: Date;
  startTime?: string;
  station?: string;
  shift?: ShiftDTO;
  allowStaffSelection?: boolean;
}

interface ScheduleGridProps {
  initialWeek: Date;
}

export function ScheduleGrid({ initialWeek }: ScheduleGridProps) {
  const queryClient = useQueryClient();

  // State for current week
  const [currentWeek, setCurrentWeek] = useState<Date>(initialWeek);

  // State for current view
  const [currentView, setCurrentView] = useState<ScheduleViewType>("staff");

  // State for selected day (for Day View)
  const [selectedDay, setSelectedDay] = useState<Date>(initialWeek);

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

  // Get week days for column headers
  const weekDays = getWeekDays(currentWeek);

  // Query: Get or create schedule for current week
  const {
    data: schedule,
    isLoading: isScheduleLoading,
    error: scheduleError,
  } = useQuery({
    queryKey: scheduleKeys.week(weekStartKey),
    queryFn: async () => {
      const result = await getOrCreateScheduleForWeek({ weekStartDate: currentWeek });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Query: Get shifts for the schedule (only if we have a schedule)
  const { data: shifts = [], isLoading: isShiftsLoading } = useQuery({
    queryKey: shiftKeys.bySchedule(schedule?.id ?? ""),
    queryFn: async () => {
      const result = await listShiftsBySchedule({ scheduleId: schedule!.id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!schedule?.id,
  });

  // Query: Get all staff members
  const { data: allStaff = [], isLoading: isStaffLoading } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: async () => {
      const result = await listStaff();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Query: Get kitchen config for time views
  const { data: config = null } = useQuery({
    queryKey: kitchenConfigKeys.all,
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Delete mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return deleteShift({ shiftId });
    },
    onMutate: async (shiftId) => {
      if (!schedule?.id) return;

      await queryClient.cancelQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });

      const previousShifts = queryClient.getQueryData(
        shiftKeys.bySchedule(schedule.id)
      );

      queryClient.setQueryData(
        shiftKeys.bySchedule(schedule.id),
        (old: ShiftDTO[] | undefined) => {
          if (!old) return old;
          return old.filter((s) => s.id !== shiftId);
        }
      );

      return { previousShifts };
    },
    onError: (_err, _shiftId, context) => {
      if (context?.previousShifts && schedule?.id) {
        queryClient.setQueryData(
          shiftKeys.bySchedule(schedule.id),
          context.previousShifts
        );
      }
      toast.error("Failed to delete shift");
    },
    onSettled: () => {
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
    // Update selected day to first day of new week
    setSelectedDay(getPrevWeekStart(currentWeek));
  };

  const handleNextWeek = () => {
    setCurrentWeek((prev) => getNextWeekStart(prev));
    // Update selected day to first day of new week
    setSelectedDay(getNextWeekStart(currentWeek));
  };

  // View change handler
  const handleViewChange = (view: ScheduleViewType) => {
    setCurrentView(view);
    // Reset selected day to first day of week when switching to day view
    if (view === "day") {
      setSelectedDay(weekDays[0]);
    }
  };

  // Day change handler (for Day View)
  const handleDayChange = (day: Date) => {
    setSelectedDay(day);
  };

  // Dialog handlers for Staff View
  const handleCreateShiftFromStaff = (staffId: string, date: Date) => {
    setDialogState({
      mode: "create",
      open: true,
      staffId,
      date,
      allowStaffSelection: false,
    });
  };

  // Dialog handlers for Time View
  const handleCreateShiftFromTime = (date: Date, startTime: string) => {
    setDialogState({
      mode: "create",
      open: true,
      date,
      startTime,
      allowStaffSelection: true,
    });
  };

  // Dialog handlers for Day/Station View
  const handleCreateShiftFromStation = (
    date: Date,
    startTime: string,
    station: string
  ) => {
    setDialogState({
      mode: "create",
      open: true,
      date,
      startTime,
      station,
      allowStaffSelection: true,
    });
  };

  const handleEditShift = (shift: ShiftDTO) => {
    setDialogState({
      mode: "edit",
      open: true,
      shift,
      allowStaffSelection: false,
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogState((prev) => ({ ...prev, open }));
  };

  const handleDeleteClick = () => {
    if (dialogState.shift) {
      setDialogState((prev) => ({ ...prev, open: false }));
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

  // Loading state
  const isLoading = isScheduleLoading || isStaffLoading;

  // Error state
  if (scheduleError) {
    return (
      <div className="space-y-4">
        {/* Still render the header so the user can navigate weeks */}
        <ScheduleHeader
          weekStart={currentWeek}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          isLoading={false}
        />
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          <p className="font-medium">Failed to load schedule</p>
          <p className="mt-1 text-sm">
            {scheduleError instanceof Error
              ? scheduleError.message
              : "An unexpected error occurred. Please try again."}
          </p>
        </div>
      </div>
    );
  }

  // Render the appropriate view based on currentView
  const renderView = () => {
    switch (currentView) {
      case "staff":
        return (
          <StaffGridView
            shifts={shifts}
            staff={allStaff}
            weekDays={weekDays}
            onCreateShift={handleCreateShiftFromStaff}
            onEditShift={handleEditShift}
          />
        );
      case "time":
        return (
          <TimeGridView
            shifts={shifts}
            staff={allStaff}
            weekDays={weekDays}
            config={config}
            onCreateShift={handleCreateShiftFromTime}
            onEditShift={handleEditShift}
          />
        );
      case "day":
        return (
          <DayStationView
            shifts={shifts}
            staff={allStaff}
            selectedDay={selectedDay}
            config={config}
            onCreateShift={handleCreateShiftFromStation}
            onEditShift={handleEditShift}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header Card with embedded week navigator */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          {/* Title */}
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Team Schedule
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage and optimize weekly shift schedules for your team
              </p>
            </div>
          </div>
          {/* Week navigator — lives in the header */}
          <ScheduleHeader
            weekStart={currentWeek}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Action Bar */}
      {!isLoading && schedule && (
        <div className="overflow-x-auto">
          <ScheduleActions
            schedule={schedule}
            shifts={shifts}
            weekStart={currentWeek}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      {/* Summary Card */}
      {!isLoading && schedule && (
        <WeekSummary shifts={shifts} />
      )}

      {/* View Switcher & Legend */}
      {!isLoading && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-background/50 px-3 py-2 shadow-sm">
          <div className="flex items-center overflow-x-auto">
            {config?.stations && config.stations.length > 0 && (
              <StationLegend stations={config.stations} />
            )}
          </div>
          <div className="shrink-0">
            <ViewSwitcher
              currentView={currentView}
              onViewChange={handleViewChange}
            />
          </div>
        </div>
      )}

      {/* Day Selector — only shown in Day View, sits above the grid */}
      {!isLoading && currentView === "day" && (
        <div className="flex items-center gap-3 overflow-x-auto px-1 py-1">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Day:</span>
          <div className="flex gap-1 overflow-x-auto">
            {weekDays.map((day) => {
              const isSelected =
                selectedDay &&
                day.toDateString() === selectedDay.toDateString();
              return (
                <Button
                  key={day.toISOString()}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDayChange(day)}
                  className="min-w-[64px] shrink-0 whitespace-nowrap font-mono"
                >
                  {formatDayLabel(day)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Grid Views */}
      {!isLoading && renderView()}

      {/* Loading shifts indicator */}
      {isShiftsLoading && shifts.length === 0 && (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading shifts...
        </div>
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
          startTime={dialogState.startTime}
          station={dialogState.station}
          shift={dialogState.shift}
          onDeleteClick={
            dialogState.mode === "edit" ? handleDeleteClick : undefined
          }
          allowStaffSelection={dialogState.allowStaffSelection}
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
