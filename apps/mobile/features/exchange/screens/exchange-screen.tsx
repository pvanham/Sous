import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactElement,
} from "react";
import {
  View,
  Pressable,
  FlatList,
  Alert,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { isAxiosError } from "axios";
import type { ShiftDTO } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { AvailableShiftList } from "../components/available-shift-list";
import { ProposeExchangeModal } from "../components/propose-exchange-modal";
import {
  cancelOwnDrop,
  dropShift,
  fetchAvailableShifts,
  fetchMyDroppedShifts,
  fetchMyPickups,
  pickUpShift,
  withdrawPickup,
} from "../api";
import { useExchangeLastSeen } from "../last-seen-store";
import { fetchWeekShifts } from "@/features/schedule/api";
import { useWeekStartsOn } from "@/features/auth/store";
import { getWeekStart } from "@/lib/date";
import type { ExchangeShift, ExchangeShiftStatus } from "@/types";

type SegmentTab = "available" | "mine" | "pickups";

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

// Terminal statuses that represent a manager decision on a row. Used
// to surface an "a manager responded since your last visit" banner
// the next time the user opens the tab.
const DECISION_STATUSES: ExchangeShiftStatus[] = [
  "manager_approved",
  "denied",
  "cancelled",
];

export function ExchangeScreen() {
  const [activeTab, setActiveTab] = useState<SegmentTab>("available");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const queryClient = useQueryClient();
  // Scope every query key by Clerk `userId` so cross-user cache bleed
  // is impossible even if a future sign-out path forgets to call
  // `queryClient.clear()`. Prefix-based invalidations below still
  // work because `userId` is a later segment.
  const { userId } = useAuth();
  const { lastSeenAt, markSeen, hasHydrated } = useExchangeLastSeen();

  const availableQuery = useQuery({
    queryKey: ["exchange", userId, "available"],
    queryFn: fetchAvailableShifts,
    enabled: Boolean(userId),
  });

  const myDroppedQuery = useQuery({
    queryKey: ["exchange", userId, "mine"],
    queryFn: fetchMyDroppedShifts,
    enabled: Boolean(userId),
  });

  const myPickupsQuery = useQuery({
    queryKey: ["exchange", userId, "pickups"],
    queryFn: fetchMyPickups,
    enabled: Boolean(userId),
  });

  // Snapshot the banner data once per visit (using a ref-like state
  // so `markSeen()` below doesn't immediately erase the banner).
  // `bannerSeenAt` latches to the mount-time `lastSeenAt` and only
  // updates on unmount so the banner stays visible for the whole
  // visit rather than disappearing the instant we record the visit.
  const [bannerBaseline, setBannerBaseline] = useState<number | null>(null);
  useEffect(() => {
    if (!hasHydrated) return;
    setBannerBaseline(lastSeenAt);
    markSeen();
    // Intentionally run once on mount after hydration — subsequent
    // query refetches should not rebaseline the banner mid-visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  const freshDecisions = useMemo<ExchangeShift[]>(() => {
    if (!hasHydrated) return [];
    const rows = [
      ...(myDroppedQuery.data ?? []),
      ...(myPickupsQuery.data ?? []),
    ];
    return rows.filter((r) => {
      if (!DECISION_STATUSES.includes(r.status)) return false;
      if (bannerBaseline === null) return false;
      return new Date(r.updatedAt).getTime() > bannerBaseline;
    });
  }, [hasHydrated, bannerBaseline, myDroppedQuery.data, myPickupsQuery.data]);

  const weekStartsOn = useWeekStartsOn();
  const { currentWeekStart, nextWeekStart, currentWeekIso, nextWeekIso } =
    useMemo(() => {
      const today = new Date();
      const current = getWeekStart(today, weekStartsOn);
      const next = addDays(current, 7);
      return {
        currentWeekStart: current,
        nextWeekStart: next,
        currentWeekIso: toIsoDate(current),
        nextWeekIso: toIsoDate(next),
      };
    }, [weekStartsOn]);

  const currentWeekQuery = useQuery({
    queryKey: ["schedule", userId, "week", currentWeekIso],
    queryFn: () => fetchWeekShifts(currentWeekStart),
    enabled: proposeOpen && Boolean(userId),
  });

  const nextWeekQuery = useQuery({
    queryKey: ["schedule", userId, "week", nextWeekIso],
    queryFn: () => fetchWeekShifts(nextWeekStart),
    enabled: proposeOpen && Boolean(userId),
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

  const invalidateExchangeAndSchedule = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["exchange"] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
  }, [queryClient]);

  const reportMutationError = useCallback((error: unknown) => {
    const message =
      isAxiosError(error) && typeof error.response?.data?.error === "string"
        ? error.response.data.error
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
    Alert.alert("Exchange", message);
  }, []);

  const pickUpMutation = useMutation({
    mutationFn: pickUpShift,
    onMutate: (shiftId) => setBusyId(shiftId),
    onSuccess: () => {
      Alert.alert(
        "Pickup submitted",
        "Waiting on a manager to approve. The shift will appear on your schedule once it's official.",
      );
      // Move the user over to the pickups tab so they can see the
      // row they just claimed — without this, tapping Pick Up looks
      // like the row silently vanished.
      setActiveTab("pickups");
    },
    onError: reportMutationError,
    // Pickup mutates BOTH the exchange board (the row leaves
    // `available` and joins someone's pickups list) AND potentially
    // the caller's weekly schedule (on eventual approval).
    // Invalidate both query trees so the schedule tab re-fetches
    // next time it mounts and any open exchange queries refresh now.
    onSettled: () => {
      setBusyId(null);
      invalidateExchangeAndSchedule();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawPickup,
    onMutate: (shiftId) => setBusyId(shiftId),
    onSuccess: () =>
      Alert.alert(
        "Pickup withdrawn",
        "The shift is back on the exchange board.",
      ),
    onError: reportMutationError,
    onSettled: () => {
      setBusyId(null);
      invalidateExchangeAndSchedule();
    },
  });

  const cancelDropMutation = useMutation({
    mutationFn: cancelOwnDrop,
    onMutate: (shiftId) => setBusyId(shiftId),
    onSuccess: () =>
      Alert.alert(
        "Drop cancelled",
        "Your shift is no longer on the exchange board.",
      ),
    onError: reportMutationError,
    onSettled: () => {
      setBusyId(null);
      invalidateExchangeAndSchedule();
    },
  });

  const dropMutation = useMutation({
    mutationFn: ({ shiftId, reason }: { shiftId: string; reason?: string }) =>
      dropShift(shiftId, { reason }),
    onSuccess: () => {
      setProposeOpen(false);
      invalidateExchangeAndSchedule();
    },
    onError: reportMutationError,
  });

  const handlePickUp = useCallback(
    (shiftId: string) => pickUpMutation.mutate(shiftId),
    [pickUpMutation],
  );

  const handleWithdraw = useCallback(
    (exchangeId: string) =>
      Alert.alert(
        "Withdraw pickup?",
        "The shift will go back on the exchange board and someone else can claim it.",
        [
          { text: "Keep pending", style: "cancel" },
          {
            text: "Withdraw",
            style: "destructive",
            onPress: () => withdrawMutation.mutate(exchangeId),
          },
        ],
      ),
    [withdrawMutation],
  );

  const handleCancelDrop = useCallback(
    (exchangeId: string) =>
      Alert.alert(
        "Cancel drop?",
        "The shift stays on your schedule and will no longer appear on the exchange board.",
        [
          { text: "Keep on board", style: "cancel" },
          {
            text: "Cancel drop",
            style: "destructive",
            onPress: () => cancelDropMutation.mutate(exchangeId),
          },
        ],
      ),
    [cancelDropMutation],
  );

  const handleProposeSubmit = useCallback(
    (input: { shiftId: string; reason?: string }) =>
      dropMutation.mutate(input),
    [dropMutation],
  );

  // Pull-to-refresh fires all three list queries so the FAB's propose
  // modal and the unseen-banner computation both see the latest data
  // without needing a second trip.
  const handleRefresh = useCallback(() => {
    void Promise.all([
      availableQuery.refetch(),
      myDroppedQuery.refetch(),
      myPickupsQuery.refetch(),
    ]);
  }, [availableQuery, myDroppedQuery, myPickupsQuery]);

  const refreshing =
    activeTab === "available"
      ? availableQuery.isFetching
      : activeTab === "mine"
        ? myDroppedQuery.isFetching
        : myPickupsQuery.isFetching;

  const upcomingLoading =
    currentWeekQuery.isLoading ||
    nextWeekQuery.isLoading ||
    myDroppedQuery.isLoading;

  return (
    <ScreenWrapper includeTopInset={false}>
      <StyledText variant="title" className="mb-4 mt-4">
        Shift Exchange
      </StyledText>

      {freshDecisions.length > 0 ? (
        <View className="mb-3 bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
          <StyledText variant="caption" className="text-primary">
            {decisionBannerCopy(freshDecisions)}
          </StyledText>
        </View>
      ) : null}

      <View className="flex-row bg-card border border-border rounded-md p-1 mb-4">
        <SegmentButton
          label="Available"
          active={activeTab === "available"}
          onPress={() => setActiveTab("available")}
        />
        <SegmentButton
          label="My Drops"
          active={activeTab === "mine"}
          onPress={() => setActiveTab("mine")}
        />
        <SegmentButton
          label="My Pickups"
          active={activeTab === "pickups"}
          onPress={() => setActiveTab("pickups")}
        />
      </View>

      {activeTab === "available" ? (
        <AvailableShiftList
          shifts={availableQuery.data ?? []}
          onPickUp={handlePickUp}
          pickingUp={busyId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        />
      ) : activeTab === "mine" ? (
        <MyDroppedList
          shifts={myDroppedQuery.data ?? []}
          loading={myDroppedQuery.isLoading}
          busyId={busyId}
          onCancel={handleCancelDrop}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        />
      ) : (
        <MyPickupsList
          shifts={myPickupsQuery.data ?? []}
          loading={myPickupsQuery.isLoading}
          busyId={busyId}
          onWithdraw={handleWithdraw}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
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
  busyId,
  onCancel,
  refreshControl,
}: {
  shifts: ExchangeShift[];
  loading: boolean;
  busyId: string | null;
  onCancel: (exchangeId: string) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
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
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <DroppedShiftCard
          shift={item}
          onCancel={onCancel}
          canceling={busyId === item.id}
        />
      )}
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

function MyPickupsList({
  shifts,
  loading,
  busyId,
  onWithdraw,
  refreshControl,
}: {
  shifts: ExchangeShift[];
  loading: boolean;
  busyId: string | null;
  onWithdraw: (exchangeId: string) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
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
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <PickupShiftCard
          shift={item}
          onWithdraw={onWithdraw}
          withdrawing={busyId === item.id}
        />
      )}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="py-12 items-center">
          <StyledText variant="body" className="text-muted-foreground">
            You haven&apos;t picked up any shifts.
          </StyledText>
        </View>
      }
    />
  );
}

function DroppedShiftCard({
  shift,
  onCancel,
  canceling,
}: {
  shift: ExchangeShift;
  onCancel: (exchangeId: string) => void;
  canceling: boolean;
}) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);

  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const timeRange = `${formatTime(start)} – ${formatTime(end)}`;
  const canCancel =
    shift.status === "available" || shift.status === "pending_coverage";

  return (
    <View className="bg-card border border-border rounded-md p-4">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
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

      <DroppedShiftSubtext shift={shift} />

      {canCancel ? (
        <View className="mt-3 flex-row justify-end">
          <Button
            title="Cancel drop"
            variant="destructive"
            size="sm"
            loading={canceling}
            onPress={() => onCancel(shift.id)}
          />
        </View>
      ) : null}
    </View>
  );
}

