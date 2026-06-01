import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "expo-router";

import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  type OnboardingStepId,
} from "./lib/steps";
import { useOnboardingNavStore } from "./store";

export type { OnboardingStepId };

/** Index of the first data-entry step (profile) — the back-nav floor. */
const FIRST_DATA_INDEX = ONBOARDING_STEPS.findIndex((s) => s.step !== null);

/**
 * Navigation controller for a single onboarding step. Every step
 * screen (and the shared header) calls this with its own id to get a
 * consistent set of move helpers plus the data the progress UI needs.
 *
 * Forward/back moves use `router.replace` so the wizard never builds
 * a deep history stack; the "furthest reached" marker in the store is
 * what gates which steps the progress dots can jump to.
 */
export function useOnboardingNav(currentId: OnboardingStepId) {
  const router = useRouter();
  const furthestIndex = useOnboardingNavStore((s) => s.furthestIndex);
  const visit = useOnboardingNavStore((s) => s.visit);

  const currentIndex = useMemo(
    () => ONBOARDING_STEPS.findIndex((s) => s.id === currentId),
    [currentId],
  );

  // Remember the furthest point reached so the user can hop back here
  // later via the progress dots.
  useEffect(() => {
    if (currentIndex >= 0) visit(currentIndex);
  }, [currentIndex, visit]);

  const goToIndex = useCallback(
    (index: number) => {
      const target = ONBOARDING_STEPS[index];
      if (!target) return;
      router.replace(target.route as never);
    },
    [router],
  );

  const goNext = useCallback(() => {
    goToIndex(currentIndex + 1);
  }, [goToIndex, currentIndex]);

  const goBack = useCallback(() => {
    goToIndex(currentIndex - 1);
  }, [goToIndex, currentIndex]);

  const current = ONBOARDING_STEPS[currentIndex];
  const canGoBack =
    current?.step !== null && currentIndex > FIRST_DATA_INDEX;

  return {
    /** 1-indexed data-step number, or `null` for welcome / done. */
    step: current?.step ?? null,
    totalSteps: ONBOARDING_STEP_COUNT,
    currentIndex,
    furthestIndex,
    canGoBack,
    goNext,
    goBack,
    goToIndex,
  };
}
