"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePicker } from "@/components/ui/time-picker";

import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { createShift, updateShift } from "@/server/actions/shift.actions";
import {
  formatFullDayLabel,
  combineDateTime,
  extractTimeString,
} from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";
import type { KitchenConfigDTO } from "@/types/kitchen-config";
import type { StaffDTO } from "@/types/staff";

// Client-side form schema
const shiftFormSchema = z
  .object({
    staffId: z.string().min(1, "Staff member is required"),
    date: z.date(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
    station: z.string().min(1, "Station is required"),
    notes: z.string().max(500, "Notes cannot exceed 500 characters").optional(),
  })
  .refine(
    (data) => {
      // Parse times and compare
      const [startHour, startMin] = data.startTime.split(":").map(Number);
      const [endHour, endMin] = data.endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      return startMinutes < endMinutes;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

type ShiftFormValues = z.infer<typeof shiftFormSchema>;

// Query keys
const kitchenConfigKeys = {
  all: ["kitchenConfig"] as const,
};

const staffKeys = {
  all: ["staff"] as const,
  list: () => [...staffKeys.all, "list"] as const,
};

const shiftKeys = {
  all: ["shifts"] as const,
  bySchedule: (scheduleId: string) =>
    [...shiftKeys.all, "schedule", scheduleId] as const,
};

interface ShiftFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;

  // For create mode - pre-filled values
  staffId?: string;
  date?: Date;

  // For edit mode - existing shift data
  shift?: ShiftDTO;

  // Optional callback for delete action
  onDeleteClick?: () => void;
}

/**
 * Helper to get default start time from KitchenConfig for a specific day.
 */
function getDefaultStartTime(
  config: KitchenConfigDTO | null,
  date: Date
): string {
  if (!config) return "09:00";

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const dayName = dayNames[date.getDay()];
  const dayHours = config.operatingHours[dayName];

  if (dayHours?.isOpen && dayHours.open) {
    return dayHours.open;
  }

  return "09:00";
}

/**
 * Helper to calculate default end time (start + 8 hours).
 */
function getDefaultEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  let endHours = hours + 8;
  if (endHours >= 24) endHours = 23;
  return `${String(endHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function ShiftFormDialog({
  mode,
  open,
  onOpenChange,
  scheduleId,
  staffId,
  date,
  shift,
  onDeleteClick,
}: ShiftFormDialogProps) {
  const queryClient = useQueryClient();

  // Fetch kitchen config for stations dropdown and default times
  const { data: configResponse, isLoading: isConfigLoading } = useQuery({
    queryKey: kitchenConfigKeys.all,
    queryFn: () => getKitchenConfig(),
    enabled: open,
  });

  const config = configResponse?.success ? configResponse.data : null;

  // Fetch staff list to display staff name
  const { data: staffResponse, isLoading: isStaffLoading } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => listStaff(),
    enabled: open,
  });

  const allStaff = staffResponse?.success ? staffResponse.data : [];

  // Get the staff member for display
  const currentStaffId = mode === "edit" ? shift?.staffId : staffId;
  const currentStaffMember = useMemo(
    () => allStaff.find((s) => s.id === currentStaffId),
    [allStaff, currentStaffId]
  );

  // Get current date for display
  const currentDate = mode === "edit" && shift ? new Date(shift.start) : date;

  // Calculate default values
  const defaultValues = useMemo((): ShiftFormValues => {
    if (mode === "edit" && shift) {
      return {
        staffId: shift.staffId,
        date: new Date(shift.start),
        startTime: extractTimeString(new Date(shift.start)),
        endTime: extractTimeString(new Date(shift.end)),
        station: shift.station,
        notes: shift.notes || "",
      };
    }

    // Create mode defaults
    const defaultStart = getDefaultStartTime(config, date || new Date());
    const defaultEnd = getDefaultEndTime(defaultStart);

    return {
      staffId: staffId || "",
      date: date || new Date(),
      startTime: defaultStart,
      endTime: defaultEnd,
      station: config?.stations[0] || "",
      notes: "",
    };
  }, [mode, shift, staffId, date, config]);

  // Initialize form
  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues,
  });

  // Reset form when dialog opens or when dependencies change
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, form, defaultValues]);

  // Create mutation with optimistic updates
  const createMutation = useMutation({
    mutationFn: async (values: ShiftFormValues) => {
      const start = combineDateTime(values.date, values.startTime);
      const end = combineDateTime(values.date, values.endTime);

      return createShift({
        scheduleId,
        staffId: values.staffId,
        start,
        end,
        station: values.station,
        notes: values.notes || "",
      });
    },
    onMutate: async (newShift) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: shiftKeys.bySchedule(scheduleId),
      });

      // Snapshot previous value
      const previousShifts = queryClient.getQueryData(
        shiftKeys.bySchedule(scheduleId)
      );

      // Optimistically add new shift
      queryClient.setQueryData(
        shiftKeys.bySchedule(scheduleId),
        (old: { success: boolean; data: ShiftDTO[] } | undefined) => {
          if (!old?.success) return old;

          const start = combineDateTime(newShift.date, newShift.startTime);
          const end = combineDateTime(newShift.date, newShift.endTime);

          const tempShift: ShiftDTO = {
            id: `temp-${Date.now()}`,
            userId: "",
            scheduleId,
            staffId: newShift.staffId,
            start,
            end,
            station: newShift.station,
            notes: newShift.notes || "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          return {
            ...old,
            data: [...old.data, tempShift],
          };
        }
      );

      return { previousShifts };
    },
    onError: (err, _newShift, context) => {
      // Rollback on error
      if (context?.previousShifts) {
        queryClient.setQueryData(
          shiftKeys.bySchedule(scheduleId),
          context.previousShifts
        );
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(scheduleId),
      });
    },
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Shift created successfully");
        onOpenChange(false);
      } else {
        toast.error(response.error);
      }
    },
  });

  // Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async (values: ShiftFormValues) => {
      if (!shift) throw new Error("No shift to update");

      const start = combineDateTime(values.date, values.startTime);
      const end = combineDateTime(values.date, values.endTime);

      return updateShift(shift.id, {
        start,
        end,
        station: values.station,
        notes: values.notes || "",
      });
    },
    onMutate: async (updatedValues) => {
      if (!shift) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: shiftKeys.bySchedule(scheduleId),
      });

      // Snapshot previous value
      const previousShifts = queryClient.getQueryData(
        shiftKeys.bySchedule(scheduleId)
      );

      // Optimistically update shift
      queryClient.setQueryData(
        shiftKeys.bySchedule(scheduleId),
        (old: { success: boolean; data: ShiftDTO[] } | undefined) => {
          if (!old?.success) return old;

          const start = combineDateTime(
            updatedValues.date,
            updatedValues.startTime
          );
          const end = combineDateTime(updatedValues.date, updatedValues.endTime);

          return {
            ...old,
            data: old.data.map((s) =>
              s.id === shift.id
                ? {
                    ...s,
                    start,
                    end,
                    station: updatedValues.station,
                    notes: updatedValues.notes || "",
                    updatedAt: new Date(),
                  }
                : s
            ),
          };
        }
      );

      return { previousShifts };
    },
    onError: (err, _updatedValues, context) => {
      // Rollback on error
      if (context?.previousShifts) {
        queryClient.setQueryData(
          shiftKeys.bySchedule(scheduleId),
          context.previousShifts
        );
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(scheduleId),
      });
    },
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Shift updated successfully");
        onOpenChange(false);
      } else {
        toast.error(response.error);
      }
    },
  });

  // Form submit handler
  const onSubmit = (values: ShiftFormValues) => {
    if (mode === "create") {
      createMutation.mutate(values);
    } else {
      updateMutation.mutate(values);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isLoading = isConfigLoading || isStaffLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Shift" : "Edit Shift"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new shift to the schedule."
              : "Modify the existing shift details."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Staff Name (readonly display) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Staff Member</label>
                <Input
                  value={currentStaffMember?.name || "Unknown"}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Date (readonly display) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  value={currentDate ? formatFullDayLabel(currentDate) : ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Start Time */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <TimePicker {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End Time */}
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <TimePicker {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Station */}
              <FormField
                control={form.control}
                name="station"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Station</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a station" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {config?.stations.map((station) => (
                          <SelectItem key={station} value={station}>
                            {station}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Add any notes about this shift..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:gap-0">
                {mode === "edit" && onDeleteClick && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onDeleteClick}
                    disabled={isSubmitting}
                    className="mr-auto"
                  >
                    Delete
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {mode === "create" ? "Create Shift" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
