import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { IAnnouncement } from "@/types/announcement";
import type { AnnouncementPriority } from "@sous/types";

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
 *
 * Legacy fields intentionally removed:
 * - `authorClerkUserId` → replaced by `authorId`
 * - legacy expiry field → replaced by `expirationDate`
 * - priority enum `urgent|high|normal|low` → `Standard|Urgent`
 *
 * Future phases build on this shape. Do not map this model back to
 * legacy names.
 *
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
  "Standard",
  "Urgent",
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
    authorId: {
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
      minlength: 1,
      maxlength: 10000,
    },
    priority: {
      type: String,
      required: true,
      default: "Standard",
      enum: {
        values: PRIORITY_VALUES,
        message: "Priority must be one of: Standard, Urgent",
      },
    },
    targetAudience: {
      type: [String],
      required: true,
      validate: {
        validator: (entries: string[]) => entries.length > 0 && entries.length <= 20,
        message:
          "Target audience must include between 1 and 20 entries",
      },
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (entries: string[]) => entries.length <= 20,
        message: "Tags can include at most 20 entries",
      },
    },
    publishDate: {
      type: Date,
      default: null,
    },
    expirationDate: {
      type: Date,
      default: null,
    },
    attachments: {
      type: [String],
      default: [],
      validate: {
        validator: (entries: string[]) => entries.length <= 10,
        message: "Attachments can include at most 10 files",
      },
    },
    requiresAcknowledgment: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "announcements",
  }
);

AnnouncementSchema.pre("validate", function () {
  if (
    this.publishDate instanceof Date &&
    this.expirationDate instanceof Date &&
    this.expirationDate.getTime() <= this.publishDate.getTime()
  ) {
    this.invalidate(
      "expirationDate",
      "Expiration date must be strictly after publish date"
    );
  }

  if (Array.isArray(this.tags)) {
    this.tags = this.tags.map((tag) => tag.trim().toLowerCase());
  }

  if (Array.isArray(this.targetAudience)) {
    this.targetAudience = this.targetAudience.map((entry) => entry.trim());
  }

  if (Array.isArray(this.attachments)) {
    this.attachments = this.attachments.map((url) => url.trim());
  }
});

// Tenancy index — every list query filters by (orgId, locationId).
AnnouncementSchema.index({ orgId: 1, locationId: 1, createdAt: -1 });

AnnouncementSchema.index({ orgId: 1, locationId: 1, publishDate: 1 });
AnnouncementSchema.index({ orgId: 1, locationId: 1, expirationDate: 1 });
AnnouncementSchema.index({ orgId: 1, locationId: 1, tags: 1 });

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
