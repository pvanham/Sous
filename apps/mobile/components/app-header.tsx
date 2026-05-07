import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { StyledText } from "@/components/ui/text";

/**
 * Persistent top-of-screen header rendered inside the (tabs) layout so
 * the profile avatar stays visible regardless of which tab is active.
 * The avatar opens the Settings hub; detailed profile edits are under
 * "Personal info" there.
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

  const goToSettings = () => {
    router.push("/settings");
  };

  return (
    <View
      className="bg-background"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-4 py-2">
        <StyledText variant="subtitle">Sous</StyledText>
        <Pressable
          onPress={goToSettings}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          className="w-10 h-10 rounded-full bg-primary items-center justify-center overflow-hidden active:opacity-80"
        >
          {user?.hasImage && user.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{ width: 40, height: 40 }}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <StyledText
              variant="label"
              className="text-primary-foreground text-sm"
            >
              {initials}
            </StyledText>
          )}
        </Pressable>
      </View>
    </View>
  );
}
