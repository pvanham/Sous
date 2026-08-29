"use server";

import { auth } from "@clerk/nextjs/server";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { WebNotificationPreferenceService } from "@/server/services/web-notification-preference.service";
import { updateWebNotificationPreferencesSchema } from "@sous/types";
import type { ActionResponse } from "@/lib/safe-action";
import type { WebNotificationPreferencesDTO } from "@/types/notification";

/**
 * Read the current user's web (manager/owner, email-only) notification
 * preferences, seeding defaults on first access.
 *
 * These are distinct from the mobile preference matrix and are only
 * relevant to owners / managers, so the action rejects staff-role
 * members (the settings layout already gates the page, but actions
 * defend independently).
 */
export async function getWebNotificationPreferences(): Promise<
  ActionResponse<WebNotificationPreferencesDTO>
> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const ctx = await getLocationContext(userId);
    if (ctx.role === "staff") {
      return { success: false, error: "Forbidden" };
    }

    const prefs = await WebNotificationPreferenceService.getOrCreate(userId);
    return { success: true, data: prefs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load notification preferences";
    return { success: false, error: message };
  }
}

/**
 * Apply a partial patch to the current user's web notification
 * preferences (master email switch and/or per-category email toggles).
 *
 * @param input - Unvalidated patch from the client.
 */
export async function updateWebNotificationPreferences(
  input: unknown,
): Promise<ActionResponse<WebNotificationPreferencesDTO>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const parsed = updateWebNotificationPreferencesSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: message };
    }

    const ctx = await getLocationContext(userId);
    if (ctx.role === "staff") {
      return { success: false, error: "Forbidden" };
    }

    const prefs = await WebNotificationPreferenceService.update(
      userId,
      parsed.data,
    );
    return { success: true, data: prefs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update notification preferences";
    return { success: false, error: message };
  }
}
