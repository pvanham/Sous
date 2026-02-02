"use client";

import { useState, useCallback, useMemo, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bulkUpdateAvailability } from "@/server/actions/staff-availability.actions";
import { updateStaff } from "@/server/actions/staff.actions";
import type { StaffDTO } from "@/types/staff";
import type {
  StaffAvailabilityDTO,
  AvailabilityPreference,
} from "@/types/staff-availability";
import { AvailabilitySlot } from "./AvailabilitySlot";
import { StaffConstraintsForm } from "./StaffConstraintsForm";

// Time periods for the grid
// Note: Use "23:59" for end of day since HH:MM format only allows 00-23 hours
const TIME_PERIODS = [
  { id: "morning", label: "Morning", subLabel: "(6a-12p)", from: "06:00", to: "12:00" },
  { id: "afternoon", label: "Afternoon", subLabel: "(12p-6p)", from: "12:00", to: "18:00" },
  { id: "evening", label: "Evening", subLabel: "(6p-12a)", from: "18:00", to: "23:59" },
] as const;

// Days of the week (0 = Sunday)
const DAYS = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
] as const;

// Slot key format: `${dayOfWeek}-${periodId}`
type SlotKey = `${number}-${string}`;

interface SlotState {
  preference: AvailabilityPreference;
  availableFrom: string | null;
  availableTo: string | null;
  notes: string;
}

interface AvailabilityGridProps {
  staff: StaffDTO;
  initialAvailability: StaffAvailabilityDTO[];
  stations: string[];
}

// Query keys for TanStack Query
const availabilityKeys = {
  all: ["staff-availability"] as const,
  byStaff: (staffId: string) => [...availabilityKeys.all, "staff", staffId] as const,
};

const staffKeys = {
  all: ["staff"] as const,
};

/**
 * Build initial slot state from availability DTOs
 */
function buildSlotState(
  availability: StaffAvailabilityDTO[]
): Map<SlotKey, SlotState> {
  const state = new Map<SlotKey, SlotState>();

  for (const avail of availability) {
    // Find which time period this availability matches
    for (const period of TIME_PERIODS) {
      if (avail.availableFrom === period.from && avail.availableTo === period.to) {
        const key: SlotKey = `${avail.dayOfWeek}-${period.id}`;
        state.set(key, {
          preference: avail.preference,
          availableFrom: avail.availableFrom,
          availableTo: avail.availableTo,
          notes: avail.notes,
        });
      }
    }
  }

  return state;
}

/**
 * Get the default state for an empty slot
 */
function getDefaultSlotState(): SlotState {
  return {
    preference: "unavailable",
    availableFrom: null,
    availableTo: null,
    notes: "",
  };
}

/**
 * Cycle through preference states: unavailable -> available -> preferred -> unavailable
 */
function cyclePreference(current: AvailabilityPreference): AvailabilityPreference {
  switch (current) {
    case "unavailable":
      return "available";
    case "available":
      return "preferred";
    case "preferred":
      return "unavailable";
    default:
      return "unavailable";
  }
}

