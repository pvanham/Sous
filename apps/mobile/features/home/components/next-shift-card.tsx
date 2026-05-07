import { useState, useEffect } from "react";
import { View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

interface NextShiftCardProps {
  shift: ShiftDTO;
}

interface StationAccent {
  bar: string;
  badgeBg: string;
  badgeText: string;
}

// Keep the station palette aligned with `schedule/components/shift-card.tsx`
// so the same station looks identical wherever it appears.
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
 * Hero "your next shift" card. Designed to feel calm and scannable
 * rather than frantic — the previous version counted down to the
 * second, which is great for two minutes before a shift and visually
 * noisy for anything farther out. Now the card leads with a natural-
 * language relative phrase ("Starts in 3 hours", "Tomorrow"), keeps
 * the exact day and time range prominent, and surfaces duration and
 * station alongside a coloured accent bar.
 */
export function NextShiftCard({ shift }: NextShiftCardProps) {
  const [relative, setRelative] = useState(() => formatRelative(shift.start));

  // Re-render the relative label once per minute. A per-second tick is
  // visually noisy and burns battery for no reader benefit — the only
  // time sub-minute precision matters is in the last minute before a
  // shift, which the "Starts in <1m" bucket already handles.
  useEffect(() => {
    const interval = setInterval(() => {
      setRelative(formatRelative(shift.start));
    }, 30_000);
    return () => clearInterval(interval);
  }, [shift.start]);

  const startDate = new Date(shift.start);
  const endDate = new Date(shift.end);

  const dayLabel = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const timeRange = `${formatTime(startDate)} – ${formatTime(endDate)}`;
  const durationHours = round1(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60),
  );
  const style = STATION_STYLES[shift.station] ?? FALLBACK_STYLE;

  return (
    <View className="bg-card border border-border rounded-md overflow-hidden flex-row">
      <View className={`w-1.5 ${style.bar}`} />
      <View className="flex-1 p-5">
        <View className="flex-row justify-between items-start mb-3">
          <StyledText variant="caption" className="uppercase tracking-wider">
            Next shift
          </StyledText>
          <View className={`px-2.5 py-1 rounded-sm ${style.badgeBg}`}>
            <StyledText variant="label" className={`text-xs ${style.badgeText}`}>
              {shift.station}
            </StyledText>
          </View>
        </View>

        <StyledText variant="title" className="text-2xl mb-0.5">
          {dayLabel}
        </StyledText>
        <StyledText variant="body" className="text-muted-foreground mb-4">
          {`${timeRange}  ·  ${durationHours}h`}
        </StyledText>

        <View className="flex-row items-center bg-background rounded-sm px-3 py-2.5">
          <MaterialIcons name="schedule" size={16} color="#b45309" />
          <StyledText variant="label" className="text-primary ml-2 text-sm">
            {relative}
          </StyledText>
        </View>

        {shift.notes ? (
          <View className="flex-row mt-3 pt-3 border-t border-border">
            <MaterialIcons
              name="sticky-note-2"
              size={14}
              color="#78716c"
              style={{ marginTop: 2 }}
            />
            <StyledText variant="caption" className="ml-1.5 flex-1 italic">
              {shift.notes}
            </StyledText>
          </View>
        ) : null}
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

function round1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * Natural-language "time to shift" phrase. Buckets the distance the way
 * a human would: anything in the current or next minute collapses to
 * "Starting now" / "Starts in <1m"; longer lead times escalate through
 * minutes → hours → days → weeks. The active-shift state ("In progress")
 * is rendered here rather than at the call site so the hero card stays
 * useful during a shift without needing extra state from the screen.
 */
function formatRelative(target: Date): string {
  const diffMs = new Date(target).getTime() - Date.now();

  if (diffMs <= 0) return "In progress";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  if (totalMinutes < 1) return "Starts in <1m";
  if (totalMinutes < 60) {
    return `Starts in ${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes > 0
      ? `Starts in ${totalHours}h ${minutes}m`
      : `Starts in ${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  if (days === 1) return "Starts tomorrow";
  if (days < 7) return `Starts in ${days} days`;

  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "Starts in 1 week" : `Starts in ${weeks} weeks`;
}
