import { useState, useEffect } from "react";
import { View } from "react-native";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

interface NextShiftCardProps {
  shift: ShiftDTO;
}

/**
 * Hero card answering "When do I work next?" with a live countdown.
 */
export function NextShiftCard({ shift }: NextShiftCardProps) {
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(shift.start)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(shift.start));
    }, 1_000);
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

  return (
    <View className="bg-card border border-border rounded-md p-5">
      <View className="flex-row justify-between items-start mb-3">
        <StyledText variant="caption">NEXT SHIFT</StyledText>
        <View className="bg-primary/15 px-2.5 py-1 rounded-sm">
          <StyledText variant="label" className="text-primary text-xs">
            {shift.station}
          </StyledText>
        </View>
      </View>

      <StyledText variant="subtitle" className="mb-1">
        {dayLabel}
      </StyledText>
      <StyledText variant="body" className="text-muted-foreground mb-4">
        {timeRange}
      </StyledText>

      <View className="bg-background rounded-sm px-4 py-3 items-center">
        <StyledText variant="caption" className="mb-0.5">
          STARTS IN
        </StyledText>
        <StyledText variant="title" className="text-primary">
          {countdown}
        </StyledText>
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

function formatCountdown(target: Date): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "Now";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m ${seconds}s`;
}
