import { useColorScheme as useSystemColorScheme } from "react-native";
import { useSettingsPreferences } from "@/features/settings/preferences-store";

/**
 * Resolve the effective color scheme the app should render right now
 * by combining the device's system scheme (`light` | `dark`) with the
 * user's persisted override from the Settings screen.
 *
 * Usage
 *   ```tsx
 *   const scheme = useEffectiveColorScheme(); // "light" | "dark"
 *   ```
 *
 * Feeding this into React Navigation's ThemeProvider and to the
 * native `StatusBar` keeps chrome + status bar consistent with
 * NativeWind's CSS-variable-driven theme.
 */
export function useEffectiveColorScheme(): "light" | "dark" {
  const system = useSystemColorScheme();
  const preference = useSettingsPreferences((s) => s.theme);
  if (preference === "system") {
    return system === "dark" ? "dark" : "light";
  }
  return preference;
}
