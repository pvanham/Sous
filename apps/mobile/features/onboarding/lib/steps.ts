/**
 * Canonical, ordered list of wizard steps. The route file at
 * `apps/mobile/app/(onboarding)/<id>.tsx` corresponds 1:1 with each
 * entry, and the layout uses this list to compute resume targets +
 * progress dots.
 *
 * `Welcome` and `Done` are not counted in the progress UI (the user
 * doesn't think of them as data-entry steps), so they map to
 * `step: null`. The non-trivial steps are numbered 1..4 so the
 * progress bar at the top shows exactly the steps that require
 * user input.
 *
 * Route strings are typed as plain `string` because Expo Router's
 * `Href` codegen lags behind newly-added route groups; the runtime
 * still resolves them correctly.
 */
export interface OnboardingStep {
  id: "welcome" | "profile" | "stations" | "availability" | "notifications" | "done";
  route: string;
  /**
   * 1-indexed position in the progress UI, or `null` if this step
   * should not increment the indicator (welcome / done).
   */
  step: number | null;
}

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  { id: "welcome", route: "/(onboarding)/welcome", step: null },
  { id: "profile", route: "/(onboarding)/profile", step: 1 },
  { id: "stations", route: "/(onboarding)/stations", step: 2 },
  { id: "availability", route: "/(onboarding)/availability", step: 3 },
  { id: "notifications", route: "/(onboarding)/notifications", step: 4 },
  { id: "done", route: "/(onboarding)/done", step: null },
];

/** Number of data-entry steps shown in the progress indicator. */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.filter(
  (s) => s.step !== null,
).length;
