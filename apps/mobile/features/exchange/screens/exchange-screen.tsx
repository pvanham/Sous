import { useState, useCallback } from "react";
import { View, Pressable, FlatList } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { AvailableShiftList } from "../components/available-shift-list";
import {
  fetchAvailableShifts,
  fetchMyDroppedShifts,
  pickUpShift,
} from "../api";
import type { ExchangeShift, ExchangeShiftStatus } from "@/types";

type SegmentTab = "available" | "mine";

const STATUS_LABELS: Record<ExchangeShiftStatus, string> = {
  available: "Available",
  pending_coverage: "Pending",
  covered: "Covered",
  manager_approved: "Approved",
};

const STATUS_BADGE_CLASSES: Record<ExchangeShiftStatus, string> = {
  available: "bg-primary/15",
  pending_coverage: "bg-yellow-500/15",
  covered: "bg-blue-500/15",
  manager_approved: "bg-green-500/15",
};

const STATUS_TEXT_CLASSES: Record<ExchangeShiftStatus, string> = {
  available: "text-primary",
  pending_coverage: "text-yellow-600",
  covered: "text-blue-600",
  manager_approved: "text-green-600",
};

export function ExchangeScreen() {
  const [activeTab, setActiveTab] = useState<SegmentTab>("available");
  const [pickingUp, setPickingUp] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const availableQuery = useQuery({
    queryKey: ["exchange", "available"],
    queryFn: fetchAvailableShifts,
  });

  const myDroppedQuery = useQuery({
    queryKey: ["exchange", "mine"],
    queryFn: fetchMyDroppedShifts,
  });

  const pickUpMutation = useMutation({
    mutationFn: pickUpShift,
    onMutate: (shiftId) => setPickingUp(shiftId),
    onSettled: () => {
      setPickingUp(null);
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
    },
  });

  const handlePickUp = useCallback(
    (shiftId: string) => pickUpMutation.mutate(shiftId),
    [pickUpMutation]
  );

  return (
    <ScreenWrapper>
      <StyledText variant="title" className="mb-4 mt-2">
        Shift Exchange
      </StyledText>

      <View className="flex-row bg-card border border-border rounded-md p-1 mb-4">
        <SegmentButton
          label="Available Shifts"
          active={activeTab === "available"}
          onPress={() => setActiveTab("available")}
        />
        <SegmentButton
          label="My Dropped Shifts"
          active={activeTab === "mine"}
          onPress={() => setActiveTab("mine")}
        />
      </View>

      {activeTab === "available" ? (
        <AvailableShiftList
          shifts={availableQuery.data ?? []}
          onPickUp={handlePickUp}
          pickingUp={pickingUp}
        />
      ) : (
        <MyDroppedList
          shifts={myDroppedQuery.data ?? []}
          loading={myDroppedQuery.isLoading}
        />
      )}
    </ScreenWrapper>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2 rounded-sm items-center ${active ? "bg-primary" : ""}`}
    >
      <StyledText
        variant="label"
        className={`text-xs ${active ? "text-primary-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </StyledText>
    </Pressable>
  );
}

function MyDroppedList({
  shifts,
  loading,
}: {
  shifts: ExchangeShift[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <View className="py-12 items-center">
        <StyledText variant="body" className="text-muted-foreground">
          Loading...
        </StyledText>
      </View>
    );
  }

  return (
    <FlatList
      data={shifts}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pb-4"
      renderItem={({ item }) => <DroppedShiftCard shift={item} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="py-12 items-center">
          <StyledText variant="body" className="text-muted-foreground">
            You haven't dropped any shifts.
          </StyledText>
        </View>
      }
    />
  );
}

function DroppedShiftCard({ shift }: { shift: ExchangeShift }) {
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
      <View className="flex-row justify-between items-start">
        <View>
          <StyledText variant="label">{dateLabel}</StyledText>
          <StyledText variant="caption" className="mt-0.5">
            {timeRange} · {shift.station}
          </StyledText>
        </View>
        <View className={`px-2.5 py-1 rounded-sm ${STATUS_BADGE_CLASSES[shift.status]}`}>
          <StyledText
            variant="label"
            className={`text-xs ${STATUS_TEXT_CLASSES[shift.status]}`}
          >
            {STATUS_LABELS[shift.status]}
          </StyledText>
        </View>
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
