import { apiClient } from "@/lib/api-client";
import type {
  NotificationPreferencesDTO,
  RegisterDeviceTokenInput,
  UpdateNotificationPreferencesInput,
} from "@sous/types";

/**
 * Fetch the signed-in user's notification preferences. The web API
 * lazily creates a default record on first read, so this endpoint is
 * safe to call at any time after sign-in (no separate "ensure"
 * round-trip required).
 */
export async function fetchNotificationPreferences(): Promise<NotificationPreferencesDTO> {
  const response = await apiClient.get<NotificationPreferencesDTO>(
    "/me/notifications/preferences",
  );
  return response.data;
}

/**
 * Apply a partial patch to the signed-in user's notification
 * preferences. Returns the canonical post-merge document so callers
 * (and the local TanStack cache) see exactly the same shape the
 * server stored.
 */
export async function patchNotificationPreferences(
  patch: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferencesDTO> {
  const response = await apiClient.patch<NotificationPreferencesDTO>(
    "/me/notifications/preferences",
    patch,
  );
  return response.data;
}

/**
 * Register (or refresh) the current device's Expo push token with the
 * backend. The endpoint upserts on `(clerkUserId, expoPushToken)`, so
 * calling this on every cold start is the supported pattern — it
 * keeps `lastSeenAt` fresh for tokens that survive across launches and
 * resurrects any token that was previously soft-revoked.
 */
export async function registerDeviceToken(
  input: RegisterDeviceTokenInput,
): Promise<{ id: string }> {
  const response = await apiClient.post<{ id: string }>(
    "/me/notifications/devices",
    input,
  );
  return response.data;
}

/**
 * Soft-revoke a single push token for the signed-in user. Used by
 * `useSignOut` so we stop pushing to the device once the user has
 * left, even if the OS-level token persists for the next user.
 */
export async function revokeDeviceToken(token: string): Promise<void> {
  await apiClient.delete("/me/notifications/devices", {
    params: { token },
  });
}
