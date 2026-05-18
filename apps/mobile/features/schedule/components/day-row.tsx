import { View } from "react-native";
import type { ShiftDTO, TimeOffRequestDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import { ShiftCard } from "./shift-card";

interface DayRowProps {
  date: Date;
  shifts: ShiftDTO[];
  isToday: boolean;
  onShiftPress: (shift: ShiftDTO) => void;
  /**
   * Approved or pending time-off requests overlapping this day. The
   * row picks the most relevant one (approved > pending) and renders
   * it as a status pill on otherwise-empty days, so a staff member's
   * planned vacation reads clearly even before any shifts are removed.
   */
  timeOff?: TimeOffRequestDTO[];
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LABELS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Vertical day section in the weekly schedule list. Renders a date
 * "stamp" on the left (weekday + day-of-month) alongside any shifts
 * that fall on this day stacked vertically. When there are no shifts
 * we still render the row so the week reads as a continuous timeline
 * — empty days show a quiet "Off" placeholder rather than disappearing.
 * If the staff member has an approved or pending time-off request
 * overlapping the day, the placeholder upgrades to a status pill.
 */
export function DayRow({
  date,
  shifts,
  isToday,
  onShiftPress,
  timeOff,
}: DayRowProps) {
  const dow = date.getDay();
  const hasShifts = shifts.length > 0;
  const overlay = pickRelevantTimeOff(timeOff);

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
        ) : overlay ? (
          <TimeOffPlaceholder dayLabel={DAY_LABELS[dow]} request={overlay} />
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

/**
 * Pick the most authoritative overlay for the day: an approved request
 * outranks a pending one. If multiple requests have the same status,
 * the first match wins — date-range overlap is the only relevance
 * signal we care about here.
 */
function pickRelevantTimeOff(
  requests: TimeOffRequestDTO[] | undefined,
): TimeOffRequestDTO | null {
  if (!requests || requests.length === 0) return null;
  const approved = requests.find((r) => r.status === "approved");
  if (approved) return approved;
  const pending = requests.find((r) => r.status === "pending");
  return pending ?? null;
}

interface TimeOffPlaceholderProps {
  dayLabel: string;
  request: TimeOffRequestDTO;
}

function TimeOffPlaceholder({ dayLabel, request }: TimeOffPlaceholderProps) {
  const approved = request.status === "approved";
  const label = approved ? "Time off" : "Pending time off";
  return (
    <View
      className={`flex-1 justify-center min-h-[60px] rounded-md px-4 ${
        approved
          ? "bg-primary/10 border border-primary/40"
          : "bg-muted/40 border border-dashed border-primary/40"
      }`}
    >
      <View className="flex-row items-center">
        <View
          className={`w-1 h-4 rounded-full mr-2 ${
            approved ? "bg-primary" : "bg-primary/60"
          }`}
        />
        <StyledText
          variant="caption"
          className={approved ? "text-primary" : "text-muted-foreground"}
        >
          {dayLabel} · {label}
        </StyledText>
      </View>
    </View>
  );
}
