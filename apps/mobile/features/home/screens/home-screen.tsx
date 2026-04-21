import { useCallback } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { NextShiftCard } from "../components/next-shift-card";
import { AnnouncementFeed } from "../components/announcement-feed";
import { fetchNextShift, fetchAnnouncements } from "../api";

export function HomeScreen() {
  const { user } = useUser();
  const { userId } = useAuth();

  const shiftQuery = useQuery({
    queryKey: ["home", userId, "nextShift"],
    queryFn: fetchNextShift,
    enabled: Boolean(userId),
  });

  const announcementsQuery = useQuery({
    queryKey: ["home", userId, "announcements"],
    queryFn: fetchAnnouncements,
    enabled: Boolean(userId),
  });

  // Pull-to-refresh fires both queries in parallel. `isFetching`
  // drives the spinner so it stays visible for the slower of the
  // two network calls. Swallow rejections because errors are
  // already surfaced through each query's `isError` branch.
  const handleRefresh = useCallback(() => {
    void Promise.all([shiftQuery.refetch(), announcementsQuery.refetch()]);
  }, [shiftQuery, announcementsQuery]);

  const refreshing =
    shiftQuery.isFetching || announcementsQuery.isFetching;

  return (
    <ScreenWrapper includeTopInset={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="mb-6 mt-4">
          <StyledText variant="caption">Welcome back,</StyledText>
          <StyledText variant="title">{user?.firstName ?? "Chef"}</StyledText>
        </View>

        {shiftQuery.isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="large" />
          </View>
        ) : shiftQuery.isError ? (
          <View className="bg-card border border-border rounded-md p-5 items-center">
            <StyledText variant="body" className="text-muted-foreground">
              Couldn&apos;t load your next shift. Pull down to retry.
            </StyledText>
          </View>
        ) : shiftQuery.data ? (
          <NextShiftCard shift={shiftQuery.data} />
        ) : (
          <View className="bg-card border border-border rounded-md p-5 items-center">
            <StyledText variant="body" className="text-muted-foreground">
              No upcoming shifts scheduled.
            </StyledText>
          </View>
        )}

        {announcementsQuery.isError ? (
          <View className="bg-card border border-border rounded-md p-5 mt-6 items-center">
            <StyledText variant="body" className="text-muted-foreground">
              Couldn&apos;t load announcements.
            </StyledText>
          </View>
        ) : announcementsQuery.data && announcementsQuery.data.length > 0 ? (
          <AnnouncementFeed announcements={announcementsQuery.data} />
        ) : null}

        <View className="h-8" />
      </ScrollView>
    </ScreenWrapper>
  );
}
