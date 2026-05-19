import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";

import { useMyStaff } from "@/features/profile/hooks";
import { useMyAvailability } from "@/features/settings/hooks";

/**
 * Onboarding wizard route group.
 *
 * Resume logic — on first mount we inspect the user's Staff record
 * + availability rows and jump to the highest unfinished step. This
 * keeps the wizard resilient to mid-flow drop-offs: the user can
 * close the app on step 3, reopen tomorrow, and pick back up at
 * the right point without losing entered data.
 *
 * The resume effect only redirects when the user lands on
 * `welcome` — explicit deep-links into a later step (rare, but
 * possible via internal navigation) are respected. We exit
 * silently if `onboardingCompletedAt` is already set: AuthGate
 * will route the user out of `(onboarding)` on the next render.
 */
export default function OnboardingLayout() {
  const router = useRouter();
  const segments = useSegments();
  const myStaffQuery = useMyStaff();
  const availabilityQuery = useMyAvailability();

  useEffect(() => {
    if (myStaffQuery.isLoading || availabilityQuery.isLoading) return;
    const staff = myStaffQuery.data;
    if (!staff) return;
    if (staff.onboardingCompletedAt !== null) return;

    // `segments` looks like ["(onboarding)", "welcome"] when the
    // user has just landed. We only auto-advance from the
    // welcome screen — any deeper position means the user
    // chose to be there. We cast to `string` because Expo Router's
    // typed segments don't always know about new route groups
    // until typegen runs after a fresh dev/build.
    const currentLeaf = segments[segments.length - 1] as string;
    if (currentLeaf !== "welcome") return;

    const hasPhone = Boolean(staff.phone);
    const hasSkills = staff.skills.length > 0;
    const hasPreferredStations = staff.preferredStations.length > 0;
    const hasAvailabilityRows = (availabilityQuery.data ?? []).some(
      (row) => row.preference !== "unavailable",
    );

    // Each branch picks the first uncompleted step. The order
    // mirrors `ONBOARDING_STEPS` (lib/steps.ts).
    if (!hasPhone) return; // Stay on welcome → user advances manually.
    if (hasSkills && !hasPreferredStations) {
      router.replace("/(onboarding)/stations" as never);
      return;
    }
    if (!hasAvailabilityRows) {
      router.replace("/(onboarding)/availability" as never);
      return;
    }
    router.replace("/(onboarding)/notifications" as never);
  }, [
    myStaffQuery.isLoading,
    myStaffQuery.data,
    availabilityQuery.isLoading,
    availabilityQuery.data,
    segments,
    router,
  ]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
    />
  );
}
