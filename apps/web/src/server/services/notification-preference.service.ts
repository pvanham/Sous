import NotificationPreference from "@/server/models/NotificationPreference";
import {
  type NotificationPreferencesDTO,
  toNotificationPreferenceDTO,
} from "@/types/notification";
import {
  defaultNotificationPreferences,
  notificationCategoryValues,
  type NotificationCategoriesPrefs,
  type UpdateNotificationPreferencesInput,
} from "@sous/types";

/**
 * NotificationPreferenceService — read/write the per-Clerk-user
 * preference matrix.
 *
 * This is the only place that touches the `NotificationPreference`
 * Mongoose model. Reads always go through `getOrCreate` so callers
 * that haven't customised their preferences still get the seeded
 * defaults; the dispatcher relies on this so a never-touched user
 * still receives notifications.
 */
export const NotificationPreferenceService = {
  /**
   * Look up a user's preferences, creating a default row on first
   * access. Atomic via `findOneAndUpdate({ ..., upsert: true,
   * new: true })` so two concurrent first reads can't race into two
   * documents (the unique index on `clerkUserId` is the backstop).
   */
  async getOrCreate(
    clerkUserId: string,
  ): Promise<NotificationPreferencesDTO> {
    const seeded = defaultNotificationPreferences(clerkUserId);
    const doc = await NotificationPreference.findOneAndUpdate(
      { clerkUserId },
      {
        $setOnInsert: {
          clerkUserId,
          channels: seeded.channels,
          categories: seeded.categories,
          quietHours: seeded.quietHours,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    // `doc` is guaranteed non-null with `upsert: true, new: true` but
    // typescript doesn't model that.
    if (!doc) {
      throw new Error(
        "NotificationPreferenceService.getOrCreate: upsert returned null",
      );
    }

    // Backfill any newly-added category that's missing from an older
    // document so callers always see every key (the default factory
    // is the source of truth for the category list).
    const backfilled = backfillCategories(doc.categories);
    if (backfilled !== doc.categories) {
      await NotificationPreference.updateOne(
        { clerkUserId },
        { $set: { categories: backfilled } },
      );
      doc.categories = backfilled;
    }

    return toNotificationPreferenceDTO(doc);
  },

  /**
   * Apply a partial patch on top of the user's current preferences.
   *
   * The patch shape is the validated `updateNotificationPreferencesSchema`:
   * `channels` and `categories` accept partial maps, and a single cell
   * (e.g. `categories.schedule_published.push = false`) can be flipped
   * without sending the whole matrix.
   *
   * Stored fields not present in the patch are left untouched.
   */
  async update(
    clerkUserId: string,
    patch: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferencesDTO> {
    const current = await this.getOrCreate(clerkUserId);

    const nextChannels = {
      push: patch.channels?.push ?? current.channels.push,
      email: patch.channels?.email ?? current.channels.email,
    };

    const nextCategories: NotificationCategoriesPrefs = {
      ...current.categories,
    };
    if (patch.categories) {
      for (const [key, val] of Object.entries(patch.categories)) {
        if (!val) continue;
        const existing =
          current.categories[key as keyof NotificationCategoriesPrefs];
        nextCategories[key as keyof NotificationCategoriesPrefs] = {
          push: val.push ?? existing.push,
          email: val.email ?? existing.email,
        };
      }
    }

    const nextQuietHours =
      patch.quietHours === undefined ? current.quietHours : patch.quietHours;

    const updated = await NotificationPreference.findOneAndUpdate(
      { clerkUserId },
      {
        $set: {
          channels: nextChannels,
          categories: nextCategories,
          quietHours: nextQuietHours,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      throw new Error(
        "NotificationPreferenceService.update: row vanished mid-update",
      );
    }

    return toNotificationPreferenceDTO(updated);
  },

  /**
   * Hard-delete all notification preference rows for a Clerk user.
   * Used during owner account deletion to remove user-scoped data.
   */
  async deleteAllByClerkUserId(clerkUserId: string): Promise<number> {
    const result = await NotificationPreference.deleteMany({ clerkUserId });
    return result.deletedCount;
  },
};

/**
 * Older preference rows may be missing a category that was added
 * after they were created. Returning the same reference when nothing
 * changed lets callers skip the round-trip in the common case.
 */
function backfillCategories(
  stored: NotificationCategoriesPrefs | undefined | null,
): NotificationCategoriesPrefs {
  const next = { ...(stored ?? {}) } as NotificationCategoriesPrefs;
  let mutated = !stored;
  for (const cat of notificationCategoryValues) {
    if (!next[cat]) {
      next[cat] = { push: true, email: true };
      mutated = true;
    }
  }
  return mutated ? next : (stored as NotificationCategoriesPrefs);
}
