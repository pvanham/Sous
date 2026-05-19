import { useCallback, useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useUpdateNotificationPreferencesMutation } from "@/features/notifications/hooks";
import { registerForPushNotifications } from "@/lib/notifications";
import { OnboardingHeader } from "../components/onboarding-header";
import { ONBOARDING_STEP_COUNT } from "../lib/steps";

const ICON_COLOR = "#78716c";

/**
 * Step 5 — Notifications.
 *
 * Single explicit ask for OS push permission. We deliberately
 * surface the prompt here (rather than relying on the silent
 * `registerForPushNotifications()` call in `_layout.tsx`) because
 * the silent call only runs after AuthGate confirms membership —
 * which on a brand-new account hasn't happened yet when iOS
 * traditionally pops the dialog.
 *
 * We also flip `channels.push` to `true` on the server so the
 * dispatcher actually delivers events to this user. Denying the OS
 * prompt is non-blocking: we leave the channel default (true) and
 * move on; the device simply won't be registered for push until
 * the user enables it from Settings → Notifications.
 */
export function NotificationsStepScreen() {
  const router = useRouter();
  const updatePrefs = useUpdateNotificationPreferencesMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToDone = useCallback(() => {
    router.replace("/(onboarding)/done" as never);
  }, [router]);

  const handleEnable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // `registerForPushNotifications` handles the platform-specific
      // permission prompt, channel setup, and token registration.
      // We don't care about the return value here — if the user
      // denies, we still update the channel preference so the
      // server intent is clear and they can flip it on later from
      // Settings → Notifications.
      await registerForPushNotifications();
      await updatePrefs.mutateAsync({ channels: { push: true } });
      goToDone();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not enable notifications.",
      );
    } finally {
      setBusy(false);
    }
  }, [updatePrefs, goToDone]);

  const handleSkip = useCallback(async () => {
    // Don't fire the permission prompt — just mark the preference
    // so the server-side dispatcher knows not to expect a token
    // for now. We use the same mutation for symmetry; if it fails
    // we still let the user advance.
    setBusy(true);
    try {
      await updatePrefs.mutateAsync({ channels: { push: false } });
    } catch {
      // best-effort; user can revisit from Settings
    } finally {
      setBusy(false);
      goToDone();
    }
  }, [updatePrefs, goToDone]);

  // Inspect (don't request) the current permission state on mount
  // so we can show the "already enabled" copy without firing the
  // OS prompt prematurely. `getPermissionsAsync` is read-only and
  // safe to call repeatedly.
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Expo's PermissionsStatus type uses union-discriminated
      // `status` strings; the public type surface omits the field
      // on the base interface, so we cast (matching the existing
      // pattern in `apps/mobile/lib/notifications.ts`).
      const current = await Notifications.getPermissionsAsync();
      const status = (current as { status?: string }).status;
      if (!cancelled) setGranted(status === "granted");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader step={4} totalSteps={ONBOARDING_STEP_COUNT} />
      <ScrollView contentContainerClassName="flex-grow px-4 pt-6 pb-10">
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-3xl bg-primary items-center justify-center mb-4 shadow-sm">
            <MaterialIcons name="notifications-active" size={40} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-2xl text-center">
            Stay in the loop
          </StyledText>
          <StyledText variant="caption" className="mt-2 text-center text-sm px-2">
            Turn on push notifications and we&apos;ll let you know the
            moment your schedule changes.
          </StyledText>
        </View>

        <View className="bg-card border border-border rounded-2xl px-5 py-4 mb-6">
          <NotificationRow
            icon="event-available"
            title="New shifts"
            description="When your manager publishes a week."
          />
          <NotificationRow
            icon="swap-horiz"
            title="Shift changes"
            description="A shift gets added, moved, or swapped out."
          />
          <NotificationRow
            icon="campaign"
            title="Announcements"
            description="Team-wide posts pinned to your home tab."
            isLast
          />
        </View>

        {granted === true ? (
          <View className="border border-primary rounded-md px-3 py-2 mb-3">
            <StyledText variant="caption" className="text-sm">
              Notifications are already enabled on this device.
            </StyledText>
          </View>
        ) : null}

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mb-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        <Button
          title={granted === true ? "Continue" : "Enable notifications"}
          onPress={handleEnable}
          loading={busy}
          disabled={busy}
          size="lg"
        />
        <Button
          title="Not now"
          onPress={handleSkip}
          variant="ghost"
          disabled={busy}
          size="lg"
          className="mt-2"
        />
      </ScrollView>
    </View>
  );
}

interface NotificationRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  description: string;
  isLast?: boolean;
}

function NotificationRow({ icon, title, description, isLast }: NotificationRowProps) {
  return (
    <View
      className={`flex-row items-start py-3 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
        <MaterialIcons name={icon} size={18} color={ICON_COLOR} />
      </View>
      <View className="flex-1 pl-3">
        <StyledText variant="body" className="font-semibold">
          {title}
        </StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {description}
        </StyledText>
      </View>
    </View>
  );
}
