"use client";

import { useState, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  kitchenConfigSchema,
  type KitchenConfigInput,
  defaultKitchenConfigValues,
  DAYS_OF_WEEK,
  type DayOfWeek,
} from "@/lib/validations/kitchen-config.schema";
import {
  saveKitchenConfig,
  previewKitchenConfigChanges,
} from "@/server/actions/kitchen-config.actions";
import type {
  KitchenConfigDTO,
  ConfigChangeImpact,
  SaveKitchenConfigOptions,
} from "@/types/kitchen-config";
import type { MemberRole } from "@/server/models/OrganizationMember";
import { ConfigChangeWarningDialog } from "./ConfigChangeWarningDialog";

interface KitchenConfigFormProps {
  initialConfig: KitchenConfigDTO | null;
  /**
   * Caller's role at this location. Owners can edit every field;
   * managers see the owner-only "Week start" select disabled with a
   * tooltip. The action layer enforces this independently.
   */
  currentRole: MemberRole;
}

export function KitchenConfigForm({
  initialConfig,
  currentRole,
}: KitchenConfigFormProps) {
  const isOwner = currentRole === "owner";
  // State for warning dialog
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [pendingData, setPendingData] = useState<KitchenConfigInput | null>(null);
  const [impactData, setImpactData] = useState<ConfigChangeImpact | null>(null);

  // Track original stations and roles to detect removals
  const originalStations = useMemo(
    () => new Set(initialConfig?.stations || []),
    [initialConfig]
  );
  const originalRoles = useMemo(
    () => new Set(initialConfig?.roles || []),
    [initialConfig]
  );

  // Convert DTO to form values, or use defaults
  const defaultValues: KitchenConfigInput = initialConfig
    ? {
        name: initialConfig.name,
        stations:
          initialConfig.stations.length > 0 ? initialConfig.stations : [""],
        roles: initialConfig.roles.length > 0 ? initialConfig.roles : [""],
        managerRoles: initialConfig.managerRoles || [],
        operatingHours: initialConfig.operatingHours,
        minTimeOffAdvanceDays: initialConfig.minTimeOffAdvanceDays ?? 7,
        aiSettings: initialConfig.aiSettings ?? {
          monthlyGenerationLimit: 50,
          subscriptionTier: "free",
        },
        weekStartsOn: initialConfig.weekStartsOn ?? "monday",
      }
    : defaultKitchenConfigValues;

  const form = useForm<KitchenConfigInput>({
    resolver: zodResolver(kitchenConfigSchema),
    defaultValues,
  });

  // Dynamic field arrays for stations and roles
  const stationsArray = useFieldArray({
    control: form.control,
    name: "stations" as never,
  });

  const rolesArray = useFieldArray({
    control: form.control,
    name: "roles" as never,
  });

  // Reset form to original/default values
  const resetFormToOriginal = () => {
    form.reset(defaultValues);
  };

  // Mutation for previewing changes
  const previewMutation = useMutation({
    mutationFn: async (data: KitchenConfigInput) => {
      const result = await previewKitchenConfigChanges(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  // Mutation for saving config
  const saveMutation = useMutation({
    mutationFn: async ({
      data,
      options,
    }: {
      data: KitchenConfigInput;
      options?: SaveKitchenConfigOptions;
    }) => {
      const result = await saveKitchenConfig(data, options);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_result, variables) => {
      toast.success("Kitchen configuration saved successfully!");
      // Reset form to the saved values so isDirty becomes false and the banner disappears
      form.reset(variables.data);
      // Clear pending data first so the dialog close handler knows it was a success (not cancel)
      setPendingData(null);
      setImpactData(null);
      setWarningDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save configuration");
      // Reset form on save failure to avoid leaving it in a partial state
      setWarningDialogOpen(false);
      setPendingData(null);
      setImpactData(null);
      resetFormToOriginal();
    },
  });

  // Calculate removals from current form state
  const calculateRemovals = (data: KitchenConfigInput) => {
    const newStations = new Set(data.stations.filter((s) => s.trim() !== ""));
    const newRoles = new Set(data.roles.filter((r) => r.trim() !== ""));

    const removedStations = [...originalStations].filter(
      (s) => !newStations.has(s)
    );
    const removedRoles = [...originalRoles].filter((r) => !newRoles.has(r));

    return { removedStations, removedRoles };
  };

  const onSubmit = async (data: KitchenConfigInput) => {
    // Check for removals
    const { removedStations, removedRoles } = calculateRemovals(data);
    const totalRemovals = removedStations.length + removedRoles.length;

    // Enforce one-at-a-time deletion
    if (totalRemovals > 1) {
      toast.error(
        "Please remove only one station or role at a time. This helps ensure data integrity."
      );
      // Reset form to avoid leaving it in a partial state
      resetFormToOriginal();
      return;
    }

    // The week-start change (when present) needs the same warn-then-confirm
    // flow as station/role removals — the owner has to acknowledge that
    // existing schedules keep their current weekStartDate.
    const weekStartChanged =
      initialConfig != null &&
      initialConfig.weekStartsOn !== data.weekStartsOn;

    // Fast path: nothing requires a confirmation, so save directly.
    if (totalRemovals === 0 && !weekStartChanged) {
      saveMutation.mutate({ data });
      return;
    }

    // Preview impact of the change (covers removals and week-start flip).
    try {
      const impact = await previewMutation.mutateAsync(data);

      // Check if there's any actual impact (staff skills, labor requirements, preferred stations, or roles)
      const hasStationImpact =
        impact.removedStations.length > 0 &&
        (impact.stationImpact.affectedStaffCount > 0 ||
          impact.stationImpact.laborRequirementCount > 0 ||
          impact.stationImpact.preferredStationStaffCount > 0);
      const hasRoleImpact =
        impact.removedRoles.length > 0 &&
        impact.roleImpact.affectedStaffCount > 0;
      const hasWeekStartImpact = Boolean(impact.weekStartChange);

      if (!hasStationImpact && !hasRoleImpact && !hasWeekStartImpact) {
        // No impact, save directly
        saveMutation.mutate({ data });
        return;
      }

      // Show warning dialog
      setPendingData(data);
      setImpactData(impact);
      setWarningDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to preview changes"
      );
      // Reset form on preview failure
      resetFormToOriginal();
    }
  };

  // Handle confirmation from warning dialog
  const handleWarningConfirm = (options?: SaveKitchenConfigOptions) => {
    if (pendingData) {
      saveMutation.mutate({ data: pendingData, options });
    }
  };

  // Handle warning dialog open state changes (including cancel)
  const handleWarningDialogOpenChange = (open: boolean) => {
    setWarningDialogOpen(open);
    if (!open && pendingData) {
      // Dialog was closed (cancelled) while there's still pending data
      // This means user cancelled, not that save succeeded
      // Reset form to original values and clear pending state
      setPendingData(null);
      setImpactData(null);
      resetFormToOriginal();
    }
  };

  const isPending = previewMutation.isPending || saveMutation.isPending;

  // Helper to capitalize day names
  const capitalizeDay = (day: string) =>
    day.charAt(0).toUpperCase() + day.slice(1);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
        {/* Restaurant Name */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-0.5">
            <h3 className="text-lg font-medium">Restaurant Info</h3>
            <p className="text-sm text-muted-foreground">Basic information about your establishment.</p>
          </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Restaurant Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Restaurant" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

        {/* Stations */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-lg font-medium">Stations</h3>
              <p className="text-sm text-muted-foreground">Define the physical workstations in your kitchen.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => stationsArray.append("")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Station
            </Button>
          </div>
          <div className="space-y-3 pt-2">
            {stationsArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name={`stations.${index}`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input placeholder="e.g., Grill, Sauté, Prep" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {stationsArray.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => stationsArray.remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {form.formState.errors.stations?.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.stations.root.message}
              </p>
            )}
          </div>
        </div>

        {/* Roles */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-lg font-medium">Roles</h3>
              <p className="text-sm text-muted-foreground">Define staff positions and responsibilities.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rolesArray.append("")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Role
            </Button>
          </div>
          <div className="space-y-3 pt-2">
            {rolesArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name={`roles.${index}`}
                  render={({ field: { value, onChange, ...rest } }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          placeholder="e.g., Cook, Sous Chef, Line Cook"
                          {...rest}
                          value={value}
                          onChange={(e) => {
                            const oldVal = value;
                            const newVal = e.target.value;
                            onChange(newVal);
                            
                            const currentManagerRoles = form.getValues("managerRoles") || [];
                            if (oldVal && currentManagerRoles.includes(oldVal)) {
                               form.setValue(
                                 "managerRoles",
                                 currentManagerRoles.map((r) => (r === oldVal ? newVal : r)),
                                 { shouldDirty: true }
                               );
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center space-x-2 px-3 h-10 border rounded-md">
                  <Checkbox
                    id={`manager-role-${index}`}
                    checked={(form.watch("managerRoles") || []).includes(form.watch(`roles.${index}`) || "")}
                    onCheckedChange={(checked) => {
                      const currentRole = form.watch(`roles.${index}`);
                      if (!currentRole) return;
                      
                      const currentManagerRoles = form.getValues("managerRoles") || [];
                      if (checked) {
                        if (!currentManagerRoles.includes(currentRole)) {
                          form.setValue("managerRoles", [...currentManagerRoles, currentRole], { shouldDirty: true });
                        }
                      } else {
                        form.setValue("managerRoles", currentManagerRoles.filter(r => r !== currentRole), { shouldDirty: true });
                      }
                    }}
                  />
                  <label htmlFor={`manager-role-${index}`} className="text-sm font-medium leading-none cursor-pointer">
                    Manager
                  </label>
                </div>
                {rolesArray.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const removedRole = form.getValues(`roles.${index}`);
                      rolesArray.remove(index);
                      if (removedRole) {
                        const currentManagerRoles = form.getValues("managerRoles") || [];
                        if (currentManagerRoles.includes(removedRole)) {
                          form.setValue(
                            "managerRoles",
                            currentManagerRoles.filter((r) => r !== removedRole),
                            { shouldDirty: true }
                          );
                        }
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {form.formState.errors.roles?.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.roles.root.message}
              </p>
            )}
          </div>
        </div>

        {/* Time-Off Policy */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-0.5">
            <h3 className="text-lg font-medium">Time-Off Policy</h3>
            <p className="text-sm text-muted-foreground">Configure rules for staff time-off requests.</p>
          </div>
            <FormField
              control={form.control}
              name="minTimeOffAdvanceDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Time-Off Notice</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select minimum notice" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="7">1 week (7 days)</SelectItem>
                      <SelectItem value="14">2 weeks (14 days)</SelectItem>
                      <SelectItem value="21">3 weeks (21 days)</SelectItem>
                      <SelectItem value="28">4 weeks (28 days)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How far in advance staff must submit time-off requests.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

        {/* Week Start (owner-only) */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-0.5">
            <h3 className="text-lg font-medium">Week Start</h3>
            <p className="text-sm text-muted-foreground">
              The day each new weekly schedule will start. Existing schedules
              keep their current week boundaries.
            </p>
          </div>
          <FormField
            control={form.control}
            name="weekStartsOn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First day of the week</FormLabel>
                {isOwner ? (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a starting day" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day} value={day}>
                          {capitalizeDay(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* The disabled trigger is wrapped in a span so
                            the tooltip still receives hover events. */}
                        <span className="inline-block w-full">
                          <Select value={field.value} disabled>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a starting day" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent />
                          </Select>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Only owners can change this.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <FormDescription>
                  Applies to schedule generation, dashboards, time-off, and
                  shift exchange across the web and mobile apps.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Operating Hours */}
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-0.5">
            <h3 className="text-lg font-medium">Operating Hours</h3>
            <p className="text-sm text-muted-foreground">Set your kitchen&apos;s open and close times for scheduling.</p>
          </div>
          <div className="space-y-4 pt-2">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="flex flex-col gap-3 border-b border-border pb-4 last:border-0 sm:flex-row sm:items-center"
              >
                <div className="flex w-32 items-center gap-3">
                  <FormField
                    control={form.control}
                    name={`operatingHours.${day}.isOpen` as const}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-medium">
                          {capitalizeDay(day)}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch(`operatingHours.${day as DayOfWeek}.isOpen`) && (
                  <div className="flex flex-1 items-center gap-2">
                    <FormField
                      control={form.control}
                      name={`operatingHours.${day}.open` as const}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">to</span>
                    <FormField
                      control={form.control}
                      name={`operatingHours.${day}.close` as const}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Save Bar */}
        {form.formState.isDirty && (
          <div className="sticky bottom-6 z-50 mt-8 animate-in slide-in-from-bottom-4 fade-in">
            <Card className="flex items-center justify-between p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex flex-col">
                <span className="font-medium">Unsaved Changes</span>
                <span className="text-sm text-muted-foreground mr-4">
                  Don&apos;t forget to save your settings
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFormToOriginal}
                  disabled={isPending}
                >
                  Discard
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </form>

      {/* Warning Dialog for Station/Role Removal */}
      <ConfigChangeWarningDialog
        open={warningDialogOpen}
        onOpenChange={handleWarningDialogOpenChange}
        impact={impactData}
        onConfirm={handleWarningConfirm}
        isPending={saveMutation.isPending}
      />
    </Form>
  );
}
