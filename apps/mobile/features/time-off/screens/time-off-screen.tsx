import { useState, useMemo, useCallback } from "react";
import { View, FlatList, Pressable, Alert, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { isAxiosError } from "axios";
import type { TimeOffRequestDTO, TimeOffRequestStatus } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { RequestModal } from "../components/request-modal";
import { fetchTimeOffRequests, submitTimeOffRequest } from "../api";
import type { CreateTimeOffRequestInput } from "@/types";

const STATUS_CONFIG: Record<
  TimeOffRequestStatus,
  { label: string; badgeClass: string; textClass: string }
> = {
  approved: {
    label: "Approved",
    badgeClass: "bg-green-500/15",
    textClass: "text-green-600",
  },
  pending: {
    label: "Pending",
    badgeClass: "bg-yellow-500/15",
    textClass: "text-yellow-600",
  },
  denied: {
    label: "Denied",
    badgeClass: "bg-destructive/15",
    textClass: "text-destructive",
  },
};

export function TimeOffScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const requestsQuery = useQuery({
    queryKey: ["timeOffRequests", userId],
    queryFn: fetchTimeOffRequests,
    enabled: Boolean(userId),
  });

  const submitMutation = useMutation({
    mutationFn: submitTimeOffRequest,
    onSuccess: () => {
      setModalVisible(false);
      // Prefix-match invalidation — catches the current user's
      // scoped key `["timeOffRequests", userId]` regardless of who
      // is signed in, and is safe because the cache is cleared on
      // every auth transition.
      queryClient.invalidateQueries({ queryKey: ["timeOffRequests"] });
    },
    onError: (error: unknown) => {
      // Surface the route handler's `{ error }` payload (advance-days
      // violation, duplicate range, etc.) to the user verbatim. Falls
      // back to a generic message when the network call itself fails.
      const message =
        isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : error instanceof Error
            ? error.message
            : "Could not submit time-off request. Please try again.";
      Alert.alert("Time off", message);
    },
  });

  const handleSubmit = useCallback(
    (input: CreateTimeOffRequestInput) => submitMutation.mutate(input),
    [submitMutation]
  );

  const counts = useMemo(() => {
    const data = requestsQuery.data ?? [];
    return {
      approved: data.filter((r) => r.status === "approved").length,
      pending: data.filter((r) => r.status === "pending").length,
      denied: data.filter((r) => r.status === "denied").length,
    };
  }, [requestsQuery.data]);

  const sortedRequests = useMemo(() => {
    return [...(requestsQuery.data ?? [])].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  }, [requestsQuery.data]);

  const handleRefresh = useCallback(() => {
    void requestsQuery.refetch();
  }, [requestsQuery]);

  return (
    <ScreenWrapper>
      <StyledText variant="title" className="mb-4 mt-2">
        Time Off
      </StyledText>

      {/* Status dashboard */}
      <View className="flex-row gap-3 mb-5">
        <CounterCard
          label="Approved"
          count={counts.approved}
          badgeClass="bg-green-500/15"
          textClass="text-green-600"
        />
        <CounterCard
          label="Pending"
          count={counts.pending}
          badgeClass="bg-yellow-500/15"
          textClass="text-yellow-600"
        />
        <CounterCard
          label="Denied"
          count={counts.denied}
          badgeClass="bg-destructive/15"
          textClass="text-destructive"
        />
      </View>

      {/* History list */}
      <StyledText variant="subtitle" className="mb-3">
        Request History
      </StyledText>

      <FlatList
        data={sortedRequests}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-20"
        refreshControl={
          <RefreshControl
            refreshing={requestsQuery.isFetching}
            onRefresh={handleRefresh}
          />
        }
        renderItem={({ item }) => <RequestCard request={item} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          requestsQuery.isLoading ? (
            <StyledText variant="body" className="text-muted-foreground text-center py-12">
              Loading requests...
            </StyledText>
          ) : (
            <StyledText variant="body" className="text-muted-foreground text-center py-12">
              No time-off requests yet.
            </StyledText>
          )
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() => setModalVisible(true)}
        className="absolute bottom-6 right-4 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
        style={{ elevation: 4 }}
      >
        <StyledText variant="title" className="text-primary-foreground text-2xl leading-none">
          +
        </StyledText>
      </Pressable>

      <RequestModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleSubmit}
        submitting={submitMutation.isPending}
      />
    </ScreenWrapper>
  );
}

function CounterCard({
  label,
  count,
  badgeClass,
  textClass,
}: {
  label: string;
  count: number;
  badgeClass: string;
  textClass: string;
}) {
  return (
    <View className={`flex-1 rounded-md p-3 items-center ${badgeClass}`}>
      <StyledText variant="title" className={textClass}>
        {count}
      </StyledText>
      <StyledText variant="caption" className="mt-0.5">
        {label}
      </StyledText>
    </View>
  );
}

function RequestCard({ request }: { request: TimeOffRequestDTO }) {
  const config = STATUS_CONFIG[request.status];
  const startDate = new Date(request.startDate);
  const endDate = new Date(request.endDate);

  const isSingleDay =
    startDate.toDateString() === endDate.toDateString();

  const dateLabel = isSingleDay
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return (
    <View className="bg-card border border-border rounded-md p-4">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <StyledText variant="label">{dateLabel}</StyledText>
          {request.reason ? (
            <StyledText variant="caption" className="mt-1">
              {request.reason}
            </StyledText>
          ) : null}
        </View>
        <View className={`px-2.5 py-1 rounded-sm ${config.badgeClass}`}>
          <StyledText variant="label" className={`text-xs ${config.textClass}`}>
            {config.label}
          </StyledText>
        </View>
      </View>
    </View>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
