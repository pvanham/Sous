import WebNotificationPreference from "@/server/models/WebNotificationPreference";
import {
  type WebNotificationPreferencesDTO,
  toWebNotificationPreferenceDTO,
} from "@/types/notification";
import {
  defaultWebNotificationPreferences,
  webNotificationCategoryValues,
  type WebNotificationCategoriesPrefs,
  type UpdateWebNotificationPreferencesInput,
} from "@sous/types";

/**
 * WebNotificationPreferenceService — read/write the per-Clerk-user
 * **web** (manager/owner, email-only) preferences.
 *
 * This is the only place that touches the `WebNotificationPreference`
 * Mongoose model. Reads always go through `getOrCreate` so a manager
 * who has never opened the settings page still gets the seeded
 * defaults; the dispatcher relies on this so a never-touched user still
 * receives web emails.
 */
export const WebNotificationPreferenceService = {
  /**
   * Look up a user's web preferences, creating a default row on first
   * access. Atomic via `findOneAndUpdate({ ..., upsert: true })` so two
   * concurrent first reads can't race into two documents (the unique
   * index on `clerkUserId` is the backstop).
   */
  async getOrCreate(
    clerkUserId: string,
  ): Promise<WebNotificationPreferencesDTO> {
    const seeded = defaultWebNotificationPreferences(clerkUserId);
    const doc = await WebNotificationPreference.findOneAndUpdate(
      { clerkUserId },
      {
        $setOnInsert: {
          clerkUserId,
          email: seeded.email,
          categories: seeded.categories,
        },
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    ).lean();

    if (!doc) {
      throw new Error(
        "WebNotificationPreferenceService.getOrCreate: upsert returned null",
      );
    }

    // Backfill any newly-added category that's missing from an older
    // document so callers always see every key.
    const backfilled = backfillCategories(doc.categories);
    if (backfilled !== doc.categories) {
      await WebNotificationPreference.updateOne(
        { clerkUserId },
        { $set: { categories: backfilled } },
      );
      doc.categories = backfilled;
    }

    return toWebNotificationPreferenceDTO(doc);
  },

  /**
   * Apply a partial patch on top of the user's current web
   * preferences. The patch can flip the master `email` switch and/or a
   * subset of category toggles; stored fields not present in the patch
   * are left untouched.
   */
  async update(
    clerkUserId: string,
    patch: UpdateWebNotificationPreferencesInput,
  ): Promise<WebNotificationPreferencesDTO> {
    const current = await this.getOrCreate(clerkUserId);

    const nextEmail = patch.email ?? current.email;

    const nextCategories: WebNotificationCategoriesPrefs = {
      ...current.categories,
    };
    if (patch.categories) {
      for (const [key, val] of Object.entries(patch.categories)) {
        if (val === undefined) continue;
        nextCategories[key as keyof WebNotificationCategoriesPrefs] = val;
      }
    }

    const updated = await WebNotificationPreference.findOneAndUpdate(
      { clerkUserId },
      {
        $set: {
          email: nextEmail,
          categories: nextCategories,
        },
      },
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!updated) {
      throw new Error(
        "WebNotificationPreferenceService.update: row vanished mid-update",
      );
    }

    return toWebNotificationPreferenceDTO(updated);
  },

  /**
   * Hard-delete all web notification preference rows for a Clerk user.
   * Used during account deletion to remove user-scoped data.
   */
  async deleteAllByClerkUserId(clerkUserId: string): Promise<number> {
    const result = await WebNotificationPreference.deleteMany({ clerkUserId });
    return result.deletedCount;
  },
};

/**
 * Older preference rows may be missing a category that was added after
 * they were created. Returning the same reference when nothing changed
 * lets callers skip the round-trip in the common case.
 */
function backfillCategories(
  stored: WebNotificationCategoriesPrefs | undefined | null,
): WebNotificationCategoriesPrefs {
  const next = { ...(stored ?? {}) } as WebNotificationCategoriesPrefs;
  let mutated = !stored;
  for (const cat of webNotificationCategoryValues) {
    if (next[cat] === undefined) {
      next[cat] = true;
      mutated = true;
    }
  }
  return mutated ? next : (stored as WebNotificationCategoriesPrefs);
}
