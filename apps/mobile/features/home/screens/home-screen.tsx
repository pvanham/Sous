import { useCallback } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useUser, useClerk } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { NextShiftCard } from "../components/next-shift-card";
import { AnnouncementFeed } from "../components/announcement-feed";
import { fetchNextShift, fetchAnnouncements } from "../api";

export function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  }, [signOut]);

  const shiftQuery = useQuery({
    queryKey: ["home", "nextShift"],
    queryFn: fetchNextShift,
  });

  const announcementsQuery = useQuery({
    queryKey: ["home", "announcements"],
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
          <View className="flex-row items-center gap-2">
            <View className="w-10 h-10 rounded-full bg-primary items-center justify-center">
              <StyledText
                variant="label"
                className="text-primary-foreground text-sm"
              >
                {initials}
              </StyledText>
            </View>
            <Pressable
              onPress={handleSignOut}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:opacity-60"
            >
              <MaterialIcons name="logout" size={20} color="#78716c" />
            </Pressable>
          </View>
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