function DroppedShiftSubtext({ shift }: { shift: ExchangeShift }) {
  const lines: string[] = [];

  if (shift.pickedUpByName) {
    lines.push(`Picked up by ${shift.pickedUpByName}`);
  }

  switch (shift.status) {
    case "available":
      lines.push("Waiting for someone to pick up.");
      break;
    case "pending_coverage":
      lines.push("Awaiting manager approval.");
      break;
    case "manager_approved":
    case "covered":
      lines.push("Confirmed — your schedule has been updated.");
      break;
    case "denied":
      if (shift.managerNotes) {
        lines.push(`Manager note: ${shift.managerNotes}`);
      } else {
        lines.push("Manager denied this swap. The shift stays on your schedule.");
      }
      break;
    case "cancelled":
      lines.push("You cancelled this drop.");
      break;
  }

  if (lines.length === 0) return null;

  return (
    <View className="mt-2 gap-0.5">
      {lines.map((line, idx) => (
        <StyledText
          key={idx}
          variant="caption"
          className="text-muted-foreground"
        >
          {line}
        </StyledText>
      ))}
    </View>
  );
}

function PickupShiftCard({
  shift,
  onWithdraw,
  withdrawing,
}: {
  shift: ExchangeShift;
  onWithdraw: (exchangeId: string) => void;
  withdrawing: boolean;
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
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
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

      <StyledText
        variant="caption"
        className="text-muted-foreground mt-2"
      >
        Dropped by {shift.droppedByName}
      </StyledText>

      <PickupSubtext shift={shift} />

      {shift.status === "pending_coverage" ? (
        <View className="mt-3 flex-row justify-end">
          <Button
            title="Withdraw"
            variant="destructive"
            size="sm"
            loading={withdrawing}
            onPress={() => onWithdraw(shift.id)}
          />
        </View>
      ) : null}
    </View>
  );
}

