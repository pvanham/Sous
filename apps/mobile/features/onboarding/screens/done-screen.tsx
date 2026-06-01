import { useCallback, useMemo, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useMyStaff } from "@/features/profile/hooks";
import { useMyAvailability } from "@/features/settings/hooks";
import { useCompleteOnboarding } from "../hooks";
import { OnboardingHeader } from "../components/onboarding-header";
import { useOnboardingNav } from "../use-onboarding-nav";
import { indexOfStepId } from "../lib/steps";
import {
  buildOnboardingChecklist,
  type OnboardingChecklistItem,
} from "../lib/completion";

const ICON_COLOR = "#78716c";

/**
 * Done — the final screen. "Get started" stamps
 * `onboardingCompletedAt` server-side and primes the `useMyStaff`
 * cache so AuthGate routes into the tabs.
 *
 * Before the user can finish we verify the required steps (profile +
 * availability) are actually complete, using the same rules the server
 * enforces. If anything's missing we show it as a tappable row that
 * jumps straight back to the relevant step, so the user is never stuck
 * staring at a disabled button without knowing why.
 */
export function DoneScreen() {
  const router = useRouter();
  const { goToIndex } = useOnboardingNav("done");
  const completeMutation = useCompleteOnboarding();
  const myStaffQuery = useMyStaff();
  const availabilityQuery = useMyAvailability();
  const [error, setError] = useState<string | null>(null);

  const { items, complete } = useMemo(
    () =>
      buildOnboardingChecklist(
        myStaffQuery.data ?? null,
        availabilityQuery.data ?? [],
      ),
    [myStaffQuery.data, availabilityQuery.data],
  );

  const loadingChecklist = myStaffQuery.isLoading || availabilityQuery.isLoading;

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      await completeMutation.mutateAsync();
      // AuthGate redirects to /(tabs) once the cache update settles;
      // this replace is a fallback for the rare case its effect deps
      // don't re-fire.
      router.replace("/(tabs)" as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not finish onboarding.",
      );
    }
  }, [completeMutation, router]);

  const jumpTo = useCallback(
    (item: OnboardingChecklistItem) => {
      const index = indexOfStepId(item.stepId);
      if (index >= 0) goToIndex(index);
    },
    [goToIndex],
  );

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader currentStepId="done" />
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 pb-10">
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-primary items-center justify-center mb-6 shadow-sm">
            <MaterialIcons name="check-circle" size={56} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-3xl text-center">
            {complete ? "You're all set" : "Almost there"}
          </StyledText>
          <StyledText variant="caption" className="mt-3 text-center text-base px-2">
            {complete
              ? "Welcome to Sous. Your manager can now schedule you for shifts and you'll get push notifications whenever something changes."
              : "Just a couple of things left before we can finish setting up your account."}
          </StyledText>
        </View>

        {!loadingChecklist && !complete ? (
          <View className="bg-card border border-border rounded-2xl px-3 py-1 mb-6">
            {items.map((item, index) => (
              <Pressable
                key={item.stepId}
                onPress={() => jumpTo(item)}
                disabled={item.done}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}${item.done ? " (done)" : " — needs attention"}`}
                className={`flex-row items-center py-3 px-2 ${
                  index > 0 ? "border-t border-border" : ""
                } ${item.done ? "" : "active:opacity-70"}`}
              >
                <MaterialIcons
                  name={item.done ? "check-circle" : "radio-button-unchecked"}
                  size={22}
                  color={item.done ? "#16a34a" : ICON_COLOR}
                />
                <StyledText
                  variant="body"
                  className={`flex-1 ml-3 ${item.done ? "text-muted-foreground" : "font-semibold"}`}
                >
                  {item.label}
                </StyledText>
                {!item.done ? (
                  <MaterialIcons name="chevron-right" size={22} color={ICON_COLOR} />
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mb-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        <Button
          title={complete ? "Get started" : "Finish remaining steps"}
          onPress={complete ? handleStart : () => {
            const firstIncomplete = items.find((item) => !item.done);
            if (firstIncomplete) jumpTo(firstIncomplete);
          }}
          loading={completeMutation.isPending}
          disabled={completeMutation.isPending || loadingChecklist}
          size="lg"
        />
      </ScrollView>
    </View>
  );
}
