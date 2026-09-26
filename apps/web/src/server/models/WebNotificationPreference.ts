import mongoose, { Schema, Document, Model } from "mongoose";
import type { IWebNotificationPreference } from "@/types/notification";
import {
  webNotificationCategoryValues,
  type WebNotificationCategory,
} from "@sous/types";

/**
 * Per-Clerk-user **web** notification preferences.
 *
 * The web dashboard cannot deliver push, so this document only tracks
 * email: a master `email` switch plus a per-category email toggle for
 * the manager/owner-facing categories in
 * `webNotificationCategoryValues`.
 *
 * This is deliberately a **separate collection** from
 * `notificationpreferences` (the mobile matrix). A manager's web email
 * choices are independent of their phone's push/email choices — see
 * `packages/types/src/validations/web-notification.schema.ts`.
 *
 * **Tenancy exception:** like `NotificationPreference` and
 * `DeviceToken`, this row is keyed by `clerkUserId` and carries no
 * `orgId` / `locationId`. Identity is the natural key — a manager's
 * notification choices follow them across orgs and locations.
 */
export interface IWebNotificationPreferenceDocument
  extends IWebNotificationPreference,
    Document {}

// Build the categories sub-schema from the canonical web category list
// so adding a web category in `@sous/types` automatically extends the
// stored shape with a sensible default (opted in).
const categoriesShape = webNotificationCategoryValues.reduce(
  (acc, category: WebNotificationCategory) => {
    acc[category] = {
      type: Boolean,
      required: true,
      default: true,
    };
    return acc;
  },
  {} as Record<WebNotificationCategory, unknown>,
);

const WebCategoriesSchema = new Schema(categoriesShape, { _id: false });

const WebNotificationPreferenceSchema =
  new Schema<IWebNotificationPreferenceDocument>(
    {
      clerkUserId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },
      email: {
        type: Boolean,
        required: true,
        default: true,
      },
      categories: {
        type: WebCategoriesSchema,
        required: true,
        default: () => ({}),
      },
    },
    {
      timestamps: true,
      collection: "webnotificationpreferences",
    },
  );

const WebNotificationPreference: Model<IWebNotificationPreferenceDocument> =
  mongoose.models.WebNotificationPreference ||
  mongoose.model<IWebNotificationPreferenceDocument>(
    "WebNotificationPreference",
    WebNotificationPreferenceSchema,
  );

export default WebNotificationPreference;
