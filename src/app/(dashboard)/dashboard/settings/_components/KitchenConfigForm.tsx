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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

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
import { ConfigChangeWarningDialog } from "./ConfigChangeWarningDialog";

interface KitchenConfigFormProps {
  initialConfig: KitchenConfigDTO | null;
}

export function KitchenConfigForm({ initialConfig }: KitchenConfigFormProps) {
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
        operatingHours: initialConfig.operatingHours,
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
    onSuccess: () => {
      toast.success("Kitchen configuration saved successfully!");
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

    // If no removals, save directly
    if (totalRemovals === 0) {
      saveMutation.mutate({ data });
      return;
    }

    // Preview impact of the removal
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

      if (!hasStationImpact && !hasRoleImpact) {
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Restaurant Name */}
        <Card>
          <CardHeader>
            <CardTitle>Restaurant Info</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Stations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Stations</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => stationsArray.append("")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Station
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Roles</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rolesArray.append("")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Role
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {rolesArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name={`roles.${index}`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          placeholder="e.g., Cook, Sous Chef, Line Cook"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {rolesArray.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => rolesArray.remove(index)}
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
          </CardContent>
        </Card>

        {/* Operating Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Operating Hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Saving..." : "Save Configuration"}
        </Button>
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
