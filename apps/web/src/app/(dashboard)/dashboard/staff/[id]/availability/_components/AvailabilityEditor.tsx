"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, Calendar, Briefcase, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkUpdateAvailability } from "@/server/actions/staff-availability.actions";
import type { StaffDTO } from "@/types/staff";
import type {
  StaffAvailabilityDTO,
  AvailabilityPreference,
} from "@/types/staff-availability";
import { StaffConstraintsForm } from "./StaffConstraintsForm";

const DAYS = [
  { id: 0, label: "Sunday", short: "Sun" },
  { id: 1, label: "Monday", short: "Mon" },
  { id: 2, label: "Tuesday", short: "Tue" },
  { id: 3, label: "Wednesday", short: "Wed" },
  { id: 4, label: "Thursday", short: "Thu" },
  { id: 5, label: "Friday", short: "Fri" },
  { id: 6, label: "Saturday", short: "Sat" },
] as const;

interface DayState {
  preference: AvailabilityPreference;
  availableFrom: string | null;
  availableTo: string | null;
  notes: string;
}

interface AvailabilityEditorProps {
  staff: StaffDTO;
  initialAvailability: StaffAvailabilityDTO[];
  stations: string[];
}

const availabilityKeys = {
  all: ["staff-availability"] as const,
  byStaff: (staffId: string) =>
    [...availabilityKeys.all, "staff", staffId] as const,
};

function generateTimeOptions(startHour: number, endHour: number): string[] {
  const options: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    options.push(`${String(h).padStart(2, "0")}:00`);
    if (h < endHour) {
      options.push(`${String(h).padStart(2, "0")}:30`);
    }
  }
  return options;
}

const FROM_OPTIONS = generateTimeOptions(5, 22);
const TO_OPTIONS = generateTimeOptions(5, 23);

function formatTimeLabel(time: string): string {
  const [hourStr, min] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return min === "00" ? `${display}${suffix}` : `${display}:${min}${suffix}`;
}

function getDefaultDay(): DayState {
  return {
    preference: "unavailable",
    availableFrom: null,
    availableTo: null,
    notes: "",
  };
}

function buildDayStates(
  availability: StaffAvailabilityDTO[]
): Map<number, DayState> {
  const state = new Map<number, DayState>();

  for (const avail of availability) {
    if (avail.preference === "unavailable") continue;
    if (avail.availableFrom === null || avail.availableTo === null) continue;

    const existing = state.get(avail.dayOfWeek);
    if (existing) {
      // Merge: widen the window, keep the stronger preference
      const from =
        avail.availableFrom < existing.availableFrom!
          ? avail.availableFrom
          : existing.availableFrom;
      const to =
        avail.availableTo! > existing.availableTo!
          ? avail.availableTo
          : existing.availableTo;
      const preference =
        existing.preference === "preferred" ||
        avail.preference === "preferred"
          ? "preferred"
          : "available";
      state.set(avail.dayOfWeek, {
        preference,
        availableFrom: from,
        availableTo: to,
        notes: existing.notes || avail.notes,
      });
    } else {
      state.set(avail.dayOfWeek, {
        preference: avail.preference,
        availableFrom: avail.availableFrom,
        availableTo: avail.availableTo,
        notes: avail.notes,
      });
    }
  }

  return state;
}

