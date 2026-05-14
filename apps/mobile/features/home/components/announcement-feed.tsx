import { View, FlatList } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Announcement, AnnouncementPriority } from "@/types";
import { StyledText } from "@/components/ui/text";

// ─────────────────────────────────────────────────────────────
// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
//
// Shared priority values are now `Standard` / `Urgent`.
// ─────────────────────────────────────────────────────────────

interface AnnouncementFeedProps {
  announcements: Announcement[];
  loading?: boolean;
  error?: boolean;
}

interface PriorityStyle {
  bar: string;
  badgeBg: string;
  badgeText: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  iconColor: string;
  label: string;
}

const PRIORITY_STYLES: Record<AnnouncementPriority, PriorityStyle> = {
  Urgent: {
    bar: "bg-destructive",
    badgeBg: "bg-destructive/15",
    badgeText: "text-destructive",
    icon: "error-outline",
    iconColor: "#dc2626",
    label: "Urgent",
  },
  Standard: {
    bar: "bg-muted-foreground/50",
    badgeBg: "bg-muted",
    badgeText: "text-muted-foreground",
    icon: "campaign",
    iconColor: "#78716c",
    label: "Update",
  },
};

export function AnnouncementFeed({
  announcements,
  loading = false,
  error = false,
}: AnnouncementFeedProps) {
  const hasAnnouncements = announcements.length > 0;

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
              {announcements.length}
            </StyledText>
          </View>
        ) : null}
      </View>
      {hasAnnouncements ? (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => <AnnouncementItem announcement={item} />}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
        />
      ) : (
        <EmptyState loading={loading} error={error} />
      )}
    </View>
  );
}

function EmptyState({ loading, error }: { loading: boolean; error: boolean }) {
  let message: string;
  if (error) {
    message = "Couldn't load announcements.";
  } else if (loading) {
    message = "Loading announcements…";
  } else {
    message = "No announcements right now. You're all caught up.";
  }

  return (
    <View className="py-3">
      <StyledText
        variant="caption"
        className="text-muted-foreground text-center"
      >
        {message}
      </StyledText>
    </View>
  );
}

function AnnouncementItem({ announcement }: { announcement: Announcement }) {
  const timeAgo = getRelativeTime(announcement.createdAt);
  const style = PRIORITY_STYLES[announcement.priority];
  const showBadge = announcement.priority === "Urgent";

  return (
    <View className="flex-row bg-card border border-border rounded-md overflow-hidden">
      <View className={`w-1.5 ${style.bar}`} />
      <View className="flex-1 p-3.5">
        <View className="flex-row justify-between items-center mb-1.5">
          <View className="flex-row items-center flex-1 pr-2">
            <MaterialIcons
              name={style.icon}
              size={14}
              color={style.iconColor}
            />
            <StyledText variant="label" className="ml-1.5 flex-1">
              {announcement.title}
            </StyledText>
          </View>
          {showBadge ? (
            <View className={`px-2 py-0.5 rounded-sm ${style.badgeBg} mr-2`}>
              <StyledText
                variant="label"
                className={`text-[10px] ${style.badgeText}`}
              >
                {style.label.toUpperCase()}
              </StyledText>
            </View>
          ) : null}
          <StyledText variant="caption">{timeAgo}</StyledText>
        </View>
        <StyledText variant="body" className="text-muted-foreground text-sm">
          {announcement.body}
        </StyledText>
        <StyledText variant="caption" className="mt-2">
          — {announcement.authorName}
        </StyledText>
      </View>
    </View>
  );
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}
