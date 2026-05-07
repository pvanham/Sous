import mongoose, { Schema, Document, Model } from "mongoose";
import type { IDeviceToken } from "@/types/notification";

/**
 * Per-device Expo push token registration.
 *
 * **Tenancy exception:** Like `NotificationPreference`, this document
 * is keyed by `clerkUserId` and carries no `orgId`/`locationId`. A
 * single device (and therefore push token) belongs to a single
 * identity, regardless of which org / location they're acting in at a
 * given moment. The dispatcher resolves recipients to `clerkUserId`s
 * and then queries this collection by user.
 *
 * Soft-deletion: when Expo returns `DeviceNotRegistered` we set
 * `revokedAt` rather than hard-deleting so log triage can still match
 * a token to the user it once belonged to. The unique index on
 * `expoPushToken` lets re-registration be a single upsert that also
 * clears `revokedAt`.
 */
export interface IDeviceTokenDocument extends IDeviceToken, Document {}

const DeviceTokenSchema = new Schema<IDeviceTokenDocument>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    expoPushToken: {
      type: String,
      required: true,
      unique: true,
      maxlength: 200,
    },
    platform: {
      type: String,
      required: true,
      enum: ["ios", "android"],
    },
    deviceName: {
      type: String,
      default: null,
      maxlength: 120,
    },
    lastSeenAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "devicetokens",
  },
);

DeviceTokenSchema.index({ clerkUserId: 1, revokedAt: 1 });

const DeviceToken: Model<IDeviceTokenDocument> =
  mongoose.models.DeviceToken ||
  mongoose.model<IDeviceTokenDocument>("DeviceToken", DeviceTokenSchema);

export default DeviceToken;
