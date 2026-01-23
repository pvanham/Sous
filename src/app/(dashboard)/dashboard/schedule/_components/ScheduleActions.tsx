"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Copy, ChevronDown, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  updateScheduleStatus,
  copyWeekShifts,
  publishSchedule,
} from "@/server/actions/schedule.actions";
import { getPrevWeekStart } from "@/lib/utils/date";
import type { ScheduleDTO } from "@/types/schedule";
import type { ShiftDTO } from "@/types/shift";

import { ScheduleStatusBadge } from "./ScheduleStatusBadge";

// Query keys for TanStack Query - must match ScheduleGrid
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

interface ScheduleActionsProps {
  schedule: ScheduleDTO;
  shifts: ShiftDTO[];
  weekStart: Date;
  onStatusChange: () => void;
}

/**
 * ScheduleActions - Action buttons for schedule management.
 * Includes Publish/Unpublish and Copy Week functionality.
 */
export function ScheduleActions({
  schedule,
  shifts,
  weekStart,
  onStatusChange,
}: ScheduleActionsProps) {
  const queryClient = useQueryClient();
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      const result = await publishSchedule(schedule.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Schedule published successfully");
      queryClient.invalidateQueries({
        queryKey: scheduleKeys.week(weekStart.toISOString()),
      });
      onStatusChange();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Unpublish mutation (revert to DRAFT)
  const unpublishMutation = useMutation({
    mutationFn: async () => {
      const result = await updateScheduleStatus({
        scheduleId: schedule.id,
        status: "DRAFT",
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Schedule reverted to draft");
      queryClient.invalidateQueries({
        queryKey: scheduleKeys.week(weekStart.toISOString()),
      });
      onStatusChange();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Copy from previous week mutation
  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      const prevWeekStart = getPrevWeekStart(weekStart);
      const result = await copyWeekShifts({
        sourceScheduleId: schedule.id,
        targetWeekStart: weekStart,
      });

      // This copies FROM the previous week TO the current week
      // We need to get the previous week's schedule first
      // Let's adjust the logic: we want to copy from prev week to current week
      return result;
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { shiftsCreated, shiftsSkipped } = result.data;
      if (shiftsCreated === 0 && shiftsSkipped === 0) {
        toast.info("No shifts found in previous week to copy");
      } else if (shiftsSkipped > 0) {
        toast.success(
          `Copied ${shiftsCreated} shifts (${shiftsSkipped} skipped due to conflicts)`
        );
      } else {
        toast.success(`Copied ${shiftsCreated} shifts`);
      }

      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Copy from previous week - need to get the previous week's schedule first
  const handleCopyFromPreviousWeek = async () => {
    setCopyMenuOpen(false);

    // Get the previous week's schedule ID by making a request
    const prevWeekStart = getPrevWeekStart(weekStart);

    // We need to call copyWeekShifts with the PREVIOUS week's schedule as source
    // and CURRENT week as target
    try {
      // First, we need the previous week's schedule
      const { getOrCreateScheduleForWeek } = await import(
        "@/server/actions/schedule.actions"
      );
      const prevScheduleResult = await getOrCreateScheduleForWeek({
        weekStartDate: prevWeekStart,
      });

      if (!prevScheduleResult.success) {
        toast.error("Could not find previous week's schedule");
        return;
      }

      const result = await copyWeekShifts({
        sourceScheduleId: prevScheduleResult.data.id,
        targetWeekStart: weekStart,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { shiftsCreated, shiftsSkipped } = result.data;
      if (shiftsCreated === 0 && shiftsSkipped === 0) {
        toast.info("No shifts found in previous week to copy");
      } else if (shiftsSkipped > 0) {
        toast.success(
          `Copied ${shiftsCreated} shifts (${shiftsSkipped} skipped due to conflicts)`
        );
      } else {
        toast.success(`Copied ${shiftsCreated} shifts`);
      }

      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });
    } catch {
      toast.error("Failed to copy from previous week");
    }
  };

  const isPublishing =
    publishMutation.isPending || unpublishMutation.isPending;
  const isCopying = copyWeekMutation.isPending;

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <ScheduleStatusBadge status={schedule.status} />

        {/* Publish/Unpublish Button */}
        {schedule.status === "DRAFT" ? (
          <Button
            size="sm"
            onClick={() => publishMutation.mutate()}
            disabled={isPublishing || shifts.length === 0}
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Publish Schedule
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => unpublishMutation.mutate()}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="mr-2 h-4 w-4" />
            )}
            Unpublish
          </Button>
        )}
      </div>

      {/* Copy Week Dropdown */}
      <DropdownMenu open={copyMenuOpen} onOpenChange={setCopyMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isCopying}>
            {isCopying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Copy Week
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCopyFromPreviousWeek}>
            Copy from Previous Week
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
