import { z } from "zod";

/**
 * The set of notification "topics" the dispatcher can fan out. Each
 * category has a fixed audience (staff vs managers vs the initiating
 * user) defined server-side; the per-user matrix below only controls
 * whether that user wants to *receive* the notification when they are
 * already a recipient.
 *
 * Kept in sync with the trigger emission sites in
 * `apps/web/src/server/services/notification.service.ts` and the
 * documentation in `docs/architecture/10-notifications.md`.
 */
export const notificationCategoryValues = [
  "schedule_published",
  "schedule_unpublished",
  "shift_assignment_changed",
  "manager_coverage_gap",
  "time_off_submitted",
  "time_off_decision",
  "exchange_new_drop",
  "exchange_pending_approval",
  "exchange_decision",
  "skill_change_submitted",
  "skill_change_decision",
  "announcements",
  "schedule_generation_async",
  "billing_alerts",
] as const;

export const notificationChannelValues = ["push", "email"] as const;

/**
 * Per-channel toggle for a single category. Both channels default to
 * on so a freshly created preference document opts the user *in* to
 * everything; users opt out from the mobile settings screen.
 */
const categoryChannelSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
});

/**
 * Patch shape for a single category — both fields are optional so the
 * client can flip just one channel without supplying the other.
 */
const categoryChannelPatchSchema = z
  .object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
  })
  .strict();

/**
 * Quiet hours window. `startMinute` and `endMinute` are minutes since
 * midnight in the user's `timezone`; a window where `start > end` is
 * interpreted as wrapping past midnight (e.g. 22:00 to 07:00).
 *
 * Stored as `null` when quiet hours are off so we don't pay the cost
 * of the timezone math for every dispatch when most users haven't
 * opted in.
 */
export const quietHoursSchema = z
  .object({
    enabled: z.boolean(),
    startMinute: z
      .number()
      .int("Start time must be a whole number of minutes")
      .min(0, "Start time must be between 00:00 and 24:00")
      .max(24 * 60, "Start time must be between 00:00 and 24:00"),
    endMinute: z
      .number()
      .int("End time must be a whole number of minutes")
      .min(0, "End time must be between 00:00 and 24:00")
      .max(24 * 60, "End time must be between 00:00 and 24:00"),
    timezone: z
      .string()
      .min(1, "Timezone is required")
      .max(120, "Timezone is too long"),
  })
  .nullable();

/**
 * Categories block as required on a stored / returned preference
 * record. Every category key must be present so consumers don't have
 * to handle missing keys; defaults are filled in by
 * `defaultNotificationPreferences()` below.
 */
const categoriesSchema = z.object(
  notificationCategoryValues.reduce(
    (acc, key) => {
      acc[key] = categoryChannelSchema;
      return acc;
    },
    {} as Record<
      (typeof notificationCategoryValues)[number],
      typeof categoryChannelSchema
    >,
  ),
);

/**
 * Patch shape accepted by `PATCH /api/me/notifications/preferences`.
 *
 * Every field is optional and `categories` itself accepts a partial
 * map so the mobile UI can flip a single cell (e.g.
 * `{ categories: { schedule_published: { push: false } } }`) without
 * round-tripping the entire matrix. The deep-merge happens server-side
 * inside `NotificationPreferenceService.update`.
 */
export const updateNotificationPreferencesSchema = z
  .object({
    channels: z
      .object({
        push: z.boolean().optional(),
        email: z.boolean().optional(),
      })
      .optional(),
    categories: z
      .object(
        notificationCategoryValues.reduce(
          (acc, key) => {
            acc[key] = categoryChannelPatchSchema;
            return acc;
          },
          {} as Record<
            (typeof notificationCategoryValues)[number],
            typeof categoryChannelPatchSchema
          >,
        ),
      )
      .partial()
      .optional(),
    quietHours: quietHoursSchema.optional(),
  })
  .strict();

export const registerDeviceTokenSchema = z
  .object({
    expoPushToken: z
      .string()
      .trim()
      .min(1, "expoPushToken is required")
      .max(200, "expoPushToken is too long"),
    platform: z.enum(["ios", "android"]),
    deviceName: z
      .string()
      .trim()
      .max(120, "deviceName is too long")
      .optional(),
  })
  .strict();

export type NotificationCategory = (typeof notificationCategoryValues)[number];
export type NotificationChannel = (typeof notificationChannelValues)[number];
export type CategoryChannelPrefs = z.infer<typeof categoryChannelSchema>;
export type NotificationCategoriesPrefs = z.infer<typeof categoriesSchema>;
export type QuietHoursPrefs = z.infer<typeof quietHoursSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
export type RegisterDeviceTokenInput = z.infer<
  typeof registerDeviceTokenSchema
>;
