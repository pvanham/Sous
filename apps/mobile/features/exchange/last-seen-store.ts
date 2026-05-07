import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────
// Exchange "last seen" marker.
//
// Tracks the millisecond timestamp of the last time the user opened
// the Exchange tab. Used to render:
//   • An unseen-activity indicator on the bottom tab bar, and
//   • A transient banner inside `ExchangeScreen` when a manager
//     approval / denial (or fresh pickup on one of the user's
//     drops) has landed since their last visit.
//
// Persisted via AsyncStorage so the marker survives cold launches.
// `hasHydrated` starts false and flips true once AsyncStorage has
// reported back — consumers should short-circuit unseen-count
// calculations until then to avoid a misleading "first-launch
// badge flood".
// ─────────────────────────────────────────────────────────────

interface ExchangeLastSeenState {
  /** Milliseconds since epoch of the last visit, or `null` if never. */
  lastSeenAt: number | null;
  /** True once the value has been read back from AsyncStorage. */
  hasHydrated: boolean;
  /** Stamp the current time as the latest visit. */
  markSeen: () => void;
  /** Internal — flipped by the persist middleware on rehydrate. */
  setHasHydrated: (value: boolean) => void;
}

export const useExchangeLastSeen = create<ExchangeLastSeenState>()(
  persist(
    (set) => ({
      lastSeenAt: null,
      hasHydrated: false,
      markSeen: () => set({ lastSeenAt: Date.now() }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "exchange:lastSeen",
      storage: createJSONStorage(() => AsyncStorage),
      // `hasHydrated` itself should not be persisted; it's a runtime
      // signal about the current process, not about saved state.
      partialize: (state) => ({ lastSeenAt: state.lastSeenAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
