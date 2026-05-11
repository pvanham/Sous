import { View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import { useWeekStartsOn } from "@/features/auth/store";
import { getWeekStart } from "@/lib/date";

interface WeekStatsCardProps {
  shifts: ShiftDTO[] | undefined;
  loading: boolean;
}

/**
 * "This week" at-a-glance card. Summarises everything the user needs
 * to answer "how busy am I this week?" without opening the schedule
 * tab: shift count, total hours, and the most common station.
 *
 * Only counts shifts whose `start` falls inside the location's
 * configured weekly window (anchored on `KitchenConfig.weekStartsOn`,
 * default Monday) so the card stays aligned with the Schedule tab.
 */
export function WeekStatsCard({ shifts, loading }: WeekStatsCardProps) {
  const weekStartsOn = useWeekStartsOn();
  const stats = computeStats(shifts, weekStartsOn);

  return (
    <View className="bg-card border border-border rounded-md p-4">
      <View className="flex-row items-center justify-between mb-3">
        <StyledText variant="caption" className="uppercase tracking-wider">
          This week
        </StyledText>
        <MaterialIcons name="calendar-today" size={14} color="#78716c" />
      </View>

      <View className="flex-row">
        <StatCell
          value={loading ? "–" : `${stats.count}`}
          label={stats.count === 1 ? "shift" : "shifts"}
        />
        <View className="w-px bg-border mx-3" />
        <StatCell
          value={loading ? "–" : formatHours(stats.hours)}
          label="hours"
        />
        <View className="w-px bg-border mx-3" />
        <StatCell
          value={loading ? "–" : stats.topStation ?? "—"}
          label="top station"
          compact
        />
      </View>
    </View>
  );
}

function StatCell({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <View className="flex-1 items-center">
      <StyledText
        variant="title"
        className={compact ? "text-base" : "text-xl"}
        // NativeWind treats `numberOfLines` via className; inline prop
        // is fine since StyledText forwards through children only.
      >
        {value}
      </StyledText>
      <StyledText variant="caption" className="mt-0.5 lowercase">
        {label}
      </StyledText>
    </View>
  );
}

interface WeekStats {
  count: number;
  hours: number;
  topStation: string | null;
}

function computeStats(
  shifts: ShiftDTO[] | undefined,
  weekStartsOn: import("@sous/types").DayOfWeek,
): WeekStats {
  const list = shifts ?? [];
  const weekStart = getWeekStart(new Date(), weekStartsOn);
  const weekEnd = addDays(weekStart, 7);

  const inWeek = list.filter((shift) => {
    const start = new Date(shift.start).getTime();
    return start >= weekStart.getTime() && start < weekEnd.getTime();
  });

  const hours = inWeek.reduce((acc, shift) => {
    const ms = new Date(shift.end).getTime() - new Date(shift.start).getTime();
    return acc + ms / (1000 * 60 * 60);
  }, 0);

  // Pick the most-worked station this week. Ties are broken by insertion
  // order (Map preserves it) which mirrors the schedule's natural order.
  const stationCounts = new Map<string, number>();
  for (const shift of inWeek) {
    stationCounts.set(shift.station, (stationCounts.get(shift.station) ?? 0) + 1);
  }
  let topStation: string | null = null;
  let topCount = 0;
  for (const [station, count] of stationCounts) {
    if (count > topCount) {
      topStation = station;
      topCount = count;
    }
  }

  return { count: inWeek.length, hours, topStation };
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}
