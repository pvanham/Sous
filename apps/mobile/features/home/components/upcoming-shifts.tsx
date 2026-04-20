import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

interface UpcomingShiftsProps {
  shifts: ShiftDTO[];
}

interface StationAccent {
  bar: string;
  badgeBg: string;
  badgeText: string;
}

const STATION_STYLES: Record<string, StationAccent> = {
  "Sauté": { bar: "bg-orange-500", badgeBg: "bg-orange-500/15", badgeText: "text-orange-700" },
  Grill: { bar: "bg-red-500", badgeBg: "bg-red-500/15", badgeText: "text-red-700" },
  Prep: { bar: "bg-green-600", badgeBg: "bg-green-600/15", badgeText: "text-green-700" },
  "Garde Manger": { bar: "bg-blue-500", badgeBg: "bg-blue-500/15", badgeText: "text-blue-700" },
  Pastry: { bar: "bg-pink-500", badgeBg: "bg-pink-500/15", badgeText: "text-pink-700" },
  Dish: { bar: "bg-stone-500", badgeBg: "bg-stone-500/15", badgeText: "text-stone-700" },
};

const FALLBACK_STYLE: StationAccent = {
  bar: "bg-primary",
  badgeBg: "bg-primary/15",
  badgeText: "text-primary",
};

/**
 * Compact preview of the next few shifts after the hero "Next shift"
 * card. Gives staff a one-glance view of the rest of their week so
 * they don't need to open the schedule tab to plan the next few days.
 *
 * The caller is responsible for filtering + sorting — this component
 * just renders. A "See all" link routes to the schedule tab so users
 * can drill into the full week.
 */
export function UpcomingShifts({ shifts }: UpcomingShiftsProps) {
  const router = useRouter();

  if (shifts.length === 0) return null;

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between mb-3">
        <StyledText variant="subtitle">Upcoming shifts</StyledText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/schedule")}
          accessibilityRole="button"
          accessibilityLabel="See full schedule"
          hitSlop={8}
          className="flex-row items-center active:opacity-60"
        >
          <StyledText variant="caption" className="text-primary">
            See all
          </StyledText>
          <MaterialIcons name="chevron-right" size={16} color="#b45309" />
        </Pressable>
      </View>

      <View className="gap-2">
        {shifts.map((shift) => (
          <UpcomingRow key={shift.id} shift={shift} />
        ))}
      </View>
    </View>
  );
}

function UpcomingRow({ shift }: { shift: ShiftDTO }) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const style = STATION_STYLES[shift.station] ?? FALLBACK_STYLE;

  const dayLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeRange = `${formatTime(start)} – ${formatTime(end)}`;

  return (
    <View className="flex-row bg-card border border-border rounded-md overflow-hidden">
      <View className={`w-1 ${style.bar}`} />
      <View className="flex-1 flex-row items-center justify-between p-3 pl-3.5">
        <View className="flex-1 pr-3">
          <StyledText variant="label" className="text-sm">
            {dayLabel}
          </StyledText>
          <StyledText variant="caption" className="mt-0.5">
            {timeRange}
          </StyledText>
        </View>
        <View className={`px-2 py-0.5 rounded-sm ${style.badgeBg}`}>
          <StyledText variant="label" className={`text-xs ${style.badgeText}`}>
            {shift.station}
          </StyledText>
        </View>
      </View>
    </View>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
