import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "../components/settings-header";
import { useMyStaff } from "@/features/profile/hooks";
import {
  useMyAvailability,
  useSaveMyAvailability,
} from "../hooks";
import { DayAvailabilitySheet } from "../components/day-availability-sheet";
import {
  AvailabilityDayRow,
  AvailabilityPresetChip,
} from "../components/availability-day-row";
import { defaultDay, type DayState } from "../types";
import {
  DAYS,
  DEFAULT_FROM,
  DEFAULT_TO,
  buildDayStates,
  daysEqual,
  daysToPayload,
} from "@/features/onboarding/lib/availability-state";

/**
 * Availability screen. Renders each day of the week as a row; tap a
 * row to open the `DayAvailabilitySheet` and edit that day's
 * preference + time window. A screen-level Save button writes the
 * whole week to `/api/me/availability` (bulk upsert) — partial saves
 * would complicate cross-day invariants, and the server route is
 * already a full replacement.
 */
export function AvailabilityScreen() {
  const myStaffQuery = useMyStaff();
  const availabilityQuery = useMyAvailability();
  const saveMutation = useSaveMyAvailability();

  const serverDays = useMemo(
    () => buildDayStates(availabilityQuery.data ?? []),
    [availabilityQuery.data],
  );

  const [days, setDays] = useState<Record<number, DayState>>(() => serverDays);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setDays(serverDays);
  }, [serverDays]);

  const dirty = useMemo(() => {
    for (let d = 0; d <= 6; d++) {
      if (!daysEqual(days[d] ?? defaultDay(), serverDays[d] ?? defaultDay())) {
        return true;
      }
    }
    return false;
  }, [days, serverDays]);

  const canSubmit = dirty && !saveMutation.isPending;

  const handleDaySubmit = useCallback(
    (dayOfWeek: number, state: DayState) => {
      setDays((prev) => ({ ...prev, [dayOfWeek]: state }));
      setOpenDay(null);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(false);
    try {
      await saveMutation.mutateAsync(daysToPayload(days));
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your availability.",
      );
    }
  }, [canSubmit, days, saveMutation]);

  const applyPreset = useCallback(
    (preset: "weekdays" | "weekends" | "clear") => {
      setDays(() => {
        const next: Record<number, DayState> = {};
        for (let d = 0; d <= 6; d++) next[d] = defaultDay();
        if (preset === "clear") return next;
        const daysToSet =
          preset === "weekdays" ? [1, 2, 3, 4, 5] : [0, 6];
        for (const d of daysToSet) {
          next[d] = {
            preference: "available",
            availableFrom: DEFAULT_FROM,
            availableTo: DEFAULT_TO,
            notes: "",
          };
        }
        return next;
      });
    },
    [],
  );

  if (myStaffQuery.isLoading || availabilityQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Availability" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (!myStaffQuery.data) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Availability" />
        <View className="px-4 pt-6">
          <StyledText variant="body">
            We couldn&apos;t find your staff record at this location. Ask
            your manager to add you before setting availability.
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Availability" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <StyledText variant="caption" className="mb-3">
          Tap a day to set when you can work. Unselected days are treated
          as unavailable by the scheduler.
        </StyledText>

        <View className="flex-row flex-wrap gap-2 mb-4">
          <AvailabilityPresetChip
            label="Weekdays"
            onPress={() => applyPreset("weekdays")}
          />
          <AvailabilityPresetChip
            label="Weekends"
            onPress={() => applyPreset("weekends")}
          />
          <AvailabilityPresetChip
            label="Clear all"
            onPress={() => applyPreset("clear")}
          />
        </View>

        <View className="bg-card border border-border rounded-md overflow-hidden">
          {DAYS.map((day, index) => (
            <AvailabilityDayRow
              key={day.id}
              label={day.label}
              state={days[day.id] ?? defaultDay()}
              onPress={() => setOpenDay(day.id)}
              divider={index > 0}
            />
          ))}
        </View>

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mt-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        {success ? (
          <View className="border border-primary rounded-md px-3 py-2 mt-3">
            <StyledText variant="caption" className="text-sm">
              Availability saved.
            </StyledText>
          </View>
        ) : null}

        <Button
          title="Save changes"
          onPress={handleSubmit}
          loading={saveMutation.isPending}
          disabled={!canSubmit}
          size="lg"
          className="mt-4"
        />
      </ScrollView>

      <DayAvailabilitySheet
        visible={openDay !== null}
        onClose={() => setOpenDay(null)}
        dayLabel={openDay !== null ? DAYS[openDay].label : ""}
        initialState={openDay !== null ? (days[openDay] ?? defaultDay()) : defaultDay()}
        onSubmit={(next) => {
          if (openDay === null) return;
          handleDaySubmit(openDay, next);
        }}
      />
    </View>
  );
}
