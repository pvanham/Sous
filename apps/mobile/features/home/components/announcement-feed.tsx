import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { StyledText } from "@/components/ui/text";
import type { AnnouncementListItem } from "@/features/announcements/api";
import { AnnouncementCard } from "@/features/announcements/components/announcement-card";
import { AnnouncementEmptyState } from "@/features/announcements/components/announcement-empty-state";

interface AnnouncementFeedProps {
  items: AnnouncementListItem[];
  loading?: boolean;
  error?: boolean;
}

export function AnnouncementFeed({
  items,
  loading = false,
  error = false,
}: AnnouncementFeedProps) {
  const router = useRouter();
  const topItems = items.slice(0, 3);
  const hasAnnouncements = topItems.length > 0;
  const unreadCount = items.filter(
    (item) => item.acknowledgment === null || item.acknowledgment.readAt === null
  ).length;

  return (
    <View className="mt-6">
      <View className="flex-row items-center mb-3">
        <StyledText variant="subtitle">Announcements</StyledText>
        {hasAnnouncements ? (
          <View className="ml-2 px-2 py-0.5 rounded-sm bg-muted">
            <StyledText
              variant="label"
              className="text-xs text-muted-foreground"
            >
              {unreadCount}
            </StyledText>
          </View>
        ) : null}
      </View>
      {hasAnnouncements ? (
        <>
          <FlatList
            data={topItems}
            keyExtractor={(item) => item.announcement.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <AnnouncementCard
                item={item}
                onPress={() =>
                  router.push(`/announcements/${item.announcement.id}` as never)
                }
              />
            )}
            ItemSeparatorComponent={() => <View className="h-2.5" />}
          />

          <Pressable
            className="mt-3 py-1 active:opacity-60"
            onPress={() => router.push("/announcements" as never)}
            accessibilityRole="button"
            accessibilityLabel="View all announcements"
          >
            <StyledText variant="label" className="text-primary">
              View all announcements →
            </StyledText>
          </Pressable>
        </>
      ) : (
        <AnnouncementEmptyState loading={loading} error={error} />
      )}
    </View>
  );
}
