import mongoose, { Schema, Document, Model } from "mongoose";
import type { INotificationPreference } from "@/types/notification";
import {
  notificationCategoryValues,
  type NotificationCategory,
} from "@sous/types";

/**
 * Per-Clerk-user notification preferences.
 *
 * **Tenancy exception:** Unlike most other documents in this app,
 * `NotificationPreference` is keyed by `clerkUserId` and carries no
 * `orgId` or `locationId`. Identity (not org membership) is the
 * natural key here — a user's notification choices follow them across
 * orgs and locations. This is one of only two intentional exceptions
 * to the multi-tenancy rule (the other is `DeviceToken`); every other
 * service must continue to filter by `orgId + locationId`.
 *
 * Real validation lives in `packages/types/src/validations/
 * notification.schema.ts`. Schema-level constraints here are limited
 * to `required`, `index`, and `enum`, per the layer rule.
 */
export interface INotificationPreferenceDocument
  extends INotificationPreference,
    Document {}

const ChannelPairSchema = new Schema(
  {
    push: { type: Boolean, required: true, default: true },
    email: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

// Build the categories sub-schema once from the canonical category
// list so adding a category in `@sous/types` automatically extends the
// stored shape with sensible defaults.
const categoriesShape = notificationCategoryValues.reduce(
  (acc, category: NotificationCategory) => {
    acc[category] = {
      type: ChannelPairSchema,
      required: true,
      default: () => ({ push: true, email: true }),
    };
    return acc;
  },
  {} as Record<NotificationCategory, unknown>,
);

const CategoriesSchema = new Schema(categoriesShape, { _id: false });

const QuietHoursSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: false },
    startMinute: { type: Number, required: true, min: 0, max: 24 * 60 },
    endMinute: { type: Number, required: true, min: 0, max: 24 * 60 },
    timezone: { type: String, required: true, maxlength: 120 },
  },
  { _id: false },
);

const NotificationPreferenceSchema =
  new Schema<INotificationPreferenceDocument>(
    {
      clerkUserId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },
      channels: {
        type: ChannelPairSchema,
        required: true,
        default: () => ({ push: true, email: true }),
      },
      categories: {
        type: CategoriesSchema,
        required: true,
        default: () => ({}),
      },
      quietHours: {
        type: QuietHoursSchema,
        default: null,
      },
    },
    {
      timestamps: true,
      collection: "notificationpreferences",
    },
  );

const NotificationPreference: Model<INotificationPreferenceDocument> =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreferenceDocument>(
    "NotificationPreference",
    NotificationPreferenceSchema,
  );

export default NotificationPreference;
