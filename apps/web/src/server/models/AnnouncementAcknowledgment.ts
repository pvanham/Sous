import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { IAnnouncementAcknowledgment } from "@/types/announcement";

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO SUBDOCUMENTS
 *
 * Acknowledgment tracking intentionally lives in its own collection for
 * high-read workloads and per-user point lookups.
 */
export interface IAnnouncementAcknowledgmentDocument
  extends Omit<
      IAnnouncementAcknowledgment,
      "orgId" | "locationId" | "announcementId"
    >,
    Document {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  announcementId: Types.ObjectId;
}

const AnnouncementAcknowledgmentSchema =
  new Schema<IAnnouncementAcknowledgmentDocument>(
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
      announcementId: {
        type: Schema.Types.ObjectId,
        ref: "Announcement",
        required: true,
        index: true,
      },
      userId: {
        type: String,
        required: true,
      },
      readAt: {
        type: Date,
        default: null,
      },
      acknowledgedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      collection: "announcement_acknowledgments",
    }
  );

AnnouncementAcknowledgmentSchema.pre("validate", function () {
  if (this.acknowledgedAt && !this.readAt) {
    this.invalidate(
      "acknowledgedAt",
      "Acknowledged timestamp requires a read timestamp"
    );
  }
});

AnnouncementAcknowledgmentSchema.index(
  { announcementId: 1, userId: 1 },
  { unique: true }
);
AnnouncementAcknowledgmentSchema.index({
  orgId: 1,
  locationId: 1,
  userId: 1,
  readAt: 1,
});
AnnouncementAcknowledgmentSchema.index({ announcementId: 1, acknowledgedAt: 1 });

const AnnouncementAcknowledgment: Model<IAnnouncementAcknowledgmentDocument> =
  mongoose.models.AnnouncementAcknowledgment ||
  mongoose.model<IAnnouncementAcknowledgmentDocument>(
    "AnnouncementAcknowledgment",
    AnnouncementAcknowledgmentSchema
  );

export default AnnouncementAcknowledgment;
