import { useState, useMemo, useCallback } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ShiftDTO } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { WeekNavigator } from "../components/week-navigator";
import { DayRow } from "../components/day-row";
import { RosterModal } from "../components/roster-modal";
import { fetchWeekShifts, fetchShiftRoster } from "../api";

/**
 * Schedule tab screen.
 *
 * The layout is vertical and phone-first: a sticky week navigator at
 * the top lets the user page back and forth one week at a time and
 * surfaces a "Today" pill when they're browsing a non-current week.
 * Below it, all seven days of the visible week are rendered as a
 * stacked list so the entire week is scannable in a single scroll —
 * no horizontal swiping or hidden state.
 *
 * Server state via TanStack Query:
 *   - `["schedule","week", <iso>]` → caller's shifts for the visible
 *     week. Re-keyed when the user pages weeks.
 *   - `["schedule","roster", <shiftId>]` → roster for a tapped shift.
 *     Disabled until the user actually opens a roster.
 *
 * Query keys follow the convention documented in
 * `docs/architecture/08-mobile-architecture.md §8`. Mutations on the
 * Exchange tab will invalidate `["schedule"]` to keep these views in
 * sync after a drop / pickup.
 */
export function ScheduleScreen() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const currentWeekStart = useMemo(() => getWeekStart(today), [today]);
  const [weekStart, setWeekStart] = useState<Date>(currentWeekStart);
  const [rosterShift, setRosterShift] = useState<ShiftDTO | null>(null);

  const weekStartIso = useMemo(
    () => weekStart.toISOString().split("T")[0],
    [weekStart],
  );

  const shiftsQuery = useQuery({
    queryKey: ["schedule", "week", weekStartIso],
    queryFn: () => fetchWeekShifts(weekStart),
  });

  const rosterQuery = useQuery({
    queryKey: ["schedule", "roster", rosterShift?.id ?? null],
    queryFn: () => fetchShiftRoster(rosterShift!.id),
    enabled: rosterShift !== null,
  });

  const days = useMemo(() => buildWeek(weekStart), [weekStart]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftDTO[]>();
    for (const shift of shiftsQuery.data ?? []) {
      const iso = toIsoDate(new Date(shift.start));
      const bucket = map.get(iso);
      if (bucket) {
        bucket.push(shift);
      } else {
        map.set(iso, [shift]);
      }
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    }
    return map;
  }, [shiftsQuery.data]);

  const summary = useMemo(() => {
    const shifts = shiftsQuery.data ?? [];
    const totalHours = shifts.reduce((acc, s) => {
      const ms = new Date(s.end).getTime() - new Date(s.start).getTime();
      return acc + ms / (1000 * 60 * 60);
    }, 0);
    return { count: shifts.length, hours: totalHours };
  }, [shiftsQuery.data]);

  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  const handlePrevWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);

  const handleJumpToToday = useCallback(() => {
    setWeekStart(currentWeekStart);
  }, [currentWeekStart]);

  const handleShiftPress = useCallback((shift: ShiftDTO) => {
    setRosterShift(shift);
  }, []);

  const rosterLabel = rosterShift
    ? `${new Date(rosterShift.start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })} · ${rosterShift.station}`
    : "";

  return (
    <ScreenWrapper>
      <StyledText variant="title" className="mb-4 mt-2">
        Schedule
      </StyledText>

      <WeekNavigator
        weekStart={weekStart}
        onPrev={handlePrevWeek}
        onNext={handleNextWeek}
        onJumpToCurrent={handleJumpToToday}
        isCurrentWeek={isCurrentWeek}
      />

      <WeekSummary
        loading={shiftsQuery.isLoading}
        error={shiftsQuery.isError}
        count={summary.count}
        hours={summary.hours}
      />

      {shiftsQuery.isLoading ? (
        <View className="py-12 items-center">
          <ActivityIndicator size="large" />
        </View>
      ) : shiftsQuery.isError ? (
        <View className="py-12 items-center">
          <StyledText variant="body" className="text-destructive">
            Couldn&apos;t load your schedule.
          </StyledText>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3 pb-8 pt-2"
          showsVerticalScrollIndicator={false}
        >
          {days.map((date) => {
            const iso = toIsoDate(date);
            return (
              <DayRow
                key={iso}
                date={date}
                shifts={shiftsByDay.get(iso) ?? []}
                isToday={iso === todayIso}
                onShiftPress={handleShiftPress}
              />
            );
          })}
        </ScrollView>
      )}

      <RosterModal
        visible={rosterShift !== null}
        onClose={() => setRosterShift(null)}
        shiftLabel={rosterLabel}
        roster={rosterQuery.data ?? []}
        loading={rosterQuery.isLoading || rosterQuery.isFetching}
      />
    </ScreenWrapper>
  );
}

interface WeekSummaryProps {
  loading: boolean;
  error: boolean;
  count: number;
  hours: number;
}

function WeekSummary({ loading, error, count, hours }: WeekSummaryProps) {
  if (loading || error) {
    return <View className="h-px bg-border mb-1" />;
  }

  const hoursLabel = formatHours(hours);
  const summaryText =
    count === 0
      ? "No shifts scheduled"
      : `${count} ${count === 1 ? "shift" : "shifts"} · ${hoursLabel}`;

  return (
    <View className="flex-row items-center mb-1">
      <View className="flex-1 h-px bg-border" />
      <StyledText variant="caption" className="mx-3 uppercase tracking-wider">
        {summaryText}
      </StyledText>
      <View className="flex-1 h-px bg-border" />
    </View>
  );
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const display = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return `${display}h`;
}

/** Returns the most recent Sunday at midnight (local time). */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

/**
 * Format `date` as a `YYYY-MM-DD` calendar date in the device's local
 * timezone. Using local components (rather than `toISOString()`)
 * keeps day bucketing correct in timezones whose offset crosses a
 * date boundary at midnight (e.g. JST/UTC).
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
