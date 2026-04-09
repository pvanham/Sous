import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { NextShiftCard } from "../components/next-shift-card";
import { AnnouncementFeed } from "../components/announcement-feed";
import { fetchNextShift, fetchAnnouncements } from "../api";

export function HomeScreen() {
  const { user } = useUser();

  const shiftQuery = useQuery({
    queryKey: ["nextShift"],
    queryFn: fetchNextShift,
  });

  const announcementsQuery = useQuery({
    queryKey: ["announcements"],
    queryFn: fetchAnnouncements,
  });

  const initials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
    : "?";

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="flex-row justify-between items-center mb-6 mt-2">
          <View>
            <StyledText variant="caption">Welcome back,</StyledText>
            <StyledText variant="title">
              {user?.firstName ?? "Chef"}
            </StyledText>
          </View>
          <Pressable className="w-10 h-10 rounded-full bg-primary items-center justify-center">
            <StyledText variant="label" className="text-primary-foreground text-sm">
              {initials}
            </StyledText>
          </Pressable>
        </View>

        {shiftQuery.isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="large" />
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

        {announcementsQuery.data ? (
          <AnnouncementFeed announcements={announcementsQuery.data} />
        ) : null}

        <View className="h-8" />
      </ScrollView>
    </ScreenWrapper>
  );
}
