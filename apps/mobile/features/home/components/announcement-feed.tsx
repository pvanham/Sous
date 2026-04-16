import { View, FlatList } from "react-native";
import type { Announcement, AnnouncementPriority } from "@/types";
import { StyledText } from "@/components/ui/text";

interface AnnouncementFeedProps {
  announcements: Announcement[];
}

const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  urgent: "bg-destructive",
  high: "bg-primary",
  normal: "bg-muted-foreground",
  low: "bg-border",
};

export function AnnouncementFeed({ announcements }: AnnouncementFeedProps) {
  return (
    <View className="mt-6">
      <StyledText variant="subtitle" className="mb-3">
        Announcements
      </StyledText>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => <AnnouncementItem announcement={item} />}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
      />
    </View>
  );
}

function AnnouncementItem({ announcement }: { announcement: Announcement }) {
  const timeAgo = getRelativeTime(announcement.createdAt);

  return (
    <View className="bg-card border border-border rounded-md p-4 flex-row">
      <View
        className={`w-2 rounded-full mr-3 ${PRIORITY_COLORS[announcement.priority]}`}
      />
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <StyledText variant="label">{announcement.title}</StyledText>
          <StyledText variant="caption">{timeAgo}</StyledText>
        </View>
        <StyledText variant="body" className="text-muted-foreground text-sm">
          {announcement.body}
        </StyledText>
      </View>
    </View>
  );
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
