import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          borderTopColor: Colors[colorScheme ?? "light"].icon,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="calendar" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="exchange"
        options={{
          title: "Exchange",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="arrow.triangle.2.circlepath"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="time-off"
        options={{
          title: "Time Off",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="clock.badge.checkmark"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
