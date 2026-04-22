import { View, Pressable, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { SettingsHeader } from "../components/settings-header";
import {
  useSettingsPreferences,
  type ThemePreference,
} from "../preferences-store";

const CHEVRON_COLOR = "#a8a29e";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
}> = [
  {
    value: "system",
    label: "System",
    description: "Match your device's appearance",
    icon: "brightness-auto",
  },
  {
    value: "light",
    label: "Light",
    description: "Always use the light theme",
    icon: "light-mode",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark theme",
    icon: "dark-mode",
  },
];

/**
 * Appearance (theme) screen. Pick between System, Light, and Dark.
 * The choice is persisted locally (AsyncStorage) and applied to
 * React Native's `Appearance` API at the root layout, which
 * NativeWind reads to pick between the `:root` and
 * `prefers-color-scheme: dark` branches of `global.css`.
 */
export function AppearanceScreen() {
  const theme = useSettingsPreferences((s) => s.theme);
  const setTheme = useSettingsPreferences((s) => s.setTheme);

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Appearance" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <StyledText variant="caption" className="uppercase tracking-wider mb-2">
          Theme
        </StyledText>
        <View className="bg-card border border-border rounded-md overflow-hidden">
          {OPTIONS.map((option, index) => {
            const selected = theme === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTheme(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                className={`flex-row items-center px-4 py-3 active:opacity-80 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <MaterialIcons
                  name={option.icon}
                  size={22}
                  color={CHEVRON_COLOR}
                />
                <View className="flex-1 px-3">
                  <StyledText variant="body">{option.label}</StyledText>
                  <StyledText variant="caption" className="mt-0.5">
                    {option.description}
                  </StyledText>
                </View>
                {selected ? (
                  <MaterialIcons name="check" size={22} color="#b45309" />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <StyledText variant="caption" className="mt-4">
          Your choice is saved to this device. Changes apply immediately.
        </StyledText>
      </ScrollView>
    </View>
  );
}