function cyclePreference(
  current: AvailabilityPreference
): AvailabilityPreference {
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

const preferenceConfig: Record<
  AvailabilityPreference,
  { label: string; icon: string; rowClass: string; badgeClass: string }
> = {
  preferred: {
    label: "Preferred",
    icon: "★",
    rowClass:
      "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
    badgeClass:
      "bg-green-100 text-green-700 border-green-400 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700",
  },
  available: {
    label: "Available",
    icon: "✓",
    rowClass:
      "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    badgeClass:
      "bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700",
  },
  unavailable: {
    label: "Off",
    icon: "✗",
    rowClass:
      "bg-gray-50 border-gray-200 dark:bg-gray-900/30 dark:border-gray-700",
    badgeClass:
      "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600",
  },
};

export function AvailabilityEditor({
  staff,
  initialAvailability,
  stations,
}: AvailabilityEditorProps) {
  const queryClient = useQueryClient();

  const [days, setDays] = useState<Map<number, DayState>>(() =>
    buildDayStates(initialAvailability)
  );

  const [initialDays] = useState<Map<number, DayState>>(() =>
    buildDayStates(initialAvailability)
  );

  const hasChanges = useMemo(() => {
    for (let d = 0; d <= 6; d++) {
      const current = days.get(d) ?? getDefaultDay();
      const initial = initialDays.get(d) ?? getDefaultDay();
      if (
        current.preference !== initial.preference ||
        current.availableFrom !== initial.availableFrom ||
        current.availableTo !== initial.availableTo
      ) {
        return true;
      }
    }
    return false;
  }, [days, initialDays]);

  const getDayState = useCallback(
    (dayOfWeek: number): DayState => {
      return days.get(dayOfWeek) ?? getDefaultDay();
    },
    [days]
  );

  const handleTogglePreference = useCallback((dayOfWeek: number) => {
    setDays((prev) => {
      const next = new Map(prev);
      const current = next.get(dayOfWeek) ?? getDefaultDay();
      const newPref = cyclePreference(current.preference);

      if (newPref === "unavailable") {
        next.delete(dayOfWeek);
      } else {
        next.set(dayOfWeek, {
          preference: newPref,
          availableFrom: current.availableFrom ?? "07:00",
          availableTo: current.availableTo ?? "23:00",
          notes: current.notes,
        });
      }
      return next;
    });
  }, []);

  const handleTimeChange = useCallback(
    (dayOfWeek: number, field: "availableFrom" | "availableTo", value: string) => {
      setDays((prev) => {
        const next = new Map(prev);
        const current = next.get(dayOfWeek) ?? getDefaultDay();
        next.set(dayOfWeek, { ...current, [field]: value });
        return next;
      });
    },
    []
  );

  // -- Presets --
  const applyPreset = useCallback(
    (preset: "fullWeek" | "weekdays" | "clear") => {
      setDays(() => {
        const next = new Map<number, DayState>();
        if (preset === "clear") return next;

        const daysToSet =
          preset === "fullWeek" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

        for (const d of daysToSet) {
          next.set(d, {
            preference: "available",
            availableFrom: "07:00",
            availableTo: "23:00",
            notes: "",
          });
        }
        return next;
      });
    },
    []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const availabilities: Array<{
        dayOfWeek: number;
        availableFrom: string | null;
        availableTo: string | null;
        preference: AvailabilityPreference;
        notes?: string;
      }> = [];

      for (const day of DAYS) {
        const state = days.get(day.id);
        if (state && state.preference !== "unavailable") {
          availabilities.push({
            dayOfWeek: day.id,
            availableFrom: state.availableFrom,
            availableTo: state.availableTo,
            preference: state.preference,
            notes: state.notes || undefined,
          });
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
      queryClient.invalidateQueries({
        queryKey: availabilityKeys.byStaff(staff.id),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save availability");
    },
  });

  const handleReset = useCallback(() => {
    setDays(buildDayStates(initialAvailability));
  }, [initialAvailability]);

  return (
    <div className="space-y-6">
      <StaffConstraintsForm staff={staff} stations={stations} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-medium">
                Weekly Availability
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Set the time range this staff member can work each day.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded-sm bg-green-100 border border-green-500 dark:bg-green-900/30" />
                <span className="text-muted-foreground">Preferred</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded-sm bg-blue-100 border border-blue-500 dark:bg-blue-900/30" />
                <span className="text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded-sm bg-gray-100 border border-gray-300 dark:bg-gray-800" />
                <span className="text-muted-foreground">Off</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Preset buttons */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium text-muted-foreground mr-1">
              Quick fill:
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset("fullWeek")}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Full Week
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset("weekdays")}
            >
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />
              Weekdays
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset("clear")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear All
            </Button>
          </div>

          {/* Day rows */}
          <div className="space-y-2">
            {DAYS.map((day) => {
              const state = getDayState(day.id);
              const isActive = state.preference !== "unavailable";
              const config = preferenceConfig[state.preference];

              return (
                <div
                  key={day.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    config.rowClass
                  )}
                >
                  {/* Day label */}
                  <span className="w-12 text-sm font-medium shrink-0">
                    {day.short}
                  </span>

                  {/* Status toggle */}
                  <button
                    type="button"
                    onClick={() => handleTogglePreference(day.id)}
                    className="shrink-0"
                    title={`Click to change from ${state.preference}`}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-24 justify-center cursor-pointer select-none transition-colors",
                        config.badgeClass
                      )}
                    >
                      <span className="mr-1">{config.icon}</span>
                      {config.label}
                    </Badge>
                  </button>

                  {/* Time range selects */}
                  {isActive ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Select
                        value={state.availableFrom ?? "07:00"}
                        onValueChange={(v) =>
                          handleTimeChange(day.id, "availableFrom", v)
                        }
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FROM_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {formatTimeLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <span className="text-sm text-muted-foreground shrink-0">
                        to
                      </span>

                      <Select
                        value={state.availableTo ?? "23:00"}
                        onValueChange={(v) =>
                          handleTimeChange(day.id, "availableTo", v)
                        }
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TO_OPTIONS.filter(
                            (t) => t > (state.availableFrom ?? "00:00")
                          ).map((t) => (
                            <SelectItem key={t} value={t}>
                              {formatTimeLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-muted-foreground italic">
                      Not available
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <Badge
                  variant="outline"
                  className="bg-yellow-50 text-yellow-700 border-yellow-200"
                >
                  Unsaved changes
                </Badge>
              ) : (
                <span>Click status badges to toggle availability</span>
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
