import { View } from "react-native";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import { ShiftCard } from "./shift-card";

interface DayRowProps {
  date: Date;
  shifts: ShiftDTO[];
  isToday: boolean;
  onShiftPress: (shift: ShiftDTO) => void;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LABELS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Vertical day section in the weekly schedule list. Renders a date
 * "stamp" on the left (weekday + day-of-month) alongside any shifts
 * that fall on this day stacked vertically. When there are no shifts
 * we still render the row so the week reads as a continuous timeline
 * — empty days show a quiet "Off" placeholder rather than disappearing.
 */
export function DayRow({ date, shifts, isToday, onShiftPress }: DayRowProps) {
  const dow = date.getDay();
  const hasShifts = shifts.length > 0;

  return (
    <View className="flex-row">
      <View className="w-14 items-center pt-1">
        <View
          className={`w-12 rounded-md py-1.5 items-center ${
            isToday ? "bg-primary" : hasShifts ? "bg-accent" : "bg-transparent"
          }`}
        >
          <StyledText
            variant="caption"
            className={
              isToday
                ? "text-primary-foreground"
                : hasShifts
                  ? "text-accent-foreground"
                  : "text-muted-foreground"
            }
          >
            {DAY_LABELS_SHORT[dow]}
          </StyledText>
          <StyledText
            variant="title"
            className={`text-2xl leading-7 ${
              isToday
                ? "text-primary-foreground"
                : hasShifts
                  ? "text-accent-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {date.getDate()}
          </StyledText>
        </View>
      </View>

      <View className="flex-1 ml-3">
        {hasShifts ? (
          <View className="gap-2">
            {shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} onPress={onShiftPress} />
            ))}
          </View>
        ) : (
          <View className="flex-1 justify-center min-h-[60px] bg-muted/40 rounded-md px-4 border border-border/60">
            <View className="flex-row items-center">
              <View className="w-1 h-4 bg-muted-foreground/40 rounded-full mr-2" />
              <StyledText variant="caption" className="text-muted-foreground">
                {DAY_LABELS[dow]} · Off
              </StyledText>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
