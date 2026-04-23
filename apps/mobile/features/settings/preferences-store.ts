import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Client-side preferences that are **not** tied to the server.
 *
 * Why these live outside react-query
 *   - Theme / notification toggles are device-local. Persisting them
 *     through the query cache would pointlessly round-trip them to a
 *     server that (currently) has nothing to do with them.
 *   - AsyncStorage persistence gives us a "remember the user's choice
 *     across app restarts" experience that feels native without
 *     adding any new network calls.
 *
 * The push + email notification toggles stay here until the backend
 * actually ships those channels — the issue (SHI-19) explicitly calls
 * out that they'll be wired in later. Storing them locally today means
 * that when the channel lands we can flip the UI from "local only" to
 * "sync with server" without changing the settings screen shape.
 */

export type ThemePreference = "system" | "light" | "dark";

interface SettingsPreferencesState {
  theme: ThemePreference;
  notifyPush: boolean;
  notifyEmail: boolean;
  notifyScheduleUpdates: boolean;
  notifyTimeOffUpdates: boolean;
  notifyExchangeUpdates: boolean;
  setTheme: (theme: ThemePreference) => void;
  setNotifyPush: (enabled: boolean) => void;
  setNotifyEmail: (enabled: boolean) => void;
  setNotifyScheduleUpdates: (enabled: boolean) => void;
  setNotifyTimeOffUpdates: (enabled: boolean) => void;
  setNotifyExchangeUpdates: (enabled: boolean) => void;
}

const STORAGE_KEY = "@sous/settings-preferences";

export const useSettingsPreferences = create<SettingsPreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      notifyPush: true,
      notifyEmail: true,
      notifyScheduleUpdates: true,
      notifyTimeOffUpdates: true,
      notifyExchangeUpdates: true,
      setTheme: (theme) => set({ theme }),
      setNotifyPush: (notifyPush) => set({ notifyPush }),
      setNotifyEmail: (notifyEmail) => set({ notifyEmail }),
      setNotifyScheduleUpdates: (notifyScheduleUpdates) =>
        set({ notifyScheduleUpdates }),
      setNotifyTimeOffUpdates: (notifyTimeOffUpdates) =>
        set({ notifyTimeOffUpdates }),
      setNotifyExchangeUpdates: (notifyExchangeUpdates) =>
        set({ notifyExchangeUpdates }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
