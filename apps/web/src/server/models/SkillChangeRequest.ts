import mongoose, { Schema, Document, Model } from "mongoose";
import type { SkillChangeStatus, SkillChangeType } from "@sous/types";
import type { ISkillChangeRequest } from "@/types/skill-change-request";

// Document interface (with Mongoose document methods)
export interface ISkillChangeRequestDocument
  extends ISkillChangeRequest,
    Document {}

// Keep in sync with the unions in `@sous/types`.
const TYPE_VALUES: SkillChangeType[] = ["add", "remove"];
const STATUS_VALUES: SkillChangeStatus[] = ["pending", "approved", "denied"];

// Main SkillChangeRequest schema
const SkillChangeRequestSchema = new Schema<ISkillChangeRequestDocument>(
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
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    staffName: {
      type: String,
      required: true,
    },
    clerkUserId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: {
        values: TYPE_VALUES,
        message: "Type must be one of: add, remove",
      },
    },
    station: {
      type: String,
      required: true,
    },
    proficiency: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reason: {
      type: String,
      default: "",
      maxlength: 500,
    },
    status: {
      type: String,
      required: true,
      default: "pending",
      enum: {
        values: STATUS_VALUES,
        message: "Status must be one of: pending, approved, denied",
      },
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: String,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "skillchangerequests",
  }
);

// Efficient manager queries: pending changes for a location.
SkillChangeRequestSchema.index({ orgId: 1, locationId: 1, status: 1 });

// Efficient per-staff queries (mobile pending chips + reconciliation).
SkillChangeRequestSchema.index({ staffId: 1, status: 1 });

// Singleton pattern for Next.js HMR compatibility
const SkillChangeRequest: Model<ISkillChangeRequestDocument> =
  mongoose.models.SkillChangeRequest ||
  mongoose.model<ISkillChangeRequestDocument>(
    "SkillChangeRequest",
    SkillChangeRequestSchema
  );

export default SkillChangeRequest;
