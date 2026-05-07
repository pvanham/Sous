import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScreenWrapperProps {
  children: React.ReactNode;
  className?: string;
  /**
   * When false, skip the safe-area top padding. Useful for screens that
   * render beneath a persistent header (e.g. the in-tabs `AppHeader`)
   * which has already consumed the top inset.
   */
  includeTopInset?: boolean;
}

/**
 * Top-level wrapper for every screen. Uses useSafeAreaInsets() instead
 * of SafeAreaView because NativeWind v5's import rewrites don't cover
 * third-party components -- className on SafeAreaView is silently ignored,
 * causing flex-1 to not apply and the layout to collapse.
 */
export function ScreenWrapper({
  children,
  className = "",
  includeTopInset = true,
}: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-background px-4 ${className}`}
      style={{ paddingTop: includeTopInset ? insets.top : 0 }}
    >
      {children}
    </View>
  );
}
