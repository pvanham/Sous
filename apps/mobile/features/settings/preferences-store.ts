import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Device-local preferences.
 *
 * Originally this store held both the theme override and a stack of
 * notification toggles. Push + email preferences moved server-side
 * (see `features/notifications`) once the backend dispatcher landed,
 * so the only field that still belongs on the device is the chosen
 * theme — every other knob is now keyed off the Clerk user id and
 * round-trips through `/api/me/notifications/preferences`.
 *
 * The persisted blob is bumped to v2 with a migration that drops the
 * old `notify*` fields if they're still hanging around from a
 * previously installed build. The migration is intentionally
 * forgiving: if anything looks malformed we fall back to the default
 * shape rather than crashing the app's first render.
 */

export type ThemePreference = "system" | "light" | "dark";

interface SettingsPreferencesState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = "@sous/settings-preferences";

export const useSettingsPreferences = create<SettingsPreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState, version) => {
        if (
          !persistedState ||
          typeof persistedState !== "object" ||
          Array.isArray(persistedState)
        ) {
          return { theme: "system" } satisfies Partial<SettingsPreferencesState>;
        }
        const previous = persistedState as Record<string, unknown>;
        const theme: ThemePreference =
          previous.theme === "light" ||
          previous.theme === "dark" ||
          previous.theme === "system"
            ? (previous.theme as ThemePreference)
            : "system";
        // v1 → v2: drop every `notify*` field; they now live in
        // `NotificationPreference` on the server.
        if (version < 2) {
          return { theme } satisfies Partial<SettingsPreferencesState>;
        }
        return { theme } satisfies Partial<SettingsPreferencesState>;
      },
    },
  ),
);
