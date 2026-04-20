import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import type {
  MaterialTopTabBarProps,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { withLayoutContext } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Expo Router ships a bottom-tab navigator out of the box, but it has
 * no swipe gesture between tabs. To get a native swipe + slide
 * transition, we mount `@react-navigation/material-top-tabs` (backed
 * by `react-native-pager-view`) through `withLayoutContext`, pin the
 * tab bar to the bottom, and render our own bar so it looks identical
 * to the bottom-tab design.
 */
const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

type TabDef = {
  name: string;
  title: string;
  icon: React.ComponentProps<typeof IconSymbol>["name"];
};

// Order here drives the swipe order (left → right) and must match the
// order of `<MaterialTopTabs.Screen>` children below.
const TABS: readonly TabDef[] = [
  { name: "index", title: "Home", icon: "house.fill" },
  { name: "schedule", title: "Schedule", icon: "calendar" },
  { name: "exchange", title: "Exchange", icon: "arrow.triangle.2.circlepath" },
  { name: "time-off", title: "Time Off", icon: "clock.badge.checkmark" },
] as const;

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  return (
    <MaterialTopTabs
      // Bottom position moves the tab bar below the pager content and
      // keeps the active-tab indicator at the top edge of the bar —
      // the same visual affordance the bottom-tab navigator had.
      tabBarPosition="bottom"
      // Swipe is the whole point of this navigator. `swipeEnabled` is
      // true by default but we set it explicitly so intent is obvious.
      // `lazy` + `lazyPreloadDistance: 1` keeps the initial render
      // cheap while preloading the neighboring tab so swiping never
      // shows a blank screen mid-gesture.
      screenOptions={{
        swipeEnabled: true,
        lazy: true,
        lazyPreloadDistance: 1,
      }}
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          palette={palette}
          bottomInset={insets.bottom}
        />
      )}
    >
      {TABS.map((tab) => (
        <MaterialTopTabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title }}
        />
      ))}
    </MaterialTopTabs>
  );
}

/**
 * Custom bottom tab bar. Renders an icon + label per tab, with the
 * active one tinted. We own the layout so we can honor the safe-area
 * bottom inset and fire haptic feedback on press — both things the
 * default `MaterialTopTabBar` doesn't give us for free.
 */
type CustomTabBarProps = MaterialTopTabBarProps & {
  palette: (typeof Colors)[keyof typeof Colors];
  bottomInset: number;
};

function CustomTabBar({
  state,
  descriptors,
  navigation,
  palette,
  bottomInset,
}: CustomTabBarProps) {
  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomInset,
          backgroundColor: palette.background,
          borderTopColor: palette.icon,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;

        const isFocused = state.index === index;
        const color = isFocused ? palette.tabIconSelected : palette.tabIconDefault;

        const onPress = () => {
          if (Platform.OS === "ios") {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const label =
          typeof descriptor.options.title === "string"
            ? descriptor.options.title
            : tab.title;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={styles.tab}
            android_ripple={{ color: palette.icon, borderless: true }}
          >
            <IconSymbol size={24} name={tab.icon} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
  },
});
