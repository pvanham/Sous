import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { registerDeviceToken, revokeDeviceToken } from "@/features/notifications/api";

/**
 * Mobile push notification glue.
 *
 * This module is the single owner of every Expo notifications side
 * effect on the client:
 *   - Foreground presentation policy (banner + sound + badge).
 *   - Android channel creation for the default category.
 *   - Permission prompt + native push token retrieval.
 *   - Backend registration + revocation via /api/me/notifications/devices.
 *   - Notification-tap handler that deep-links the user back into the
 *     app via the URL embedded in `data.url`.
 *
 * Everything here is best-effort: failure to set up notifications
 * must never block the app boot. We log structured warnings so the
 * native logs in dev clients (`xcrun simctl spawn ...`) and EAS
 * production logs surface a useful trail without crashing.
 */

const LOG = "[mobile.notifications]";

let lastRegisteredToken: string | null = null;
let isHandlerConfigured = false;
let responseListener: Notifications.Subscription | null = null;

function setHandlerOnce(): void {
  if (isHandlerConfigured) return;
  isHandlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Resolve the EAS project id baked into Expo Constants. Required by
 * `getExpoPushTokenAsync` from SDK 49+. We fall back through both
 * possible Expo Constants surfaces because the legacy `manifest`
 * shape still appears in some dev clients.
 */
function resolveProjectId(): string | undefined {
  const fromExpoConfig = (Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
  }).expoConfig?.extra?.eas?.projectId;
  if (fromExpoConfig) return fromExpoConfig;
  const fromEasConfig = (Constants as unknown as {
    easConfig?: { projectId?: string };
  }).easConfig?.projectId;
  return fromEasConfig;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1c1917",
    showBadge: false,
  });
}

function isPermissionGranted(
  settings: Notifications.NotificationPermissionsStatus,
): boolean {
  // Cross-platform: `status === "granted"` is the canonical Expo
  // signal. On iOS we additionally accept PROVISIONAL because the
  // OS will silently deliver notifications without an alert in
  // that mode and we'd rather over-deliver than swallow.
  if ((settings as { status?: string }).status === "granted") return true;
  if (
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  return false;
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(current)) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowProvisional: false,
    },
  });
  return isPermissionGranted(requested);
}

/**
 * Acquire a fresh Expo push token and POST it to the backend so the
 * dispatcher can target this device. Idempotent — calling it twice
 * with the same OS-level token is a no-op on the server (upsert).
 *
 * Returns the registered token on success and `null` on any failure
 * (no permission, simulator, no project id, network error). Callers
 * should treat the absence of a token as "this device just won't
 * receive push" — never as an error to surface to the user.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  setHandlerOnce();

  if (!Device.isDevice) {
    console.warn(`${LOG} skipping push registration on simulator/emulator`);
    return null;
  }

  try {
    await ensureAndroidChannel();
    const granted = await ensurePermission();
    if (!granted) {
      console.warn(`${LOG} permission denied; skipping push registration`);
      return null;
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn(
        `${LOG} no EAS projectId in Constants; cannot fetch push token`,
      );
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResponse?.data;
    if (!token) {
      console.warn(`${LOG} getExpoPushTokenAsync returned no token`);
      return null;
    }

    const platform = Platform.OS === "ios" ? "ios" : "android";
    const deviceName =
      Device.deviceName ?? `${Device.modelName ?? "Unknown"} (${Device.osName ?? platform})`;
    await registerDeviceToken({ expoPushToken: token, platform, deviceName });
    lastRegisteredToken = token;
    return token;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.warn(`${LOG} push registration failed: ${message}`);
    return null;
  }
}

/**
 * Soft-revoke the most recently registered token for this device.
 *
 * Called from the sign-out hook so the dispatcher stops pushing to
 * a device that has just been handed off (e.g. shared iPad in the
 * back of house). The OS-level token may persist across users; the
 * server-side `revokedAt` flag is what guarantees the previous user
 * can't be tracked through it.
 */
export async function unregisterDeviceForCurrentUser(): Promise<void> {
  if (!lastRegisteredToken) return;
  try {
    await revokeDeviceToken(lastRegisteredToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.warn(`${LOG} failed to revoke device on sign-out: ${message}`);
  } finally {
    lastRegisteredToken = null;
  }
}

/**
 * Wire a tap-on-notification listener that deep-links the user back
 * into the app via the URL stored on `data.url`. We use Expo Router's
 * URL-based navigation — push payloads carry strings like
 * `sous://schedule` which `Linking.openURL` (Expo Router subscribes
 * to it) routes to the right screen.
 *
 * Returns a cleanup function so the caller can `useEffect` it.
 */
export function attachNotificationTapHandler(
  onTap: (url: string | null) => void,
): () => void {
  setHandlerOnce();
  if (responseListener) {
    responseListener.remove();
    responseListener = null;
  }
  responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const url = typeof data?.url === "string" ? data.url : null;
      onTap(url);
    },
  );
  return () => {
    responseListener?.remove();
    responseListener = null;
  };
}
