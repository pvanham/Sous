"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { getStationDotColor } from "@/lib/utils/station-colors";

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

import { StaffSearchCombobox } from "./StaffSearchCombobox";

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
    },
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

/**
 * Refresh every shift cache namespace after a create/update succeeds.
 * The schedule grid now reads from `byWeek(weekStart)` while other
 * consumers (AI tools, time-off flows) still subscribe to
 * `bySchedule(scheduleId)`. A predicate-based invalidation on the
 * shared root key keeps both in sync without having to thread the
 * week-start into the form's prop surface.
 */
function invalidateAllShiftQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ["shifts"] });
}

export interface ShiftFormProps {
  mode: "create" | "edit";
  scheduleId: string;
  staffId?: string;
  date?: Date;
  startTime?: string;
  station?: string;
  shift?: ShiftDTO;
  onDeleteClick?: () => void;
  allowStaffSelection?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Helper to get default start time from KitchenConfig for a specific day.
 */
function getDefaultStartTime(
  config: KitchenConfigDTO | null,
  date: Date,
): string {
  if (!config?.operatingHours) return "09:00";

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

export function ShiftForm({
  mode,
  scheduleId,
  staffId,
  date,
  startTime: prefilledStartTime,
  station: prefilledStation,
  shift,
  onDeleteClick,
  allowStaffSelection = false,
  onSuccess,
  onCancel,
}: ShiftFormProps) {
  const queryClient = useQueryClient();

  // Fetch kitchen config for stations dropdown and default times
  const { data: config = null, isLoading: isConfigLoading } = useQuery({
    queryKey: kitchenConfigKeys.all,
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Fetch staff list to display staff name
  const { data: allStaff = [], isLoading: isStaffLoading } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: async () => {
      const result = await listStaff();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Ensure allStaff is always an array
  const staffList = useMemo(() => Array.isArray(allStaff) ? allStaff : [], [allStaff]);

  // Get the staff member for display
  const currentStaffId = mode === "edit" ? shift?.staffId : staffId;
  const currentStaffMember = useMemo(
    () => staffList.find((s) => s.id === currentStaffId),
    [staffList, currentStaffId],
  );

  // Get current date for display
  const currentDate = mode === "edit" && shift ? new Date(shift.start) : date;

  // Filter to active staff only
  const activeStaff = staffList.filter((s) => s.isActive);

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
    const defaultStart =
      prefilledStartTime || getDefaultStartTime(config, date || new Date());
    const defaultEnd = getDefaultEndTime(defaultStart);
    const defaultStation = prefilledStation || config?.stations?.[0] || "";

    return {
      staffId: staffId || "",
      date: date || new Date(),
      startTime: defaultStart,
      endTime: defaultEnd,
      station: defaultStation,
      notes: "",
    };
  }, [mode, shift, staffId, date, config, prefilledStartTime, prefilledStation]);

  // Initialize form
  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues,
  });

  // Reset form when dependencies change
  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues]);

  // Create mutation
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
      await queryClient.cancelQueries({ queryKey: shiftKeys.bySchedule(scheduleId) });
      const previousShifts = queryClient.getQueryData(shiftKeys.bySchedule(scheduleId));

      queryClient.setQueryData(
        shiftKeys.bySchedule(scheduleId),
        (old: ShiftDTO[] | undefined) => {
          if (!old) return old;
          const start = combineDateTime(newShift.date, newShift.startTime);
          const end = combineDateTime(newShift.date, newShift.endTime);

          const tempShift: ShiftDTO = {
            id: `temp-${Date.now()}`,
            orgId: "",
            locationId: "",
            scheduleId,
            staffId: newShift.staffId,
            start,
            end,
            station: newShift.station,
            notes: newShift.notes || "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          return [...old, tempShift];
        },
      );

      return { previousShifts };
    },
    onError: (err, _newShift, context) => {
      if (context?.previousShifts) {
        queryClient.setQueryData(shiftKeys.bySchedule(scheduleId), context.previousShifts);
      }
    },
    onSettled: () => {
      invalidateAllShiftQueries(queryClient);
    },
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Shift created successfully");
        // The grid keys its lookup off the read-only schedule query;
        // a brand-new schedule (created via `ensureScheduleForCurrentWeek`
        // when the user clicked Add Shift on an empty week) needs its
        // meta refetched so the status badge flips from null to "Draft".
        queryClient.invalidateQueries({ queryKey: ["schedules"] });
        onSuccess();
      } else {
        toast.error(response.error);
      }
    },
  });

  // Update mutation
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
      await queryClient.cancelQueries({ queryKey: shiftKeys.bySchedule(scheduleId) });
      const previousShifts = queryClient.getQueryData(shiftKeys.bySchedule(scheduleId));

      queryClient.setQueryData(
        shiftKeys.bySchedule(scheduleId),
        (old: ShiftDTO[] | undefined) => {
          if (!old) return old;
          const start = combineDateTime(updatedValues.date, updatedValues.startTime);
          const end = combineDateTime(updatedValues.date, updatedValues.endTime);

          return old.map((s) =>
            s.id === shift.id
              ? {
                  ...s,
                  start,
                  end,
                  station: updatedValues.station,
                  notes: updatedValues.notes || "",
                  updatedAt: new Date(),
                }
              : s,
          );
        },
      );

      return { previousShifts };
    },
    onError: (err, _updatedValues, context) => {
      if (context?.previousShifts) {
        queryClient.setQueryData(shiftKeys.bySchedule(scheduleId), context.previousShifts);
      }
    },
    onSettled: () => {
      invalidateAllShiftQueries(queryClient);
    },
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Shift updated successfully");
        onSuccess();
      } else {
        toast.error(response.error);
      }
    },
  });

  const onSubmit = (values: ShiftFormValues) => {
    if (mode === "create") {
      createMutation.mutate(values);
    } else {
      updateMutation.mutate(values);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isLoading = isConfigLoading || isStaffLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Staff Member */}
        {allowStaffSelection && mode === "create" ? (
          <FormField
            control={form.control}
            name="staffId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Staff Member</FormLabel>
                <FormControl>
                  <StaffSearchCombobox
                    staff={activeStaff}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Search and select staff..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">Staff Member</label>
            <Input
              value={currentStaffMember?.name || "Unknown"}
              disabled
              className="bg-muted"
            />
          </div>
        )}

        {/* Date */}
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
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getStationDotColor(station) }}
                        />
                        {station}
                      </span>
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

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-4">
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
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Shift" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
