import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

interface ShiftCardProps {
  shift: ShiftDTO;
  onPress: (shift: ShiftDTO) => void;
}

interface StationStyle {
  /** Tailwind class for the left accent bar */
  bar: string;
  /** Tailwind class for the station badge background tint */
  badgeBg: string;
  /** Tailwind class for the station badge label colour */
  badgeText: string;
}

const STATION_STYLES: Record<string, StationStyle> = {
  "Sauté": { bar: "bg-orange-500", badgeBg: "bg-orange-500/15", badgeText: "text-orange-700" },
  "Grill": { bar: "bg-red-500", badgeBg: "bg-red-500/15", badgeText: "text-red-700" },
  "Prep": { bar: "bg-green-600", badgeBg: "bg-green-600/15", badgeText: "text-green-700" },
  "Garde Manger": { bar: "bg-blue-500", badgeBg: "bg-blue-500/15", badgeText: "text-blue-700" },
  "Pastry": { bar: "bg-pink-500", badgeBg: "bg-pink-500/15", badgeText: "text-pink-700" },
  "Dish": { bar: "bg-stone-500", badgeBg: "bg-stone-500/15", badgeText: "text-stone-700" },
};

const FALLBACK_STYLE: StationStyle = {
  bar: "bg-primary",
  badgeBg: "bg-primary/15",
  badgeText: "text-primary",
};

/**
 * Vertical shift card. Renders inside a `DayRow` and is optimized for
 * scanning a stack of shifts on a phone screen: a chunky station accent
 * bar on the left, a large legible time range, and a station badge
 * pinned to the top-right. Tapping opens the roster modal.
 */
export function ShiftCard({ shift, onPress }: ShiftCardProps) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const durationHours = round1((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  const style = STATION_STYLES[shift.station] ?? FALLBACK_STYLE;

  return (
    <Pressable
      onPress={() => onPress(shift)}
      accessibilityRole="button"
      accessibilityLabel={`${shift.station} shift, ${formatTime(start)} to ${formatTime(end)}`}
      className="flex-row bg-card border border-border rounded-md overflow-hidden active:opacity-80"
    >
      <View className={`w-1.5 ${style.bar}`} />
      <View className="flex-1 p-4">
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-3">
            <StyledText variant="subtitle" className="text-base">
              {formatTime(start)} – {formatTime(end)}
            </StyledText>
            <View className="flex-row items-center mt-1">
              <MaterialIcons name="schedule" size={13} color="#78716c" />
              <StyledText variant="caption" className="ml-1">
                {durationHours}h shift
              </StyledText>
            </View>
          </View>
          <View className={`px-2.5 py-1 rounded-sm ${style.badgeBg}`}>
            <StyledText variant="label" className={`text-xs ${style.badgeText}`}>
              {shift.station}
            </StyledText>
          </View>
        </View>
        {shift.notes ? (
          <View className="flex-row mt-3 pt-3 border-t border-border">
            <MaterialIcons name="sticky-note-2" size={13} color="#78716c" style={{ marginTop: 2 }} />
            <StyledText variant="caption" className="ml-1.5 flex-1 italic">
              {shift.notes}
            </StyledText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function round1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
