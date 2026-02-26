"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
  overtimeTolerance: 0,
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

  const allowClopening = form.watch("allowClopening");

  const saveMutation = useMutation({
    mutationFn: async (data: ScheduleGenerationSettingsInput) => {
      const result = await saveScheduleGenerationSettings(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Schedule generation settings saved!");
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
          name="overtimeTolerance"
          render={({ field }) => (
            <FormItem className="space-y-4">
              <div className="space-y-0.5">
                <FormLabel>
                  Overtime Tolerance:{" "}
                  <span className="font-mono text-primary">{field.value} / 10</span>
                </FormLabel>
                <FormDescription>
                  How willing the solver is to schedule overtime. 0 means it will try
                  very hard to avoid overtime. 10 means it will largely ignore overtime
                  when making efficient assignments.
                </FormDescription>
              </div>
              <FormControl>
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={[field.value]}
                  onValueChange={([value]) => field.onChange(value)}
                />
              </FormControl>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (Strict)</span>
                <span>10 (Lenient)</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </Form>
  );
}
