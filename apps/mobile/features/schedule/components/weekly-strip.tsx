import { View, FlatList, Pressable } from "react-native";
import { StyledText } from "@/components/ui/text";

interface WeeklyStripProps {
  weekStart: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** Dates (ISO date strings) that have at least one shift */
  shiftDates: Set<string>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Horizontal scrolling strip showing 7 days of the current week.
 * Highlights the selected day and shows a dot for days with shifts.
 */
export function WeeklyStrip({
  weekStart,
  selectedDate,
  onSelectDate,
  shiftDates,
}: WeeklyStripProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  const selectedIso = toIsoDate(selectedDate);

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={days}
      keyExtractor={(d) => d.toISOString()}
      contentContainerClassName="gap-2"
      renderItem={({ item: date }) => {
        const iso = toIsoDate(date);
        const isSelected = iso === selectedIso;
        const hasShift = shiftDates.has(iso);
        const isToday = iso === toIsoDate(new Date());

        return (
          <Pressable
            onPress={() => onSelectDate(date)}
            className={`items-center px-3.5 py-2.5 rounded-md min-w-[52px] ${
              isSelected ? "bg-primary" : "bg-card border border-border"
            }`}
          >
            <StyledText
              variant="caption"
              className={isSelected ? "text-primary-foreground" : "text-muted-foreground"}
            >
              {DAY_LABELS[date.getDay()]}
            </StyledText>
            <StyledText
              variant="label"
              className={`text-lg mt-0.5 ${
                isSelected
                  ? "text-primary-foreground"
                  : isToday
                    ? "text-primary"
                    : "text-foreground"
              }`}
            >
              {date.getDate()}
            </StyledText>
            {hasShift ? (
              <View
                className={`w-1.5 h-1.5 rounded-full mt-1 ${
                  isSelected ? "bg-primary-foreground" : "bg-primary"
                }`}
              />
            ) : (
              <View className="w-1.5 h-1.5 mt-1" />
            )}
          </Pressable>
        );
      }}
    />
  );
}

function toIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
