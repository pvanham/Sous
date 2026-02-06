"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

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

import {
  laborRequirementSchema,
  DAY_NAMES,
  type LaborRequirementInput,
} from "@/lib/validations/labor-requirement.schema";
import {
  createLaborRequirement,
  updateLaborRequirement,
  deleteLaborRequirement,
} from "@/server/actions/labor-requirement.actions";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import { laborRequirementKeys } from "./LaborGrid";

interface RequirementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement?: LaborRequirementDTO;
  defaultStation: string;
  defaultDayOfWeek: number;
  stations: string[];
}

// Priority options for select
const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

// Day options starting from Monday
const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

export function RequirementFormDialog({
  open,
  onOpenChange,
  requirement,
  defaultStation,
  defaultDayOfWeek,
  stations,
}: RequirementFormDialogProps) {
  const isEditMode = !!requirement;
  const queryClient = useQueryClient();

  const form = useForm<LaborRequirementInput>({
    resolver: zodResolver(laborRequirementSchema),
    defaultValues: {
      dayOfWeek: defaultDayOfWeek,
      station: defaultStation,
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    },
  });

  // Reset form when dialog opens/closes or requirement changes
  useEffect(() => {
    if (open) {
      if (requirement) {
        form.reset({
          dayOfWeek: requirement.dayOfWeek,
          station: requirement.station,
          startTime: requirement.startTime,
          endTime: requirement.endTime,
          minStaff: requirement.minStaff,
          preferredStaff: requirement.preferredStaff,
          priority: requirement.priority,
        });
      } else {
        form.reset({
          dayOfWeek: defaultDayOfWeek,
          station: defaultStation,
          startTime: "09:00",
          endTime: "17:00",
          minStaff: 1,
          preferredStaff: 1,
          priority: "normal",
        });
      }
    }
  }, [open, requirement, defaultStation, defaultDayOfWeek, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: LaborRequirementInput) => {
      const result = await createLaborRequirement(data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Labor requirement created");
      queryClient.invalidateQueries({ queryKey: laborRequirementKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: LaborRequirementInput) => {
      const result = await updateLaborRequirement(requirement!.id, data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Labor requirement updated");
      queryClient.invalidateQueries({ queryKey: laborRequirementKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteLaborRequirement(requirement!.id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Labor requirement deleted");
      queryClient.invalidateQueries({ queryKey: laborRequirementKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const onSubmit = (data: LaborRequirementInput) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = () => {
    if (isEditMode) {
      deleteMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Requirement" : "Add Requirement"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the staffing requirement for this time slot."
              : "Define the staffing needs for this station and day."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Day of Week */}
            <FormField
              control={form.control}
              name="dayOfWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Day of Week</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DAY_OPTIONS.map((day) => (
                        <SelectItem key={day.value} value={String(day.value)}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select station" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stations.map((station) => (
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

            <DialogFooter className="pt-4 gap-2 sm:gap-0">
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="mr-auto"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? "Save Changes" : "Add Requirement"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
