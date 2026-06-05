import { inQuietHours } from "@/lib/notifications/quiet-hours";
import {
  webNotificationCategoryValues,
  type NotificationCategory,
  type NotificationPreferencesDTO,
  type WebNotificationCategory,
  type WebNotificationPreferencesDTO,
} from "@sous/types";

/**
 * Categories whose audience is a web-facing manager / owner. For these,
 * the **email** channel is governed by the user's separate
 * `WebNotificationPreference` (the dashboard settings), not the mobile
 * matrix — see `web-notification.schema.ts`. Push for these categories
 * still follows the mobile preferences, and every other category keeps
 * email on the mobile matrix.
 */
const WEB_EMAIL_CATEGORIES = new Set<NotificationCategory>(
  webNotificationCategoryValues,
);

export function isWebEmailCategory(category: NotificationCategory): boolean {
  return WEB_EMAIL_CATEGORIES.has(category);
}

export interface ChannelDecision {
  wantsPush: boolean;
  wantsEmail: boolean;
}

/**
 * Decide, for a single recipient, whether a notification should go out
 * over push and/or email. Pure and framework-free so the dispatcher's
 * routing rules can be unit-tested without booting Mongo or Clerk (see
 * `scripts/test-notification-channel-decision.ts`).
 *
 * Rules:
 *  - **Push** always follows the mobile preferences (master switch,
 *    per-category toggle, quiet hours). Web has no push.
 *  - **Email** for a manager/owner-facing (web) category follows the
 *    web preferences (master `email` + per-category) and intentionally
 *    ignores quiet hours, which is a mobile/push concept. Email for
 *    every other category follows the mobile preferences as before.
 */
export function resolveChannelDecision(args: {
  category: NotificationCategory;
  mobilePrefs: NotificationPreferencesDTO;
  webPrefs: WebNotificationPreferencesDTO | null;
  now: Date;
}): ChannelDecision {
  const { category, mobilePrefs, webPrefs, now } = args;

  const wantsPush =
    mobilePrefs.channels.push &&
    mobilePrefs.categories[category]?.push !== false &&
    !inQuietHours(now, mobilePrefs.quietHours);

  const wantsEmail =
    isWebEmailCategory(category) && webPrefs
      ? webPrefs.email &&
        webPrefs.categories[category as WebNotificationCategory] !== false
      : mobilePrefs.channels.email &&
        mobilePrefs.categories[category]?.email !== false &&
        !inQuietHours(now, mobilePrefs.quietHours);

  return { wantsPush, wantsEmail };
}
