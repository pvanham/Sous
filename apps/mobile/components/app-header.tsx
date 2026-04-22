import { View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StyledText } from "@/components/ui/text";

const ICON_COLOR = "#78716c";

/**
 * Persistent top-of-screen header rendered inside the (tabs) layout so
 * the profile avatar and settings cog stay visible regardless of which
 * tab is active. The avatar navigates to the profile page; the cog is
 * a placeholder that will eventually open settings.
 *
 * The header owns the top safe-area inset on behalf of the tab
 * screens: inside the (tabs) stack, screens render with
 * `includeTopInset={false}` so there is no double-padding.
 */
export function AppHeader() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const initials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(
        user.lastName?.[0] ?? ""
      ).toUpperCase()}` || "?"
    : "?";

  const goToProfile = () => {
    router.push("/profile");
  };

  const goToSettings = () => {
    // Settings isn't implemented yet; surface a friendly message
    // instead of navigating to a nonexistent route. Remove this
    // once a real `/settings` route lands.
    Alert.alert("Settings", "Settings are coming soon.");
  };

  return (
    <View
      className="bg-background"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-4 py-2">
        <StyledText variant="subtitle">Sous</StyledText>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={goToProfile}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            className="w-10 h-10 rounded-full bg-primary items-center justify-center active:opacity-80"
          >
            <StyledText
              variant="label"
              className="text-primary-foreground text-sm"
            >
              {initials}
            </StyledText>
          </Pressable>
          <Pressable
            onPress={goToSettings}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:opacity-60"
          >
            <MaterialIcons name="settings" size={20} color={ICON_COLOR} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
