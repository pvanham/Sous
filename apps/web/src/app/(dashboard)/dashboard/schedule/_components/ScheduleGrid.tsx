"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getOrCreateScheduleForWeek,
  getScheduleByWeek,
} from "@/server/actions/schedule.actions";
import {
  listShiftsForLocationWeek,
  deleteShift,
} from "@/server/actions/shift.actions";
import { listTimeOffForLocationWeek } from "@/server/actions/time-off-request.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import {
  getWeekDays,
  getNextWeekStart,
  getPrevWeekStart,
} from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";
import type { ScheduleDTO } from "@/types/schedule";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import type { DayOfWeek } from "@sous/types";

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
import { ScheduleListView } from "./ScheduleListView";

// Query keys for TanStack Query
const scheduleKeys = {
  all: ["schedules"] as const,
  week: (weekStart: string) =>
    [...scheduleKeys.all, "week", weekStart] as const,
};

const shiftKeys = {
  all: ["shifts"] as const,
  // Legacy key — retained on the shiftKeys object so other consumers
  // (mutations, AI tools) can still invalidate by scheduleId. The grid
  // itself reads `byWeek` now.
  bySchedule: (scheduleId: string) =>
    [...shiftKeys.all, "schedule", scheduleId] as const,
  byWeek: (weekStartIso: string) =>
    [...shiftKeys.all, "week", weekStartIso] as const,
};

const timeOffKeys = {
  all: ["timeOff"] as const,
  byWeek: (weekStartIso: string) =>
    [...timeOffKeys.all, "week", weekStartIso] as const,
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
  /**
   * Explicit scheduleId pulled from `ensureScheduleForCurrentWeek`
   * during the create flow. This is the freshly-resolved id, used
   * during the brief window between "schedule created" and "schedule
   * query refetched". If unset, we fall back to the live `schedule.id`
   * from the read query (the steady state once the cache catches up).
   */
  pendingScheduleId?: string;
}

interface ScheduleGridProps {
  initialWeek: Date;
  /**
   * Server-resolved location week-start anchor used for the very first
   * render before the kitchen-config query loads. After mount, the
   * cached `config.weekStartsOn` from TanStack Query takes over.
   */
  initialWeekStartsOn: DayOfWeek;
}

