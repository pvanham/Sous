import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import {
  acknowledgeAnnouncement,
  fetchAnnouncementById,
  markAnnouncementRead,
} from "../api";
import { AnnouncementEmptyState } from "../components/announcement-empty-state";

interface AnnouncementDetailScreenProps {
  announcementId: string;
}

export function AnnouncementDetailScreen({
  announcementId,
}: AnnouncementDetailScreenProps) {
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["announcements", userId, "detail", announcementId],
    queryFn: () => fetchAnnouncementById(announcementId),
    enabled: Boolean(userId && announcementId),
  });

  const readMutation = useMutation({
    mutationFn: () => markAnnouncementRead(announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => acknowledgeAnnouncement(announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    if (detailQuery.data.acknowledgment?.readAt) return;
    if (readMutation.isPending) return;
    readMutation.mutate();
  }, [detailQuery.data, readMutation]);

  const item = detailQuery.data;
  const announcement = item?.announcement;
  const acknowledgedAt = item?.acknowledgment?.acknowledgedAt ?? null;
  const showAckButton = Boolean(announcement?.requiresAcknowledgment);

  const acknowledgeTitle = useMemo(() => {
    if (!showAckButton) return "";
    if (!acknowledgedAt) return "Acknowledge";
    return `Acknowledged ${getRelativeTime(acknowledgedAt)}`;
  }, [acknowledgedAt, showAckButton]);

  if (detailQuery.isLoading || !announcement) {
    return (
      <ScreenWrapper includeTopInset>
        <AnnouncementEmptyState
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          emptyCopy="Announcement not found."
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper includeTopInset className="pt-2">
      <View className="flex-row items-center justify-between mb-4">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/announcements" as never);
            }
          }}
          className="w-10 h-10 items-center justify-center -ml-2 active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialIcons name="arrow-back" size={22} color="#78716c" />
        </Pressable>
        <StyledText variant="subtitle">Announcement</StyledText>
        <View className="w-10" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <View className="bg-card border border-border rounded-md p-4">
          <View className="flex-row justify-between items-start mb-2">
            <StyledText variant="subtitle" className="flex-1 mr-2">
              {announcement.title}
            </StyledText>
            <View className="px-2 py-0.5 rounded-sm bg-muted">
              <StyledText variant="label" className="text-xs text-muted-foreground">
                {announcement.priority}
              </StyledText>
            </View>
          </View>

          <StyledText variant="caption" className="mb-3">
            Posted by {announcement.authorName} · {getRelativeTime(announcement.createdAt)}
          </StyledText>

          <StyledText variant="body" className="text-foreground mb-4">
            {announcement.body}
          </StyledText>

          {announcement.tags.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {announcement.tags.map((tag) => (
                <View key={tag} className="px-2 py-1 rounded-sm bg-muted">
                  <StyledText variant="caption">{tag}</StyledText>
                </View>
              ))}
            </View>
          ) : null}

          {announcement.expirationDate ? (
            <StyledText variant="caption" className="mb-2">
              Expires {announcement.expirationDate.toLocaleDateString()}
            </StyledText>
          ) : null}

          <StyledText variant="caption" className="mb-4">
            {announcement.requiresAcknowledgment
              ? "Acknowledgment required"
              : "No acknowledgment required"}
          </StyledText>

          {announcement.attachments.length > 0 ? (
            <View className="mb-4">
              <StyledText variant="label" className="mb-2">
                Attachments
              </StyledText>
              {announcement.attachments.map((attachment) => (
                <StyledText
                  key={attachment}
                  variant="caption"
                  className="text-primary mb-1"
                >
                  {attachment}
                </StyledText>
              ))}
            </View>
          ) : null}

          {showAckButton ? (
            <Button
              title={acknowledgeTitle}
              onPress={() => acknowledgeMutation.mutate()}
              loading={acknowledgeMutation.isPending}
              disabled={Boolean(acknowledgedAt)}
              size="lg"
            />
          ) : null}
        </View>
      </ScrollView>
    </ScreenWrapper>
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
  return `${Math.floor(diffDays / 7)}w ago`;
}
