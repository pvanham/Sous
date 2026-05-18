import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import {
  fetchAnnouncements,
  type AnnouncementListLifecycle,
  type AnnouncementListItem,
} from "../api";
import { AnnouncementCard } from "../components/announcement-card";
import { AnnouncementEmptyState } from "../components/announcement-empty-state";

type SegmentOption = {
  value: AnnouncementListLifecycle;
  label: string;
};

const SEGMENTS: SegmentOption[] = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
];

export function AnnouncementsListScreen() {
  const [lifecycle, setLifecycle] = useState<AnnouncementListLifecycle>("active");
  const { userId } = useAuth();
  const router = useRouter();

  const announcementsQuery = useQuery({
    queryKey: ["announcements", userId, "list", lifecycle],
    queryFn: () => fetchAnnouncements({ lifecycle }),
    enabled: Boolean(userId),
  });

  const items = announcementsQuery.data ?? [];
  const unreadCount = useMemo(
    () => items.filter((item) => item.acknowledgment?.readAt === null || item.acknowledgment === null)
      .length,
    [items]
  );

  return (
    <ScreenWrapper includeTopInset className="pt-2">
      <View className="mb-4">
        <StyledText variant="title" className="mb-1">
          Announcements
        </StyledText>
        <StyledText variant="caption">
          {unreadCount} unread
        </StyledText>
      </View>

      <View className="flex-row bg-muted rounded-md p-1 mb-4">
        {SEGMENTS.map((segment) => {
          const active = lifecycle === segment.value;
          return (
            <Pressable
              key={segment.value}
              onPress={() => setLifecycle(segment.value)}
              className={`flex-1 rounded-sm py-2 items-center ${active ? "bg-background" : ""}`}
            >
              <StyledText
                variant="label"
                className={active ? "text-foreground" : "text-muted-foreground"}
              >
                {segment.label}
              </StyledText>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.announcement.id}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
        refreshing={announcementsQuery.isFetching}
        onRefresh={() => {
          void announcementsQuery.refetch();
        }}
        renderItem={({ item }) => (
          <AnnouncementCard
            item={item}
            onPress={() =>
                  router.push(`/announcements/${item.announcement.id}` as never)
            }
          />
        )}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          <AnnouncementEmptyState
            loading={announcementsQuery.isLoading}
            error={announcementsQuery.isError}
            emptyCopy={
              lifecycle === "expired"
                ? "No expired announcements."
                : "No active announcements right now."
            }
          />
        }
      />
    </ScreenWrapper>
  );
}
