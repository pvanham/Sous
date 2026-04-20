import { useState, useCallback, useMemo } from "react";
import { View, Pressable, FlatList, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { ShiftDTO } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { AvailableShiftList } from "../components/available-shift-list";
import { ProposeExchangeModal } from "../components/propose-exchange-modal";
import {
  dropShift,
  fetchAvailableShifts,
  fetchMyDroppedShifts,
  pickUpShift,
} from "../api";
import { fetchWeekShifts } from "@/features/schedule/api";
import type { ExchangeShift, ExchangeShiftStatus } from "@/types";

type SegmentTab = "available" | "mine";

const STATUS_LABELS: Record<ExchangeShiftStatus, string> = {
  available: "Available",
  pending_coverage: "Pending",
  covered: "Covered",
  manager_approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASSES: Record<ExchangeShiftStatus, string> = {
  available: "bg-primary/15",
  pending_coverage: "bg-yellow-500/15",
  covered: "bg-blue-500/15",
  manager_approved: "bg-green-500/15",
  denied: "bg-red-500/15",
  cancelled: "bg-muted",
};

const STATUS_TEXT_CLASSES: Record<ExchangeShiftStatus, string> = {
  available: "text-primary",
  pending_coverage: "text-yellow-600",
  covered: "text-blue-600",
  manager_approved: "text-green-600",
  denied: "text-red-600",
  cancelled: "text-muted-foreground",
};

// Statuses that still occupy the exchange board and should exclude
// a shift from the "can be dropped" picker. Anything terminal
// (covered / denied / cancelled / manager_approved) is fine to re-drop
// only conceptually — but in practice the shift's ownership has moved,
// so it wouldn't appear in the caller's upcoming list anyway.
const OPEN_DROP_STATUSES: ExchangeShiftStatus[] = [
  "available",
  "pending_coverage",
];

export function ExchangeScreen() {
  const [activeTab, setActiveTab] = useState<SegmentTab>("available");
  const [pickingUp, setPickingUp] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const queryClient = useQueryClient();

  const availableQuery = useQuery({
    queryKey: ["exchange", "available"],
    queryFn: fetchAvailableShifts,
  });

  const myDroppedQuery = useQuery({
    queryKey: ["exchange", "mine"],
    queryFn: fetchMyDroppedShifts,
  });

  const { currentWeekStart, nextWeekStart, currentWeekIso, nextWeekIso } =
    useMemo(() => {
      const today = new Date();
      const current = getWeekStart(today);
      const next = addDays(current, 7);
      return {
        currentWeekStart: current,
        nextWeekStart: next,
        currentWeekIso: toIsoDate(current),
        nextWeekIso: toIsoDate(next),
      };
    }, []);

  const currentWeekQuery = useQuery({
    queryKey: ["schedule", "week", currentWeekIso],
    queryFn: () => fetchWeekShifts(currentWeekStart),
    enabled: proposeOpen,
  });

  const nextWeekQuery = useQuery({
    queryKey: ["schedule", "week", nextWeekIso],
    queryFn: () => fetchWeekShifts(nextWeekStart),
    enabled: proposeOpen,
  });

  const droppableShifts = useMemo<ShiftDTO[]>(() => {
    const now = Date.now();
    const alreadyDropped = new Set(
      (myDroppedQuery.data ?? [])
        .filter((row) => OPEN_DROP_STATUSES.includes(row.status))
        .map((row) => row.shiftId),
    );
    const combined = [
      ...(currentWeekQuery.data ?? []),
      ...(nextWeekQuery.data ?? []),
    ];
    return combined
      .filter((shift) => new Date(shift.start).getTime() > now)
      .filter((shift) => !alreadyDropped.has(shift.id))
      .sort(
        (a, b) =>
          new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [currentWeekQuery.data, nextWeekQuery.data, myDroppedQuery.data]);

  const pickUpMutation = useMutation({
    mutationFn: pickUpShift,
    onMutate: (shiftId) => setPickingUp(shiftId),
    onSettled: () => {
      setPickingUp(null);
      // Pickup mutates BOTH the exchange board (the row leaves
      // `available` and joins someone's "covered" history) AND the
      // caller's weekly schedule (a new shift was added). Invalidate
      // both query trees so the schedule tab re-fetches next time
      // it mounts and any open exchange queries refresh now.
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  const dropMutation = useMutation({
    mutationFn: ({ shiftId, reason }: { shiftId: string; reason?: string }) =>
      dropShift(shiftId, { reason }),
    onSuccess: () => {
      setProposeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (error: unknown) => {
      const message =
        isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : error instanceof Error
            ? error.message
            : "Could not propose shift exchange. Please try again.";
      Alert.alert("Exchange", message);
    },
  });

  const handlePickUp = useCallback(
    (shiftId: string) => pickUpMutation.mutate(shiftId),
    [pickUpMutation],
  );

  const handleProposeSubmit = useCallback(
    (input: { shiftId: string; reason?: string }) =>
      dropMutation.mutate(input),
    [dropMutation],
  );

  const upcomingLoading =
    currentWeekQuery.isLoading ||
    nextWeekQuery.isLoading ||
    myDroppedQuery.isLoading;

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

      {/* FAB — mirrors the time-off tab's bottom-right + */}
      <Pressable
        onPress={() => setProposeOpen(true)}
        className="absolute bottom-6 right-4 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
        style={{ elevation: 4 }}
      >
        <StyledText
          variant="title"
          className="text-primary-foreground text-2xl leading-none"
        >
          +
        </StyledText>
      </Pressable>

      <ProposeExchangeModal
        visible={proposeOpen}
        onClose={() => setProposeOpen(false)}
        onSubmit={handleProposeSubmit}
        submitting={dropMutation.isPending}
        shifts={droppableShifts}
        loading={upcomingLoading}
      />
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
            You haven&apos;t dropped any shifts.
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
        <View
          className={`px-2.5 py-1 rounded-sm ${STATUS_BADGE_CLASSES[shift.status]}`}
        >
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

/** Returns the most recent Sunday at midnight in local time. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

/**
 * Format `date` as a YYYY-MM-DD calendar date in UTC so the query key
 * and the `weekStart` URL parameter stay in lockstep with the
 * schedule tab's convention (see `fetchWeekShifts`).
 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
