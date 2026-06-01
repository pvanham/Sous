import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { HoursStepper } from "@/components/ui/hours-stepper";
import { useMyStaff, useUpdateMyStaff } from "@/features/profile/hooks";
import {
  useMyAvailability,
  useSaveMyAvailability,
} from "@/features/settings/hooks";
import { DayAvailabilitySheet } from "@/features/settings/components/day-availability-sheet";
import {
  AvailabilityDayRow,
  AvailabilityPresetChip,
} from "@/features/settings/components/availability-day-row";
import { defaultDay, type DayState } from "@/features/settings/types";
import {
  DAYS,
  DEFAULT_FROM,
  DEFAULT_TO,
  buildDayStates,
  daysToPayload,
  isAvailabilityEmpty,
} from "../lib/availability-state";
import { OnboardingHeader } from "../components/onboarding-header";
import { useOnboardingNav } from "../use-onboarding-nav";

const MIN_HOURS = 0;
const MAX_HOURS = 80;

/**
 * Availability + weekly hours (step 3/4).
 *
 * Combines two server fields onto a single screen because the user
 * is mentally defining "when I can work" and "how much I want to
 * work" together:
 *   • `min/maxHoursPerWeek` on the Staff record (hard constraints
 *     in the AI scheduler).
 *   • Weekly `StaffAvailability` rows (soft constraints when
 *     `preference === "preferred"`, hard otherwise).
 *
 * "Next" runs both writes in sequence. If the first fails we don't
 * fire the second — keeps the server-side state coherent on a
 * partial network failure.
 */
export function AvailabilityStepScreen() {
  const { goNext } = useOnboardingNav("availability");
  const myStaffQuery = useMyStaff();
  const availabilityQuery = useMyAvailability();
  const updateMyStaff = useUpdateMyStaff();
  const saveAvailability = useSaveMyAvailability();

  const staff = myStaffQuery.data ?? null;
  const serverMin = staff?.minHoursPerWeek ?? 0;
  const serverMax = staff?.maxHoursPerWeek ?? 40;

  const [minHours, setMinHours] = useState(serverMin);
  const [maxHours, setMaxHours] = useState(serverMax);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMinHours(serverMin);
    setMaxHours(serverMax);
  }, [serverMin, serverMax]);

  const serverDays = useMemo(
    () => buildDayStates(availabilityQuery.data ?? []),
    [availabilityQuery.data],
  );
  const [days, setDays] = useState<Record<number, DayState>>(() => serverDays);
  const [openDay, setOpenDay] = useState<number | null>(null);

  useEffect(() => {
    setDays(serverDays);
  }, [serverDays]);

  const clampHours = useCallback(
    (value: number) => Math.max(MIN_HOURS, Math.min(MAX_HOURS, value)),
    [],
  );

  const handleDaySubmit = useCallback(
    (dayOfWeek: number, state: DayState) => {
      setDays((prev) => ({ ...prev, [dayOfWeek]: state }));
      setOpenDay(null);
    },
    [],
  );

  const applyPreset = useCallback((preset: "weekdays" | "weekends" | "clear") => {
    setDays(() => {
      const next: Record<number, DayState> = {};
      for (let d = 0; d <= 6; d++) next[d] = defaultDay();
      if (preset === "clear") return next;
      const daysToSet = preset === "weekdays" ? [1, 2, 3, 4, 5] : [0, 6];
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
  }, []);

  const invalidHours = maxHours < minHours;
  // The scheduler can't place a staff member who hasn't marked any day
  // they can work, so at least one available day is required to advance
  // (the server completion check enforces the same rule as a backstop).
  const noAvailableDays = isAvailabilityEmpty(days);
  const canAdvance = !invalidHours && !noAvailableDays && !submitting;

  const handleNext = useCallback(async () => {
    if (invalidHours) {
      setError("Maximum hours must be at least your minimum hours.");
      return;
    }
    if (noAvailableDays) {
      setError("Select at least one day you can work to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updateMyStaff.mutateAsync({
        minHoursPerWeek: minHours,
        maxHoursPerWeek: maxHours,
      });
      await saveAvailability.mutateAsync(daysToPayload(days));
      goNext();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your availability.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    invalidHours,
    noAvailableDays,
    updateMyStaff,
    saveAvailability,
    minHours,
    maxHours,
    days,
    goNext,
  ]);

  if (myStaffQuery.isLoading || availabilityQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <OnboardingHeader currentStepId="availability" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader currentStepId="availability" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <StyledText variant="title" className="text-2xl mb-1">
          When can you work?
        </StyledText>
        <StyledText variant="caption" className="mb-5 text-sm">
          Set your weekly hours range and the days you&apos;re available.
        </StyledText>

        <StyledText variant="caption" className="uppercase tracking-wider mb-2">
          Weekly hours
        </StyledText>
        <View className="gap-3 mb-6">
          <View>
            <StyledText variant="caption" className="mb-1.5 text-xs">
              Minimum
            </StyledText>
            <HoursStepper
              value={minHours}
              onChange={(next) => setMinHours(clampHours(next))}
              subtitle="Hours per week I'd like to work at least"
              color="muted"
            />
          </View>
          <View>
            <StyledText variant="caption" className="mb-1.5 text-xs">
              Maximum
            </StyledText>
            <HoursStepper
              value={maxHours}
              onChange={(next) => setMaxHours(clampHours(next))}
              subtitle="Hours per week I don't want to exceed"
              color="primary"
            />
          </View>
        </View>

        <StyledText variant="caption" className="uppercase tracking-wider mb-2">
          Weekly availability
        </StyledText>
        <StyledText variant="caption" className="mb-3 text-xs">
          Tap a day to set when you can work. Unselected days are treated
          as unavailable.
        </StyledText>

        <View className="flex-row flex-wrap gap-2 mb-3">
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

        <Button
          title="Next"
          onPress={handleNext}
          loading={submitting}
          disabled={!canAdvance}
          size="lg"
          className="mt-4"
        />
      </ScrollView>

      <DayAvailabilitySheet
        visible={openDay !== null}
        onClose={() => setOpenDay(null)}
        dayLabel={openDay !== null ? DAYS[openDay].label : ""}
        initialState={
          openDay !== null ? (days[openDay] ?? defaultDay()) : defaultDay()
        }
        onSubmit={(next) => {
          if (openDay === null) return;
          handleDaySubmit(openDay, next);
        }}
      />
    </View>
  );
}