function PickupSubtext({ shift }: { shift: ExchangeShift }) {
  switch (shift.status) {
    case "pending_coverage":
      return (
        <StyledText
          variant="caption"
          className="text-muted-foreground mt-0.5"
        >
          Awaiting manager approval.
        </StyledText>
      );
    case "manager_approved":
    case "covered":
      return (
        <StyledText
          variant="caption"
          className="text-muted-foreground mt-0.5"
        >
          Approved — the shift is now on your schedule.
        </StyledText>
      );
    case "denied":
      return (
        <StyledText
          variant="caption"
          className="text-muted-foreground mt-0.5"
        >
          {shift.managerNotes
            ? `Manager note: ${shift.managerNotes}`
            : "Manager denied this swap."}
        </StyledText>
      );
    case "cancelled":
      return (
        <StyledText
          variant="caption"
          className="text-muted-foreground mt-0.5"
        >
          The dropper cancelled this shift.
        </StyledText>
      );
    default:
      return null;
  }
}

/**
 * Build a short banner message summarising manager decisions the
 * user has not yet seen. We collapse counts so the banner stays one
 * line regardless of how many rows transitioned.
 */
function decisionBannerCopy(rows: ExchangeShift[]): string {
  const approvals = rows.filter(
    (r) => r.status === "manager_approved" || r.status === "covered",
  ).length;
  const denials = rows.filter((r) => r.status === "denied").length;
  const cancellations = rows.filter((r) => r.status === "cancelled").length;

  const parts: string[] = [];
  if (approvals > 0) parts.push(`${approvals} approved`);
  if (denials > 0) parts.push(`${denials} denied`);
  if (cancellations > 0) parts.push(`${cancellations} cancelled`);

  if (parts.length === 0) return "New activity on your exchanges.";
  return `Since you last checked: ${parts.join(", ")}.`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
