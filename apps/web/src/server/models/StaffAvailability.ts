import mongoose, { Schema, Document, Model } from "mongoose";
import type {
  IStaffAvailability,
  AvailabilityPreference,
} from "@/types/staff-availability";

// Document interface (with Mongoose document methods)
export interface IStaffAvailabilityDocument
  extends IStaffAvailability,
    Document {}

// Preference values for validation
const PREFERENCE_VALUES: AvailabilityPreference[] = [
  "preferred",
  "available",
  "unavailable",
];

// Main StaffAvailability schema
const StaffAvailabilitySchema = new Schema<IStaffAvailabilityDocument>(
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
    availableFrom: {
      type: String,
      default: null,
      validate: {
        validator: (v: string | null) =>
          v === null || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: "Available from must be in HH:MM format or null",
      },
    },
    availableTo: {
      type: String,
      default: null,
      validate: {
        validator: (v: string | null) =>
          v === null || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: "Available to must be in HH:MM format or null",
      },
    },
    preference: {
      type: String,
      required: true,
      enum: {
        values: PREFERENCE_VALUES,
        message: "Preference must be one of: preferred, available, unavailable",
      },
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "staffavailabilities",
  }
);

// Compound unique index: one availability record per staff member per day
StaffAvailabilitySchema.index(
  { orgId: 1, locationId: 1, staffId: 1, dayOfWeek: 1 },
  { unique: true }
);

// Query optimization index: find availability by day
StaffAvailabilitySchema.index({ orgId: 1, locationId: 1, dayOfWeek: 1 });

// Pre-save validation: availableTo must be after availableFrom when both are present
StaffAvailabilitySchema.pre("save", function () {
  // If preference is unavailable, times can be null - that's fine
  if (this.preference === "unavailable") {
    return;
  }

  // If preference is preferred or available, validate times
  if (this.availableFrom && this.availableTo) {
    if (this.availableTo <= this.availableFrom) {
      throw new Error(
        "Available to time must be after available from time"
      );
    }
  }
});

// Singleton pattern for Next.js HMR compatibility
const StaffAvailability: Model<IStaffAvailabilityDocument> =
  mongoose.models.StaffAvailability ||
  mongoose.model<IStaffAvailabilityDocument>(
    "StaffAvailability",
    StaffAvailabilitySchema
  );

export default StaffAvailability;
