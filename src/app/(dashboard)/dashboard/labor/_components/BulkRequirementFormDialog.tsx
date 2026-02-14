"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { bulkCreateLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { laborRequirementKeys } from "./LaborGrid";
import { getDayName } from "@/lib/validations/labor-requirement.schema";

// Form schema for bulk requirement (without station/day which come from selection)
const bulkFormSchema = z
  .object({
    startTime: z
      .string()
      .regex(
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "Time must be in HH:MM format (e.g., 09:00)"
      ),
    endTime: z
      .string()
      .regex(
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "Time must be in HH:MM format (e.g., 17:00)"
      ),
    minStaff: z.number().int().min(0, "Must be at least 0"),
    preferredStaff: z.number().int().min(0, "Must be at least 0"),
    priority: z.enum(["critical", "high", "normal", "low"]),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((data) => data.preferredStaff >= data.minStaff, {
    message: "Preferred staff must be >= minimum",
    path: ["preferredStaff"],
  });

type BulkFormInput = z.infer<typeof bulkFormSchema>;

interface BulkRequirementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCells: Array<{ station: string; dayOfWeek: number }>;
}

// Priority options for select
const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

export function BulkRequirementFormDialog({
  open,
  onOpenChange,
  selectedCells,
}: BulkRequirementFormDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<BulkFormInput>({
    resolver: zodResolver(bulkFormSchema),
    defaultValues: {
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        startTime: "09:00",
        endTime: "17:00",
        minStaff: 1,
        preferredStaff: 1,
        priority: "normal",
      });
    }
  }, [open, form]);

  // Bulk create mutation
  const mutation = useMutation({
    mutationFn: async (data: BulkFormInput) => {
      const result = await bulkCreateLaborRequirements({
        cells: selectedCells,
        requirement: data,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: laborRequirementKeys.list() });

      if (data.errors.length === 0) {
        toast.success(`Created ${data.created} shift slots`);
      } else {
        toast.warning(
          `Created ${data.created} shift slots. ${data.errors.length} failed.`
        );
      }
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: BulkFormInput) => {
    mutation.mutate(data);
  };

  // Group selected cells by station for display
  const selectedSummary = () => {
    const byStation = new Map<string, number[]>();
    for (const cell of selectedCells) {
      const days = byStation.get(cell.station) ?? [];
      days.push(cell.dayOfWeek);
      byStation.set(cell.station, days);
    }

    const parts: string[] = [];
    for (const [station, days] of byStation) {
      const dayNames = days.map((d) => getDayName(d).slice(0, 3)).join(", ");
      parts.push(`${station} (${dayNames})`);
    }
    return parts.join("; ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Add Shift Slots</DialogTitle>
          <DialogDescription>
            Create a shift slot for {selectedCells.length} selected
            cell(s).
          </DialogDescription>
        </DialogHeader>

        {/* Selected cells summary */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md max-h-24 overflow-y-auto">
          <strong>Selected:</strong> {selectedSummary()}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Shift Length Warning */}
            <ShiftLengthWarning startTime={form.watch("startTime")} endTime={form.watch("endTime")} />

            {/* Staff Counts */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="minStaff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Staff</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preferredStaff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Staff</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((priority) => (
                        <SelectItem key={priority.value} value={priority.value}>
                          {priority.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Shift Slots
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────
// Shift Length Warning
// ────────────────────────────────────────────────────────────

function computeDuration(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const startMatch = startTime.match(/^(\d{2}):(\d{2})$/);
  const endMatch = endTime.match(/^(\d{2}):(\d{2})$/);
  if (!startMatch || !endMatch) return null;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes <= startMinutes) return null;
  return (endMinutes - startMinutes) / 60;
}

function ShiftLengthWarning({ startTime, endTime }: { startTime: string; endTime: string }) {
  const duration = computeDuration(startTime, endTime);
  if (duration === null || (duration >= 4 && duration <= 12)) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {duration < 4
          ? `This shift is only ${duration.toFixed(1)} hours. Shifts shorter than 4 hours are unusual and may be hard to fill.`
          : `This shift is ${duration.toFixed(1)} hours. Shifts longer than 12 hours may cause scheduling issues.`}
      </span>
    </div>
  );
}
