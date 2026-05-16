import { Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { AnnouncementPriority } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import type { AnnouncementListItem } from "../api";

interface AnnouncementCardProps {
  item: AnnouncementListItem;
  onPress?: () => void;
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

export function AnnouncementCard({
  item,
  onPress,
}: AnnouncementCardProps) {
  const { announcement, acknowledgment } = item;
  const style = PRIORITY_STYLES[announcement.priority];
  const showUrgentBadge = announcement.priority === "Urgent";
  const readAt = acknowledgment?.readAt ?? null;
  const acknowledgedAt = acknowledgment?.acknowledgedAt ?? null;
  const unread = readAt === null;
  const ackPending = announcement.requiresAcknowledgment && acknowledgedAt === null;

  const CardContainer = onPress ? Pressable : View;

  return (
    <CardContainer
      onPress={onPress}
      className="flex-row bg-card border border-border rounded-md overflow-hidden active:opacity-90"
    >
      <View className={`w-1.5 ${style.bar}`} />
      <View className="flex-1 p-3.5">
        <View className="flex-row justify-between items-center mb-1.5">
          <View className="flex-row items-center flex-1 pr-2">
            <MaterialIcons name={style.icon} size={14} color={style.iconColor} />
            <StyledText variant="label" className="ml-1.5 flex-1">
              {announcement.title}
            </StyledText>
          </View>

          {unread ? <View className="w-2 h-2 rounded-full bg-primary mr-2" /> : null}

          {showUrgentBadge ? (
            <View className={`px-2 py-0.5 rounded-sm ${style.badgeBg} mr-2`}>
              <StyledText variant="label" className={`text-[10px] ${style.badgeText}`}>
                {style.label.toUpperCase()}
              </StyledText>
            </View>
          ) : null}

          <StyledText variant="caption">{getRelativeTime(announcement.createdAt)}</StyledText>
        </View>

        <StyledText variant="body" className="text-muted-foreground text-sm">
          {announcement.body}
        </StyledText>

        <View className="flex-row items-center justify-between mt-2">
          <StyledText variant="caption">— {announcement.authorName}</StyledText>
          {ackPending ? (
            <View className="px-2 py-0.5 rounded-sm bg-primary/15">
              <StyledText variant="label" className="text-[10px] text-primary">
                ACK REQUIRED
              </StyledText>
            </View>
          ) : null}
        </View>
      </View>
    </CardContainer>
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
