import { useCallback, useMemo } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import type { ShiftDTO } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { GreetingHeader } from "../components/greeting-header";
import { NextShiftCard } from "../components/next-shift-card";
import { WeekStatsCard } from "../components/week-stats-card";
import { UpcomingShifts } from "../components/upcoming-shifts";
import { AnnouncementFeed } from "../components/announcement-feed";
import { fetchNextShift, fetchAnnouncements, fetchWeekShifts } from "../api";
import { useSignOut } from "@/features/auth/use-sign-out";

/**
 * Home hub for the mobile app. This is the first thing a signed-in
 * staff member sees, so it's built to answer the four questions they
 * open the app to answer — in order:
 *
 *   1. "When do I work next?"            → NextShiftCard
 *   2. "How does my week look overall?"  → WeekStatsCard + UpcomingShifts
 *   3. "Anything my manager posted?"     → AnnouncementFeed
 *
 * Server state is split across three queries so each section can load,
 * error, and refresh independently. Pull-to-refresh triggers all three
 * in parallel and the spinner stays up for the slowest.
 */
export function HomeScreen() {
  const { user } = useUser();
  const { userId } = useAuth();
  const signOut = useSignOut();

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

  const currentWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const weekStartIso = useMemo(
    () => currentWeekStart.toISOString().slice(0, 10),
    [currentWeekStart],
  );

  const shiftQuery = useQuery({
    queryKey: ["home", userId, "nextShift"],
    queryFn: fetchNextShift,
    enabled: Boolean(userId),
  });

  // Share the `["schedule", userId, "week", <iso>]` cache key with the
  // Schedule tab so the two views stay in lockstep — switching tabs
  // after a pull-to-refresh on either side is free.
  const weekShiftsQuery = useQuery({
    queryKey: ["schedule", userId, "week", weekStartIso],
    queryFn: () => fetchWeekShifts(currentWeekStart),
    enabled: Boolean(userId),
  });

  const announcementsQuery = useQuery({
    queryKey: ["home", userId, "announcements"],
    queryFn: fetchAnnouncements,
    enabled: Boolean(userId),
  });

  const initials = buildInitials(user?.firstName, user?.lastName);

  const handleRefresh = useCallback(() => {
    void Promise.all([
      shiftQuery.refetch(),
      weekShiftsQuery.refetch(),
      announcementsQuery.refetch(),
    ]);
  }, [shiftQuery, weekShiftsQuery, announcementsQuery]);

  const refreshing =
    shiftQuery.isFetching ||
    weekShiftsQuery.isFetching ||
    announcementsQuery.isFetching;

  // Drive the upcoming-shifts list from the weekly query so the user
  // always sees a continuous timeline starting right after their next
  // shift. Fall back to anything left in the week if `/shifts/next`
  // returned null (e.g. manager with no staff row).
  const upcomingShifts = useMemo<ShiftDTO[]>(() => {
    const all = weekShiftsQuery.data ?? [];
    const nextId = shiftQuery.data?.id ?? null;
    const now = Date.now();
    return all
      .filter((shift) => new Date(shift.start).getTime() > now)
      .filter((shift) => shift.id !== nextId)
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      )
      .slice(0, 3);
  }, [weekShiftsQuery.data, shiftQuery.data]);

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <GreetingHeader
          firstName={user?.firstName}
          initials={initials}
          onSignOut={handleSignOut}
        />

        <NextShiftSection
          loading={shiftQuery.isLoading}
          error={shiftQuery.isError}
          shift={shiftQuery.data ?? null}
        />

        <View className="mt-4">
          <WeekStatsCard
            shifts={weekShiftsQuery.data}
            loading={weekShiftsQuery.isLoading}
          />
        </View>

        <UpcomingShifts shifts={upcomingShifts} />

        <AnnouncementFeed
          announcements={announcementsQuery.data ?? []}
          loading={announcementsQuery.isLoading}
          error={announcementsQuery.isError}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

interface NextShiftSectionProps {
  loading: boolean;
  error: boolean;
  shift: ShiftDTO | null;
}

function NextShiftSection({ loading, error, shift }: NextShiftSectionProps) {
  if (loading) {
    return (
      <View className="bg-card border border-border rounded-md py-10 items-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="bg-card border border-border rounded-md p-5 items-center">
        <StyledText variant="body" className="text-muted-foreground text-center">
          Couldn&apos;t load your next shift. Pull down to retry.
        </StyledText>
      </View>
    );
  }

  if (!shift) {
    return (
      <View className="bg-card border border-border rounded-md p-6 items-center">
        <StyledText variant="subtitle" className="mb-1">
          No upcoming shifts
        </StyledText>
        <StyledText
          variant="caption"
          className="text-center text-muted-foreground"
        >
          You&apos;re all caught up. Check the Schedule tab when your next
          week is published.
        </StyledText>
      </View>
    );
  }

  return <NextShiftCard shift={shift} />;
}

/** Returns the most recent Sunday at midnight in local time — matches
 * the Schedule tab's week convention so cache keys stay canonical. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName?.[0] ?? "").toUpperCase();
  const last = (lastName?.[0] ?? "").toUpperCase();
  const combined = `${first}${last}`;
  return combined.length > 0 ? combined : "?";
}