export function ScheduleGrid({ initialWeek, initialWeekStartsOn }: ScheduleGridProps) {
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

  // Query: Get kitchen config for time views and weekStartsOn anchor
  const { data: config = null } = useQuery({
    queryKey: kitchenConfigKeys.all,
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Active week-start anchor: prefer the freshly-fetched kitchen config,
  // but fall back to the server-resolved value passed in props until the
  // query lands so initial paint never uses a stale Monday.
  const weekStartsOn: DayOfWeek = config?.weekStartsOn ?? initialWeekStartsOn;

  // Get week days for column headers
  const weekDays = getWeekDays(currentWeek, weekStartsOn);

  // Query: Read-only lookup of the Schedule doc for this week. Returns
  // `null` when no doc exists yet — visiting an empty week no longer
  // side-effect-creates a draft. The `ensureScheduleForCurrentWeek`
  // helper below promotes this to a write when the user actually starts
  // a mutation (add shift, copy, etc.).
  const {
    data: schedule = null,
    isLoading: isScheduleLoading,
    error: scheduleError,
  } = useQuery<ScheduleDTO | null>({
    queryKey: scheduleKeys.week(weekStartKey),
    queryFn: async () => {
      const result = await getScheduleByWeek({ weekStartDate: currentWeek });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Query: Every shift whose `start` falls in this week, regardless of
  // which Schedule doc owns it. Sourcing by date range is the only way
  // to keep legacy Mon-anchored shifts visible after a Wed-anchored
  // `weekStartsOn` flip.
  const { data: shifts = [], isLoading: isShiftsLoading } = useQuery({
    queryKey: shiftKeys.byWeek(weekStartKey),
    queryFn: async () => {
      const result = await listShiftsForLocationWeek({
        weekStartDate: currentWeek,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Query: Approved + pending time-off for the displayed window. Drives
  // the `TimeOffPill` overlay in each view sub-component so a manager
  // can spot conflicts before assigning a shift. We always include
  // `pending` so a freshly-submitted request previews the conflict
  // even before a manager has reviewed it.
  const { data: timeOff = [] } = useQuery<TimeOffRequestDTO[]>({
    queryKey: timeOffKeys.byWeek(weekStartKey),
    queryFn: async () => {
      const result = await listTimeOffForLocationWeek({
        weekStartDate: currentWeek,
        statuses: ["approved", "pending"],
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  /**
   * Promote the read-only schedule lookup to a write-intent: ensure a
   * Schedule doc exists for the current week so subsequent mutations
   * (add shift, copy, publish) have something to attach to. Returns the
   * resolved Schedule id or `null` if creation failed (the caller should
   * surface a toast and abort).
   *
   * Read paths never call this — only paths that are about to mutate.
   * After resolution we invalidate the schedule meta query so the grid
   * picks up the freshly-created doc and the status badge flips from
   * "No schedule yet" to "Draft".
   */
  const ensureScheduleForCurrentWeek = async (): Promise<string | null> => {
    if (schedule?.id) return schedule.id;
    const result = await getOrCreateScheduleForWeek({
      weekStartDate: currentWeek,
    });
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    await queryClient.invalidateQueries({
      queryKey: scheduleKeys.week(weekStartKey),
    });
    return result.data.id;
  };

  // Query: Get all staff members
  const { data: allStaff = [], isLoading: isStaffLoading } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: async () => {
      const result = await listStaff();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Delete mutation with optimistic updates against the date-range
  // shift cache. We key by `weekStartKey` so the optimistic patch
  // matches the grid's actual data source — the shift being deleted
  // may belong to a legacy Schedule doc that the grid no longer
  // references directly.
  const deleteMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return deleteShift({ shiftId });
    },
    onMutate: async (shiftId) => {
      await queryClient.cancelQueries({
        queryKey: shiftKeys.byWeek(weekStartKey),
      });

      const previousShifts = queryClient.getQueryData(
        shiftKeys.byWeek(weekStartKey),
      );

      queryClient.setQueryData(
        shiftKeys.byWeek(weekStartKey),
        (old: ShiftDTO[] | undefined) => {
          if (!old) return old;
          return old.filter((s) => s.id !== shiftId);
        },
      );

      return { previousShifts };
    },
    onError: (_err, _shiftId, context) => {
      if (context?.previousShifts) {
        queryClient.setQueryData(
          shiftKeys.byWeek(weekStartKey),
          context.previousShifts,
        );
      }
      toast.error("Failed to delete shift");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: shiftKeys.byWeek(weekStartKey),
      });
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
    setCurrentWeek((prev) => getPrevWeekStart(prev, weekStartsOn));
    // Update selected day to first day of new week
    setSelectedDay(getPrevWeekStart(currentWeek, weekStartsOn));
  };

  const handleNextWeek = () => {
    setCurrentWeek((prev) => getNextWeekStart(prev, weekStartsOn));
    // Update selected day to first day of new week
    setSelectedDay(getNextWeekStart(currentWeek, weekStartsOn));
  };

  // View change handler
  const handleViewChange = (view: ScheduleViewType) => {
    setCurrentView(view);
    // Reset selected day to first day of week when switching to day view or list view
    if (view === "day" || view === "list") {
      setSelectedDay(weekDays[0]);
    }
  };

  // Day change handler (for Day View)
  const handleDayChange = (day: Date) => {
    setSelectedDay(day);
  };

  // All "create shift" entry points are write-intent: ensure a Schedule
  // doc exists for the current week before opening the dialog so the
  // user never sees a phantom error from a missing scheduleId.
  const openCreateDialog = async (state: Omit<DialogState, "open" | "mode">) => {
    const scheduleId = await ensureScheduleForCurrentWeek();
    if (!scheduleId) return;
    setDialogState({
      mode: "create",
      open: true,
      ...state,
      pendingScheduleId: scheduleId,
    });
  };

  // Dialog handlers for Staff View
  const handleCreateShiftFromStaff = (staffId: string, date: Date) => {
    void openCreateDialog({
      staffId,
      date,
      allowStaffSelection: false,
    });
  };

  // Dialog handlers for Time View
  const handleCreateShiftFromTime = (date: Date, startTime: string) => {
    void openCreateDialog({
      date,
      startTime,
      allowStaffSelection: true,
    });
  };

  // Dialog handlers for List View
  const handleDeleteShiftFromList = (shift: ShiftDTO) => {
    setDeleteConfirmState({
      open: true,
      shift,
    });
  };

  // Dialog handlers for Day/Station View
  const handleCreateShiftFromStation = (
    date: Date,
    startTime: string,
    station: string
  ) => {
    void openCreateDialog({
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
    queryClient.invalidateQueries({
      queryKey: shiftKeys.byWeek(weekStartKey),
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

  // Render the appropriate view based on currentView.
  //
  // Note: each view renders independent of `schedule` — the date-range
  // shifts query feeds them directly, so legacy shifts from a pre-flip
  // Schedule doc remain visible even when no new Wed-anchored doc has
  // been created yet for this week.
  const renderView = () => {
    switch (currentView) {
      case "staff":
        return (
          <StaffGridView
            shifts={shifts}
            staff={allStaff}
            weekDays={weekDays}
            timeOff={timeOff}
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
            timeOff={timeOff}
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
            timeOff={timeOff}
            onCreateShift={handleCreateShiftFromStation}
            onEditShift={handleEditShift}
          />
        );
      case "list":
        return (
          <ScheduleListView
            // List view's "Add shift" inline button targets a specific
            // schedule; when no schedule exists yet we pass an empty
            // string and the list-view dialog falls back to its
            // "create on first save" path inside the form.
            scheduleId={schedule?.id ?? ""}
            shifts={shifts}
            staff={allStaff}
            selectedDay={selectedDay}
            onDeleteShift={handleDeleteShiftFromList}
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

      {/* Action Bar — only meaningful once a Schedule doc exists for
          this week. When `schedule` is null we still let the user see
          shifts (legacy shifts from another Schedule doc may already
          render) and create new ones; the action bar comes back as soon
          as the first save through `ensureScheduleForCurrentWeek`
          materializes a Schedule. */}
      {!isLoading && schedule && (
        <div className="overflow-x-auto">
          <ScheduleActions
            schedule={schedule}
            shifts={shifts}
            weekStart={currentWeek}
            weekStartsOn={weekStartsOn}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      {/* Empty-state hint when no Schedule doc exists yet for this week. */}
      {!isLoading && !schedule && (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <span>
            No schedule for this week yet.{" "}
            {shifts.length > 0
              ? "Shown shifts belong to a previous schedule. Add a shift to start a new one."
              : "Add a shift to create one."}
          </span>
        </div>
      )}

      {/* Summary Card */}
      {!isLoading && (
        <WeekSummary shifts={shifts} staff={allStaff} />
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

      {/* Day Selector — only shown in Day/List View, sits above the grid */}
      {!isLoading && (currentView === "day" || currentView === "list") && (
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

      {/* Shift Form Dialog. The active schedule id is whichever
          becomes available first: the synchronously-resolved
          `pendingScheduleId` written by `openCreateDialog` after a
          successful `ensureScheduleForCurrentWeek`, or the live
          `schedule.id` once the read query refetches. Falling back to
          the live id keeps edits-of-existing-shifts working without
          needing to remember which schedule the dialog was opened for. */}
      {(dialogState.pendingScheduleId || schedule?.id) && (
        <ShiftFormDialog
          mode={dialogState.mode}
          open={dialogState.open}
          onOpenChange={handleDialogOpenChange}
          scheduleId={dialogState.pendingScheduleId ?? schedule!.id}
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
