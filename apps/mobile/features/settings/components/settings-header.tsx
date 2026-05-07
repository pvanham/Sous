import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StyledText } from "@/components/ui/text";

const ICON_COLOR = "#78716c";

interface SettingsHeaderProps {
  title: string;
  /**
   * Optional right-aligned accessory (e.g. a "Save" button). Passed
   * through as a React node so each settings screen owns its own
   * primary action; the back button is always on the left.
   */
  rightAccessory?: React.ReactNode;
}

/**
 * Shared header for every settings spoke screen. Keeps the back
 * button, title alignment, and safe-area inset handling consistent
 * across the Settings stack. Mirrors the pattern used by the Profile
 * screen so the two surfaces look like one product.
 */
export function SettingsHeader({ title, rightAccessory }: SettingsHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/settings");
            }
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-10 h-10 items-center justify-center -ml-2 active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={ICON_COLOR} />
        </Pressable>
        <StyledText variant="subtitle">{title}</StyledText>
        <View className="min-w-10 items-end">{rightAccessory}</View>
      </View>
    </View>
  );
}
