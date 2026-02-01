import mongoose, { Schema, Document, Model } from "mongoose";
import type { ILaborRequirement, LaborPriority } from "@/types/labor-requirement";

// Document interface (with Mongoose document methods)
export interface ILaborRequirementDocument extends ILaborRequirement, Document {}

// Priority values for validation
const PRIORITY_VALUES: LaborPriority[] = ["critical", "high", "normal", "low"];

// Main LaborRequirement schema
const LaborRequirementSchema = new Schema<ILaborRequirementDocument>(
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
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      validate: {
        validator: Number.isInteger,
        message: "Day of week must be an integer",
      },
    },
    station: {
      type: String,
      required: true,
      minlength: 1,
    },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: "Start time must be in HH:MM format",
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: "End time must be in HH:MM format",
      },
    },
    minStaff: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Minimum staff must be an integer",
      },
    },
    preferredStaff: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Preferred staff must be an integer",
      },
    },
    priority: {
      type: String,
      required: true,
      enum: {
        values: PRIORITY_VALUES,
        message: "Priority must be one of: critical, high, normal, low",
      },
      default: "normal",
    },
  },
  {
    timestamps: true,
    collection: "laborrequirements",
  }
);

// Compound index for efficient day-based queries
LaborRequirementSchema.index({ orgId: 1, locationId: 1, dayOfWeek: 1, station: 1 });

// Unique constraint to prevent duplicate requirements for same day/station/time
LaborRequirementSchema.index(
  { orgId: 1, locationId: 1, dayOfWeek: 1, station: 1, startTime: 1 },
  { unique: true }
);

// Pre-save validation: endTime must be after startTime
LaborRequirementSchema.pre("save", function () {
  if (this.endTime <= this.startTime) {
    throw new Error("End time must be after start time");
  }
  if (this.preferredStaff < this.minStaff) {
    throw new Error(
      "Preferred staff must be greater than or equal to minimum staff"
    );
  }
});

// Singleton pattern for Next.js HMR compatibility
const LaborRequirement: Model<ILaborRequirementDocument> =
  mongoose.models.LaborRequirement ||
  mongoose.model<ILaborRequirementDocument>(
    "LaborRequirement",
    LaborRequirementSchema
  );

export default LaborRequirement;
