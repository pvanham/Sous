import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { IAnnouncement } from "@/types/announcement";
import type { AnnouncementPriority } from "@sous/types";

/**
 * Mongoose document for an announcement.
 *
 * `IAnnouncement` declares `orgId` and `locationId` as `unknown` so it
 * stays portable; here we narrow them to `Types.ObjectId` because the
 * schema lives entirely within Mongoose's own type system.
 */
export interface IAnnouncementDocument
  extends Omit<IAnnouncement, "orgId" | "locationId">,
    Document {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
}

const PRIORITY_VALUES: AnnouncementPriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

const AnnouncementSchema = new Schema<IAnnouncementDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    // We store the Clerk user id (not a Staff/Org member ObjectId) so
    // a deleted membership row does not orphan the audit field. The
    // human-readable `authorName` snapshot is what we render in the UI
    // so deletions on the staff list never break old announcements.
    authorClerkUserId: {
      type: String,
      required: true,
    },
    authorName: {
      type: String,
      required: true,
      maxlength: 200,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
    priority: {
      type: String,
      required: true,
      default: "normal",
      enum: {
        values: PRIORITY_VALUES,
        message:
          "Priority must be one of: urgent, high, normal, low",
      },
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "announcements",
  }
);

// Tenancy index — every list query filters by (orgId, locationId).
AnnouncementSchema.index({ orgId: 1, locationId: 1, createdAt: -1 });

// Sparse-style index for "still-active" feed filtering. We keep it as
// a plain compound rather than a TTL because Mongo's TTL reaper would
// hard-delete the document, and we want the manager-side history to
// outlive the staff-facing visibility window.
AnnouncementSchema.index({ orgId: 1, locationId: 1, expiresAt: 1 });

// Singleton pattern for Next.js HMR compatibility (re-importing the
// module would otherwise call `model("Announcement", …)` a second
// time and throw `OverwriteModelError`).
const Announcement: Model<IAnnouncementDocument> =
  mongoose.models.Announcement ||
  mongoose.model<IAnnouncementDocument>(
    "Announcement",
    AnnouncementSchema
  );

export default Announcement;
