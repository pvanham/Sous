import { View, FlatList } from "react-native";
import type { ExchangeShift } from "@/types";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

interface AvailableShiftListProps {
  shifts: ExchangeShift[];
  onPickUp: (shiftId: string) => void;
  pickingUp: string | null;
}

/**
 * List of shifts that other staff have dropped and are available for pickup.
 */
export function AvailableShiftList({
  shifts,
  onPickUp,
  pickingUp,
}: AvailableShiftListProps) {
  return (
    <FlatList
      data={shifts}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pb-4"
      renderItem={({ item }) => (
        <AvailableShiftCard
          shift={item}
          onPickUp={onPickUp}
          loading={pickingUp === item.id}
        />
      )}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="py-12 items-center">
          <StyledText variant="body" className="text-muted-foreground">
            No shifts available for pickup.
          </StyledText>
        </View>
      }
    />
  );
}

function AvailableShiftCard({
  shift,
  onPickUp,
  loading,
}: {
  shift: ExchangeShift;
  onPickUp: (id: string) => void;
  loading: boolean;
}) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);

  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const timeRange = `${formatTime(start)} – ${formatTime(end)}`;

  return (
    <View className="bg-card border border-border rounded-md p-4">
      <View className="flex-row justify-between items-start mb-2">
        <View>
          <StyledText variant="label">{dateLabel}</StyledText>
          <StyledText variant="caption" className="mt-0.5">
            {timeRange}
          </StyledText>
        </View>
        <View className="bg-primary/15 px-2.5 py-1 rounded-sm">
          <StyledText variant="label" className="text-primary text-xs">
            {shift.station}
          </StyledText>
        </View>
      </View>

      <StyledText variant="caption" className="mb-3">
        Dropped by {shift.droppedByName}
      </StyledText>

      <Button
        title="Pick Up"
        onPress={() => onPickUp(shift.id)}
        loading={loading}
        size="sm"
      />
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
