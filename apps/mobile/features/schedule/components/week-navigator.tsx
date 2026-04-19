import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyledText } from "@/components/ui/text";

interface WeekNavigatorProps {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onJumpToCurrent: () => void;
  isCurrentWeek: boolean;
}

/**
 * Header row for the schedule screen. Shows the visible week's date range
 * with previous / next chevrons. When the user is browsing a non-current
 * week we surface a "Today" pill that snaps back to the current week so
 * staff never get lost paging through the calendar.
 */
export function WeekNavigator({
  weekStart,
  onPrev,
  onNext,
  onJumpToCurrent,
  isCurrentWeek,
}: WeekNavigatorProps) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <View className="flex-row items-center justify-between mb-4">
      <Pressable
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel="Previous week"
        hitSlop={8}
        className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:opacity-60"
      >
        <MaterialIcons name="chevron-left" size={22} color="#78716c" />
      </Pressable>

      <Pressable
        onPress={onJumpToCurrent}
        disabled={isCurrentWeek}
        accessibilityRole="button"
        accessibilityLabel="Jump to current week"
        className="flex-1 mx-3 items-center active:opacity-60"
      >
        <StyledText variant="caption">
          {isCurrentWeek ? "THIS WEEK" : "WEEK OF"}
        </StyledText>
        <StyledText variant="subtitle" className="mt-0.5">
          {formatRange(weekStart, weekEnd)}
        </StyledText>
      </Pressable>

      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Next week"
        hitSlop={8}
        className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:opacity-60"
      >
        <MaterialIcons name="chevron-right" size={22} color="#78716c" />
      </Pressable>
    </View>
  );
}

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const startFmt: Intl.DateTimeFormatOptions = sameMonth
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric" };
  const endFmt: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString("en-US", startFmt)} – ${end.toLocaleDateString("en-US", endFmt)}`;
}
