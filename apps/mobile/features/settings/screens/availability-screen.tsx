import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { StaffAvailabilityDTO } from "@sous/types";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "../components/settings-header";
import { useMyStaff } from "@/features/profile/hooks";
import {
  useMyAvailability,
  useSaveMyAvailability,
} from "../hooks";
import { DayAvailabilitySheet } from "../components/day-availability-sheet";
import { defaultDay, type DayState } from "../types";

const ICON_COLOR = "#78716c";

const DAYS: Array<{ id: number; label: string; short: string }> = [
  { id: 0, label: "Sunday", short: "Sun" },
  { id: 1, label: "Monday", short: "Mon" },
  { id: 2, label: "Tuesday", short: "Tue" },
  { id: 3, label: "Wednesday", short: "Wed" },
  { id: 4, label: "Thursday", short: "Thu" },
  { id: 5, label: "Friday", short: "Fri" },
  { id: 6, label: "Saturday", short: "Sat" },
];

const DEFAULT_FROM = "07:00";
const DEFAULT_TO = "23:00";

/**
 * Hydrate the screen's per-day state from the server's availability
 * rows. The server returns at most one "available" / "preferred" row
 * per day; missing days mean "unavailable".
 */
function buildDayStates(
  rows: StaffAvailabilityDTO[],
): Record<number, DayState> {
  const state: Record<number, DayState> = {};
  for (let d = 0; d <= 6; d++) state[d] = defaultDay();
  for (const row of rows) {
    if (row.preference === "unavailable") continue;
    if (!row.availableFrom || !row.availableTo) continue;
    state[row.dayOfWeek] = {
      preference: row.preference,
      availableFrom: row.availableFrom,
      availableTo: row.availableTo,
      notes: row.notes ?? "",
    };
  }
  return state;
}

function daysEqual(a: DayState, b: DayState): boolean {
  return (
    a.preference === b.preference &&
    a.availableFrom === b.availableFrom &&
    a.availableTo === b.availableTo &&
    (a.notes ?? "") === (b.notes ?? "")
  );
}

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
    const payload = Object.entries(days)
      .filter(([, state]) => state.preference !== "unavailable")
      .map(([dayOfWeek, state]) => ({
        dayOfWeek: Number(dayOfWeek),
        availableFrom: state.availableFrom,
        availableTo: state.availableTo,
        preference: state.preference,
        notes: state.notes || undefined,
      }));
    try {
      await saveMutation.mutateAsync(payload);
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
          <PresetChip label="Weekdays" onPress={() => applyPreset("weekdays")} />
          <PresetChip label="Weekends" onPress={() => applyPreset("weekends")} />
          <PresetChip label="Clear all" onPress={() => applyPreset("clear")} />
        </View>

        <View className="bg-card border border-border rounded-md overflow-hidden">
          {DAYS.map((day, index) => (
            <DayRow
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

interface DayRowProps {
  label: string;
  state: DayState;
  onPress: () => void;
  divider?: boolean;
}

function DayRow({ label, state, onPress, divider = false }: DayRowProps) {
  const description = formatRowDescription(state);
  const iconName: React.ComponentProps<typeof MaterialIcons>["name"] =
    state.preference === "preferred"
      ? "star"
      : state.preference === "available"
        ? "check-circle"
        : "radio-button-unchecked";
  const iconColor =
    state.preference === "preferred"
      ? "#f59e0b"
      : state.preference === "available"
        ? "#b45309"
        : ICON_COLOR;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label} availability`}
      className={`flex-row items-center px-4 py-3 active:opacity-80 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <MaterialIcons name={iconName} size={22} color={iconColor} />
      <View className="flex-1 px-3">
        <StyledText variant="body">{label}</StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {description}
        </StyledText>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={ICON_COLOR} />
    </Pressable>
  );
}

function formatRowDescription(state: DayState): string {
  if (state.preference === "unavailable") return "Unavailable";
  if (!state.availableFrom || !state.availableTo) return "No time window set";
  const prefix = state.preference === "preferred" ? "Preferred · " : "";
  return `${prefix}${formatTime(state.availableFrom)} – ${formatTime(state.availableTo)}`;
}

function formatTime(value: string): string {
  const [h, m] = value.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return m === "00" ? `${display}${suffix}` : `${display}:${m}${suffix}`;
}

interface PresetChipProps {
  label: string;
  onPress: () => void;
}

function PresetChip({ label, onPress }: PresetChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="border border-border rounded-full px-3 py-1.5 active:opacity-70"
    >
      <StyledText variant="caption" className="text-foreground">
        {label}
      </StyledText>
    </Pressable>
  );
}
