import { useEffect } from "react";
import { Stack } from "expo-router";

import { useOnboardingNavStore } from "@/features/onboarding/store";

/**
 * Onboarding wizard route group.
 *
 * AuthGate sends every un-onboarded staff member to
 * `(onboarding)/welcome`, and the wizard always starts there: the
 * user steps through welcome → profile → stations → availability →
 * notifications → done in order. We deliberately do NOT auto-skip
 * ahead based on pre-seeded data (a manager almost always sets phone
 * and skills at invite time, which previously bumped the user past
 * the profile step and made them land on "2/4"). Each step still
 * hydrates from the server cache, so re-entering the flow shows any
 * data already saved.
 *
 * Step-to-step navigation is `replace`-based (see `use-onboarding-nav`),
 * so we reset the "furthest reached" marker whenever the group mounts
 * to start every fresh run at the beginning.
 */
export default function OnboardingLayout() {
  const reset = useOnboardingNavStore((s) => s.reset);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
    />
  );
}
