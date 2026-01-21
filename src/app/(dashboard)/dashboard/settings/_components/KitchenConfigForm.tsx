"use client";

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
import { saveKitchenConfig } from "@/server/actions/kitchen-config.actions";
import type { KitchenConfigDTO } from "@/types/kitchen-config";

interface KitchenConfigFormProps {
  initialConfig: KitchenConfigDTO | null;
}

export function KitchenConfigForm({ initialConfig }: KitchenConfigFormProps) {
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

  // Mutation for saving config
  const mutation = useMutation({
    mutationFn: async (data: KitchenConfigInput) => {
      const result = await saveKitchenConfig(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Kitchen configuration saved successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save configuration");
    },
  });

  const onSubmit = (data: KitchenConfigInput) => {
    mutation.mutate(data);
  };

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
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </form>
    </Form>
  );
}