export function AvailabilityGrid({
  staff,
  initialAvailability,
  stations,
}: AvailabilityGridProps) {
  const queryClient = useQueryClient();

  // Local state for slot preferences
  const [slots, setSlots] = useState<Map<SlotKey, SlotState>>(() =>
    buildSlotState(initialAvailability)
  );

  // Track the initial state to detect changes
  const [initialSlots] = useState<Map<SlotKey, SlotState>>(() =>
    buildSlotState(initialAvailability)
  );

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    // Compare current slots with initial
    for (const [key, state] of slots.entries()) {
      const initial = initialSlots.get(key) ?? getDefaultSlotState();
      if (state.preference !== initial.preference) return true;
    }
    // Also check if initial had slots that are now missing
    for (const key of initialSlots.keys()) {
      if (!slots.has(key)) return true;
    }
    return false;
  }, [slots, initialSlots]);

  // Handle slot click
  const handleSlotClick = useCallback((dayOfWeek: number, periodId: string) => {
    const key: SlotKey = `${dayOfWeek}-${periodId}`;
    const period = TIME_PERIODS.find((p) => p.id === periodId);
    if (!period) return;

    setSlots((prev) => {
      const newSlots = new Map(prev);
      const current = newSlots.get(key) ?? getDefaultSlotState();
      const newPreference = cyclePreference(current.preference);

      if (newPreference === "unavailable") {
        // Remove from map for unavailable
        newSlots.delete(key);
      } else {
        newSlots.set(key, {
          preference: newPreference,
          availableFrom: period.from,
          availableTo: period.to,
          notes: current.notes,
        });
      }

      return newSlots;
    });
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Build availabilities array from slot state
      // Only include "preferred" and "available" entries - "unavailable" is implicit
      const availabilities: Array<{
        dayOfWeek: number;
        availableFrom: string | null;
        availableTo: string | null;
        preference: AvailabilityPreference;
        notes?: string;
      }> = [];

      // Only save non-unavailable entries
      for (const day of DAYS) {
        for (const period of TIME_PERIODS) {
          const key: SlotKey = `${day.id}-${period.id}`;
          const slotState = slots.get(key);

          if (slotState && slotState.preference !== "unavailable") {
            availabilities.push({
              dayOfWeek: day.id,
              availableFrom: slotState.availableFrom,
              availableTo: slotState.availableTo,
              preference: slotState.preference,
              notes: slotState.notes || undefined,
            });
          }
        }
      }

      const result = await bulkUpdateAvailability({
        staffId: staff.id,
        availabilities,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: () => {
      toast.success("Availability saved successfully");
      queryClient.invalidateQueries({ queryKey: availabilityKeys.byStaff(staff.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save availability");
    },
  });

  // Reset to initial state
  const handleReset = useCallback(() => {
    setSlots(buildSlotState(initialAvailability));
  }, [initialAvailability]);

  // Get preference for a slot
  const getSlotPreference = useCallback(
    (dayOfWeek: number, periodId: string): AvailabilityPreference => {
      const key: SlotKey = `${dayOfWeek}-${periodId}`;
      return slots.get(key)?.preference ?? "unavailable";
    },
    [slots]
  );

  return (
    <div className="space-y-6">
      {/* Staff Constraints Form */}
      <StaffConstraintsForm staff={staff} stations={stations} />

      {/* Availability Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium">
              Weekly Availability
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* Legend */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-4 rounded bg-green-100 border border-green-500 dark:bg-green-900/30" />
                  <span className="text-muted-foreground">Preferred</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-4 rounded bg-blue-100 border border-blue-500 dark:bg-blue-900/30" />
                  <span className="text-muted-foreground">Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-4 rounded bg-gray-100 border border-gray-300 dark:bg-gray-800" />
                  <span className="text-muted-foreground">Unavailable</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Grid */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-8 gap-1 min-w-[600px]">
              {/* Header row */}
              <div className="p-2" /> {/* Empty corner cell */}
              {DAYS.map((day) => (
                <div
                  key={day.id}
                  className="p-2 text-center font-medium text-sm"
                >
                  {day.label}
                </div>
              ))}

              {/* Time period rows */}
              {TIME_PERIODS.map((period) => (
                <Fragment key={period.id}>
                  {/* Row label */}
                  <div className="p-2 flex flex-col justify-center">
                    <span className="font-medium text-sm">{period.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {period.subLabel}
                    </span>
                  </div>

                  {/* Day cells */}
                  {DAYS.map((day) => (
                    <AvailabilitySlot
                      key={`${day.id}-${period.id}`}
                      preference={getSlotPreference(day.id, period.id)}
                      onClick={() => handleSlotClick(day.id, period.id)}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  Unsaved changes
                </Badge>
              ) : (
                <span>Click on cells to toggle availability</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || saveMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Discard Changes
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
