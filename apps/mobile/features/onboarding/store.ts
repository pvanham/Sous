import { create } from "zustand";

/**
 * Tracks how far the user has progressed through the onboarding
 * wizard within the current session, by index into `ONBOARDING_STEPS`
 * (see `lib/steps.ts`).
 *
 * All step-to-step navigation uses `router.replace` (no native back
 * stack), so we can't rely on `router.canGoBack()` to power the
 * progress dots / back button. Instead we record the furthest step
 * reached here: the user may freely jump backward and forward between
 * any step they've already seen, but can't skip ahead past steps they
 * haven't reached yet (forward progress still goes through each
 * step's "Next" CTA, which validates + saves).
 */
interface OnboardingNavStore {
  /** Highest index into `ONBOARDING_STEPS` the user has visited. */
  furthestIndex: number;
  /** Record a visit to `index`; only ever moves the marker forward. */
  visit: (index: number) => void;
  /** Reset to the start of the wizard (called when the group mounts). */
  reset: () => void;
}

export const useOnboardingNavStore = create<OnboardingNavStore>((set) => ({
  furthestIndex: 0,
  visit: (index) =>
    set((state) =>
      index > state.furthestIndex ? { furthestIndex: index } : state,
    ),
  reset: () => set({ furthestIndex: 0 }),
}));
