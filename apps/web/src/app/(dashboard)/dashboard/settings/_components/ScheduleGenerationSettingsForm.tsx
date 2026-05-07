"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ArrayRankingField } from "./ArrayRankingField";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import {
  scheduleGenerationSettingsSchema,
  type ScheduleGenerationSettingsInput,
} from "@/lib/validations/kitchen-config.schema";
import { saveScheduleGenerationSettings } from "@/server/actions/kitchen-config.actions";
import type { ScheduleGenerationSettingsDTO } from "@/types/kitchen-config";

const defaultValues: ScheduleGenerationSettingsInput = {
  allowClopening: false,
  minHoursBetweenShifts: 10,
  clopeningWarningThresholdHours: 10,
  overtimeThresholdHours: 40,
  overtimePolicy: "avoid",
  softConstraintPriority: ["preferences", "fairness", "cost"],
};

interface ScheduleGenerationSettingsFormProps {
  initialSettings: ScheduleGenerationSettingsDTO | null;
}

export function ScheduleGenerationSettingsForm({
  initialSettings,
}: ScheduleGenerationSettingsFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<ScheduleGenerationSettingsInput>({
    resolver: zodResolver(scheduleGenerationSettingsSchema),
    defaultValues: initialSettings ?? defaultValues,
  });

  const resetFormToOriginal = () => {
    form.reset(initialSettings ?? defaultValues);
  };

  const allowClopening = form.watch("allowClopening");

  const saveMutation = useMutation({
    mutationFn: async (data: ScheduleGenerationSettingsInput) => {
      const result = await saveScheduleGenerationSettings(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_result, variables) => {
      toast.success("Schedule generation settings saved!");
      form.reset(variables);
      queryClient.invalidateQueries({ queryKey: ["kitchenConfig"] });
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to save schedule generation settings");
    },
  });

  const onSubmit = (data: ScheduleGenerationSettingsInput) => {
    saveMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-lg">
        <FormField
          control={form.control}
          name="allowClopening"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5 pr-4">
                <FormLabel className="text-base">Allow Clopening</FormLabel>
                <FormDescription>
                  A &ldquo;clopening&rdquo; occurs when a staff member closes one day and
                  opens the next, leaving minimal rest time. When disabled, the
                  scheduler enforces a minimum gap between consecutive shifts.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!allowClopening && (
          <FormField
            control={form.control}
            name="minHoursBetweenShifts"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <div className="space-y-0.5">
                  <FormLabel>
                    Minimum Hours Between Shifts:{" "}
                    <span className="font-mono text-primary">{field.value}h</span>
                  </FormLabel>
                  <FormDescription>
                    The minimum rest period required between consecutive shifts
                    across days. A higher value gives staff more rest but reduces
                    scheduling flexibility.
                  </FormDescription>
                </div>
                <FormControl>
                  <Slider
                    min={6}
                    max={16}
                    step={1}
                    value={[field.value]}
                    onValueChange={([value]) => field.onChange(value)}
                  />
                </FormControl>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>6h</span>
                  <span>16h</span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="clopeningWarningThresholdHours"
          render={({ field }) => (
            <FormItem className="space-y-4">
              <div className="space-y-0.5">
                <FormLabel>
                  Clopening Warning Threshold:{" "}
                  <span className="font-mono text-primary">{field.value}h</span>
                </FormLabel>
                <FormDescription>
                  When the gap between consecutive shifts is below this threshold,
                  a clopening warning will appear in the schedule generation preview.
                  This is informational only and does not prevent assignments.
                </FormDescription>
              </div>
              <FormControl>
                <Slider
                  min={6}
                  max={16}
                  step={1}
                  value={[field.value]}
                  onValueChange={([value]) => field.onChange(value)}
                />
              </FormControl>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>6h</span>
                <span>16h</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="overtimeThresholdHours"
          render={({ field }) => (
            <FormItem className="space-y-4">
              <div className="space-y-0.5">
                <FormLabel>
                  Overtime Threshold:{" "}
                  <span className="font-mono text-primary">{field.value}h</span>
                </FormLabel>
                <FormDescription>
                  The global number of scheduled hours per week after which an
                  employee is considered to be working overtime (e.g., 40 hours).
                </FormDescription>
              </div>
              <FormControl>
                <Slider
                  min={0}
                  max={80}
                  step={1}
                  value={[field.value]}
                  onValueChange={([value]) => field.onChange(value)}
                />
              </FormControl>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0h</span>
                <span>80h</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="overtimePolicy"
          render={({ field }) => (
            <FormItem className="space-y-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Overtime Policy</FormLabel>
                <FormDescription>
                  How the solver handles scheduling shifts that push staff past the overtime threshold.
                </FormDescription>
              </div>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a policy" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="strict">
                    Strictly Prevented (Leave slots unfilled)
                  </SelectItem>
                  <SelectItem value="avoid">
                    Avoid if Possible (High penalty)
                  </SelectItem>
                  <SelectItem value="allowed">
                    Allowed (No penalty)
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="softConstraintPriority"
          render={({ field }) => (
            <FormItem className="space-y-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Soft Constraint Priority</FormLabel>
                <FormDescription>
                  Rank your scheduling objectives. The solver will sacrifice the lowest ranking items to fulfill the highest ranking items.
                </FormDescription>
              </div>
              <FormControl>
                <ArrayRankingField
                  items={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.isDirty && (
          <div className="sticky bottom-6 z-50 mt-8 animate-in slide-in-from-bottom-4 fade-in">
            <Card className="flex items-center justify-between p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex flex-col">
                <span className="font-medium">Unsaved Changes</span>
                <span className="text-sm text-muted-foreground">
                  Don't forget to save your settings
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFormToOriginal}
                  disabled={saveMutation.isPending}
                >
                  Discard
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </form>
    </Form>
  );
}
