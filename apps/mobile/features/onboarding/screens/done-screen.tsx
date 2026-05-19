import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useCompleteOnboarding } from "../hooks";
import { OnboardingHeader } from "../components/onboarding-header";
import { ONBOARDING_STEP_COUNT } from "../lib/steps";

/**
 * Step 6 — Done. The "Get started" CTA stamps
 * `onboardingCompletedAt` server-side and primes the
 * `useMyStaff` cache so AuthGate sees the new value on the next
 * render and routes into the tabs.
 *
 * We do not call `router.replace("/(tabs)")` ourselves — letting
 * AuthGate run keeps the redirect logic centralised, so a future
 * flag (e.g. "needs to acknowledge a new ToS") would automatically
 * fire here without changes to this screen.
 */
export function DoneScreen() {
  const router = useRouter();
  const completeMutation = useCompleteOnboarding();
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      await completeMutation.mutateAsync();
      // AuthGate will redirect to /(tabs) once the cache update
      // settles. Fallback router push covers the edge case where
      // AuthGate's effect dependencies don't re-fire (very rare —
      // typically a sign of a stale TanStack subscription).
      router.replace("/(tabs)" as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not finish onboarding.",
      );
    }
  }, [completeMutation, router]);

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader
        step={null}
        totalSteps={ONBOARDING_STEP_COUNT}
        canGoBack={false}
      />
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 pb-10">
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-primary items-center justify-center mb-6 shadow-sm">
            <MaterialIcons name="check-circle" size={56} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-3xl text-center">
            You&apos;re all set
          </StyledText>
          <StyledText variant="caption" className="mt-3 text-center text-base px-2">
            Welcome to Sous. Your manager can now schedule you for shifts
            and you&apos;ll get push notifications whenever something
            changes.
          </StyledText>
        </View>

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mb-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        <Button
          title="Get started"
          onPress={handleStart}
          loading={completeMutation.isPending}
          disabled={completeMutation.isPending}
          size="lg"
        />
      </ScrollView>
    </View>
  );
}
