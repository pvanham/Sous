import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useMyStaff, useUpdateMyStaff } from "@/features/profile/hooks";
import { OnboardingHeader } from "../components/onboarding-header";
import { ONBOARDING_STEP_COUNT } from "../lib/steps";

const ICON_COLOR = "#78716c";

/**
 * Step 3 — Station preferences.
 *
 * Staff cannot self-assign skills (managers control `Staff.skills`),
 * so the chip row mirrors the manager-approved list one-for-one.
 * The user can only star / un-star to mark a station as preferred,
 * which writes to `Staff.preferredStations` — a soft constraint the
 * AI scheduler reads as a placement bias.
 *
 * Empty state — when the manager hasn't approved any stations yet
 * we surface a "Skip for now" path so the user isn't blocked from
 * finishing onboarding.
 */
export function StationsStepScreen() {
  const router = useRouter();
  const myStaffQuery = useMyStaff();
  const updateMyStaff = useUpdateMyStaff();

  const staff = myStaffQuery.data ?? null;

  const approvedStations = useMemo(() => {
    if (!staff) return [] as string[];
    const set = new Set<string>();
    for (const skill of staff.skills) set.add(skill.station);
    return Array.from(set).sort();
  }, [staff]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (staff) {
      setSelected(new Set(staff.preferredStations));
    }
  }, [staff]);

  const toggle = useCallback((station: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(station)) {
        next.delete(station);
      } else {
        next.add(station);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (label: "next" | "skip") => {
      setError(null);
      setSubmitting(true);
      try {
        // Always patch — even if `selected` is unchanged we want
        // the round-trip to confirm the server saw the user's
        // (possibly empty) preference list at least once. The
        // mutation is cheap and the cache prime keeps the resume
        // logic accurate.
        await updateMyStaff.mutateAsync({
          preferredStations: Array.from(selected),
        });
        router.replace("/(onboarding)/availability" as never);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save your station preferences.",
        );
      } finally {
        setSubmitting(false);
      }
      void label;
    },
    [selected, updateMyStaff, router],
  );

  if (myStaffQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <OnboardingHeader step={2} totalSteps={ONBOARDING_STEP_COUNT} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  const hasStations = approvedStations.length > 0;

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader step={2} totalSteps={ONBOARDING_STEP_COUNT} />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <StyledText variant="title" className="text-2xl mb-1">
          Your stations
        </StyledText>
        <StyledText variant="caption" className="mb-6 text-sm">
          These are the stations your manager has approved you for. Tap
          the star on any you&apos;d like to be scheduled at more
          often.
        </StyledText>

        {hasStations ? (
          <View className="flex-row flex-wrap gap-2 mb-6">
            {approvedStations.map((station) => (
              <StationChip
                key={station}
                station={station}
                preferred={selected.has(station)}
                onToggle={() => toggle(station)}
              />
            ))}
          </View>
        ) : (
          <View className="bg-card border border-border rounded-md px-4 py-5 mb-6">
            <View className="flex-row items-center mb-2">
              <MaterialIcons name="info-outline" size={20} color={ICON_COLOR} />
              <StyledText variant="body" className="ml-2 font-semibold">
                Nothing to set yet
              </StyledText>
            </View>
            <StyledText variant="caption" className="text-sm">
              Your manager hasn&apos;t approved you for any stations yet.
              You can pick favourites later from Settings → Station
              preferences once they do.
            </StyledText>
          </View>
        )}

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mb-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        <Button
          title={hasStations ? "Next" : "Skip for now"}
          onPress={() => handleSubmit(hasStations ? "next" : "skip")}
          loading={submitting}
          disabled={submitting}
          size="lg"
          className="mt-2"
        />
      </ScrollView>
    </View>
  );
}

interface StationChipProps {
  station: string;
  preferred: boolean;
  onToggle: () => void;
}

function StationChip({ station, preferred, onToggle }: StationChipProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={
        preferred ? `Unfavourite ${station}` : `Favourite ${station}`
      }
      accessibilityState={{ selected: preferred }}
      className={`flex-row items-center rounded-full px-4 py-2 border active:opacity-80 ${
        preferred ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <StyledText variant="body" className="text-sm">
        {station}
      </StyledText>
      <View className="ml-2">
        <MaterialIcons
          name={preferred ? "star" : "star-outline"}
          size={18}
          color={preferred ? "#f59e0b" : ICON_COLOR}
        />
      </View>
    </Pressable>
  );
}
