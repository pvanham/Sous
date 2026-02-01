"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { updateStaff } from "@/server/actions/staff.actions";
import type { StaffDTO } from "@/types/staff";

// Validation schema for staff constraints
const constraintsSchema = z
  .object({
    maxHoursPerWeek: z.number().min(0).max(168),
    minHoursPerWeek: z.number().min(0).max(168),
    hourlyRate: z.number().min(0),
    preferredStations: z.array(z.string()),
  })
  .refine((data) => data.maxHoursPerWeek >= data.minHoursPerWeek, {
    message: "Maximum hours must be greater than or equal to minimum hours",
    path: ["maxHoursPerWeek"],
  });

type ConstraintsFormValues = z.infer<typeof constraintsSchema>;

interface StaffConstraintsFormProps {
  staff: StaffDTO;
  stations: string[];
}

export function StaffConstraintsForm({
  staff,
  stations,
}: StaffConstraintsFormProps) {
  const queryClient = useQueryClient();
  const [selectedStation, setSelectedStation] = useState<string>("");

  // Initialize form with staff's current values
  const form = useForm<ConstraintsFormValues>({
    resolver: zodResolver(constraintsSchema),
    defaultValues: {
      maxHoursPerWeek: staff.maxHoursPerWeek,
      minHoursPerWeek: staff.minHoursPerWeek,
      hourlyRate: staff.hourlyRate,
      preferredStations: staff.preferredStations,
    },
  });

  // Reset form when staff changes
  useEffect(() => {
    form.reset({
      maxHoursPerWeek: staff.maxHoursPerWeek,
      minHoursPerWeek: staff.minHoursPerWeek,
      hourlyRate: staff.hourlyRate,
      preferredStations: staff.preferredStations,
    });
  }, [staff, form]);

  // Track if form is dirty
  const isDirty = form.formState.isDirty;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: ConstraintsFormValues) => {
      const result = await updateStaff(staff.id, {
        maxHoursPerWeek: values.maxHoursPerWeek,
        minHoursPerWeek: values.minHoursPerWeek,
        hourlyRate: values.hourlyRate,
        preferredStations: values.preferredStations,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: () => {
      toast.success("Constraints saved successfully");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      form.reset(form.getValues()); // Reset dirty state
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save constraints");
    },
  });

  // Handle adding a preferred station
  const handleAddStation = () => {
    if (!selectedStation) return;

    const currentStations = form.getValues("preferredStations");
    if (!currentStations.includes(selectedStation)) {
      form.setValue("preferredStations", [...currentStations, selectedStation], {
        shouldDirty: true,
      });
    }
    setSelectedStation("");
  };

  // Handle removing a preferred station
  const handleRemoveStation = (station: string) => {
    const currentStations = form.getValues("preferredStations");
    form.setValue(
      "preferredStations",
      currentStations.filter((s) => s !== station),
      { shouldDirty: true }
    );
  };

  // Watch preferred stations with fallback to empty array
  const watchedPreferredStations = form.watch("preferredStations") ?? [];

  // Get available stations (not already selected)
  const availableStations = stations.filter(
    (s) => !watchedPreferredStations.includes(s)
  );

  const onSubmit = (values: ConstraintsFormValues) => {
    saveMutation.mutate(values);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium">
          Schedule Constraints
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Hours per week */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="minHoursPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Hours/Week</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Minimum guaranteed hours
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxHoursPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Hours/Week</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum allowed hours
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      For labor cost tracking
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Preferred Stations */}
            <FormField
              control={form.control}
              name="preferredStations"
              render={() => (
                <FormItem>
                  <FormLabel>Preferred Stations</FormLabel>
                  <div className="space-y-3">
                    {/* Current selections */}
                    <div className="flex flex-wrap gap-2 min-h-8">
                      {watchedPreferredStations.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          No preferred stations selected
                        </span>
                      ) : (
                        watchedPreferredStations.map((station) => (
                          <Badge
                            key={station}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {station}
                            <button
                              type="button"
                              onClick={() => handleRemoveStation(station)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>

                    {/* Add station selector */}
                    {availableStations.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedStation}
                          onValueChange={setSelectedStation}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select station..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStations.map((station) => (
                              <SelectItem key={station} value={station}>
                                {station}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddStation}
                          disabled={!selectedStation}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Stations this staff member prefers to work at (used by AI scheduling)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!isDirty || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Constraints
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
