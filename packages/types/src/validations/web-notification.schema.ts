import { z } from "zod";

import { type NotificationCategory } from "./notification.schema";

/**
 * Web (manager / owner) notification categories.
 *
 * The web dashboard cannot deliver push — it only sends **email** — and
 * it only cares about the subset of categories whose audience is a
 * manager or owner: the events a back-of-house manager reacts to from
 * the dashboard.
 *
 * These preferences are intentionally **separate** from the mobile
 * preference matrix (`notification.schema.ts`). A manager who silences
 * "time off" on their phone (the staff-facing *decision* push) can
 * still receive the web "time off" email (a staff member *submitting* a
 * request), and vice-versa. The `satisfies` clause guarantees every
 * web category is also a valid global `NotificationCategory`, so the
 * dispatcher can key both surfaces off the same category literal.
 */
export const webNotificationCategoryValues = [
  "time_off_submitted",
  "exchange_pending_approval",
  "manager_coverage_gap",
  "skill_change_submitted",
  "schedule_generation_async",
  "billing_alerts",
] as const satisfies readonly NotificationCategory[];

export type WebNotificationCategory =
  (typeof webNotificationCategoryValues)[number];

/**
 * Categories block as required on a stored / returned web preference
 * record. Every web category key must be present (a single `boolean`
 * for the email channel — web has no push), so consumers never have to
 * handle missing keys; defaults are filled in by
 * `defaultWebNotificationPreferences()` in `../index.ts`.
 */
const webCategoriesSchema = z.object(
  webNotificationCategoryValues.reduce(
    (acc, key) => {
      acc[key] = z.boolean();
      return acc;
    },
    {} as Record<WebNotificationCategory, z.ZodBoolean>,
  ),
);

/**
 * Patch shape accepted by `updateWebNotificationPreferences`.
 *
 * `email` is the master web-email switch. `categories` accepts a
 * partial map so the settings form can flip a single row without
 * round-tripping the whole set. The deep-merge happens server-side in
 * `WebNotificationPreferenceService.update`.
 */
export const updateWebNotificationPreferencesSchema = z
  .object({
    email: z.boolean().optional(),
    categories: z
      .object(
        webNotificationCategoryValues.reduce(
          (acc, key) => {
            acc[key] = z.boolean().optional();
            return acc;
          },
          {} as Record<WebNotificationCategory, z.ZodOptional<z.ZodBoolean>>,
        ),
      )
      .partial()
      .optional(),
  })
  .strict();

export type WebNotificationCategoriesPrefs = z.infer<
  typeof webCategoriesSchema
>;
export type UpdateWebNotificationPreferencesInput = z.infer<
  typeof updateWebNotificationPreferencesSchema
>;
