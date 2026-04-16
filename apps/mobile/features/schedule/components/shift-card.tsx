import { View, Pressable } from "react-native";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

interface ShiftCardProps {
  shift: ShiftDTO;
  onPress: (shift: ShiftDTO) => void;
}

const STATION_COLORS: Record<string, string> = {
  "Sauté": "border-l-orange-500",
  "Grill": "border-l-red-500",
  "Prep": "border-l-green-500",
  "Garde Manger": "border-l-blue-500",
  "Pastry": "border-l-pink-500",
  "Dish": "border-l-gray-400",
};

/**
 * Tappable shift card. Color-coded left border per station.
 * Tap to open the roster modal for this shift.
 */
export function ShiftCard({ shift, onPress }: ShiftCardProps) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  const borderColor =
    STATION_COLORS[shift.station] ?? "border-l-muted-foreground";

  return (
    <Pressable
      onPress={() => onPress(shift)}
      className={`bg-card border border-border rounded-md p-4 border-l-4 ${borderColor} active:opacity-80`}
    >
      <View className="flex-row justify-between items-start">
        <View>
          <StyledText variant="label">
            {formatTime(start)} – {formatTime(end)}
          </StyledText>
          <StyledText variant="caption" className="mt-0.5">
            {durationHours}h shift
          </StyledText>
        </View>
        <View className="bg-primary/15 px-2.5 py-1 rounded-sm">
          <StyledText variant="label" className="text-primary text-xs">
            {shift.station}
          </StyledText>
        </View>
      </View>
      {shift.notes ? (
        <StyledText variant="caption" className="mt-2 italic">
          {shift.notes}
        </StyledText>
      ) : null}
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
