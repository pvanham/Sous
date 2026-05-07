import { Stack } from "expo-router";

/**
 * Settings stack layout. Each "spoke" screen pushes on top of the
 * hub so the hardware back button (Android) and swipe-back gesture
 * (iOS) both return to the hub by default. We hide the native header
 * because every settings screen renders its own `<SettingsHeader>`
 * with the back button, title, and optional right accessory.
 */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
