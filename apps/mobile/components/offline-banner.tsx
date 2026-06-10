import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { useIsOffline } from "@/hooks/use-network-state";

/**
 * Global "No Internet Connection" banner.
 *
 * Both app stores reject apps that show a blank screen or crash when
 * the network drops (a real scenario for kitchen staff walking into a
 * freezer). This banner gives a graceful, persistent signal while the
 * device is offline. Cached data stays visible underneath because
 * TanStack Query keeps serving the last successful response; this only
 * communicates the connectivity state.
 *
 * Rendered once at the root, above the navigator, so it appears on
 * every screen (auth, onboarding, tabs, settings). It is pinned to the
 * top below the safe-area inset and uses `pointerEvents="none"` so it
 * never intercepts taps on the UI beneath it.
 */
export function OfflineBanner() {
  const isOffline = useIsOffline();
  const insets = useSafeAreaInsets();

  if (!isOffline) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel="No internet connection"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top,
        zIndex: 1000,
        elevation: 1000,
      }}
    >
      <View className="flex-row items-center justify-center gap-2 bg-destructive px-4 py-2">
        <MaterialIcons name="wifi-off" size={16} color="#fef2f2" />
        <StyledText
          variant="label"
          className="text-destructive-foreground text-sm font-semibold"
        >
          No Internet Connection
        </StyledText>
      </View>
    </View>
  );
}
