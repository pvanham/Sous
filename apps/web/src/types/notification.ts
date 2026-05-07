// Re-export shared types from @sous/types so the web app can import
// from a single, app-local module while the wire shape stays the
// canonical one in `packages/types/src`.
export type {
  NotificationCategory,
  NotificationChannel,
  CategoryChannelPrefs,
  NotificationCategoriesPrefs,
  QuietHoursPrefs,
  NotificationPreferencesDTO,
  DeviceTokenDTO,
} from "@sous/types";

import type {
  NotificationCategoriesPrefs,
  NotificationPreferencesDTO,
  DeviceTokenDTO,
  QuietHoursPrefs,
} from "@sous/types";

// ── Server-coupled: Mongoose document interfaces ─────────────
//
// `NotificationPreference` and `DeviceToken` are user-scoped (keyed by
// Clerk user id) — this is the ONE intentional exception to the
// monorepo's `orgId + locationId` multi-tenancy rule, because identity
// is the natural key for these rows. See the model files for the
// full rationale.

export interface INotificationPreference {
  clerkUserId: string;
  channels: { push: boolean; email: boolean };
  categories: NotificationCategoriesPrefs;
  quietHours: QuietHoursPrefs;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceToken {
  clerkUserId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  deviceName?: string | null;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert a lean preference document (or a freshly-saved doc that has
 * been `.toObject()`'d) into the wire-safe DTO. The shape is already
 * very close to the wire format; we just stringify `_id` and drop the
 * Mongoose internals.
 */
export function toNotificationPreferenceDTO(
  doc: INotificationPreference & { _id: unknown },
): NotificationPreferencesDTO {
  return {
    clerkUserId: doc.clerkUserId,
    channels: {
      push: Boolean(doc.channels?.push ?? true),
      email: Boolean(doc.channels?.email ?? true),
    },
    categories: doc.categories,
    quietHours: doc.quietHours ?? null,
    updatedAt: doc.updatedAt,
  };
}

export function toDeviceTokenDTO(
  doc: IDeviceToken & { _id: unknown },
): DeviceTokenDTO {
  return {
    id: String(doc._id),
    clerkUserId: doc.clerkUserId,
    expoPushToken: doc.expoPushToken,
    platform: doc.platform,
    deviceName: doc.deviceName ?? null,
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
