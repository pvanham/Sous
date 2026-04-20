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

/**
 * Build a compact, locale-aware label for a 7-day range.
 *
 * - Same month  → "Apr 19 – 25, 2026"
 * - Same year   → "Dec 28 – Jan 3, 2026"
 * - Year change → "Dec 28, 2025 – Jan 3, 2026"
 *
 * We assemble pieces by hand because Intl.DateTimeFormat in en-US
 * renders `{ day, year }` without a month as the verbose long form
 * (e.g. "2026 (day: 25)"), which is unreadable in a header.
 */
function formatRange(start: Date, end: Date): string {
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const month = start.toLocaleDateString("en-US", { month: "short" });
    return `${month} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (sameYear) {
    const startPart = start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endPart = end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${startPart} – ${endPart}, ${end.getFullYear()}`;
  }

  const startPart = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endPart = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startPart} – ${endPart}`;
}
