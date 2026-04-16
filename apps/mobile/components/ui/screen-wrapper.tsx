import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScreenWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Top-level wrapper for every screen. Uses useSafeAreaInsets() instead
 * of SafeAreaView because NativeWind v5's import rewrites don't cover
 * third-party components -- className on SafeAreaView is silently ignored,
 * causing flex-1 to not apply and the layout to collapse.
 */
export function ScreenWrapper({ children, className = "" }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-background px-4 ${className}`}
      style={{ paddingTop: insets.top }}
    >
      {children}
    </View>
  );
}
