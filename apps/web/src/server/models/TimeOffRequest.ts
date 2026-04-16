import mongoose, { Schema, Document, Model } from "mongoose";
import type {
  ITimeOffRequest,
  TimeOffRequestStatus,
} from "@/types/time-off-request";

// Document interface (with Mongoose document methods)
export interface ITimeOffRequestDocument extends ITimeOffRequest, Document {}

// Status values for validation
const STATUS_VALUES: TimeOffRequestStatus[] = [
  "pending",
  "approved",
  "denied",
];

// Main TimeOffRequest schema
const TimeOffRequestSchema = new Schema<ITimeOffRequestDocument>(
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
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
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
    notes: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "timeoffrequests",
  }
);

// Compound index: efficient queries for staff + status filtering
TimeOffRequestSchema.index({ orgId: 1, locationId: 1, staffId: 1, status: 1 });

// Compound index: efficient date range queries across a location
TimeOffRequestSchema.index({
  orgId: 1,
  locationId: 1,
  startDate: 1,
  endDate: 1,
});

// Unique compound index: prevent duplicate requests for the same staff member and date range
TimeOffRequestSchema.index(
  { orgId: 1, locationId: 1, staffId: 1, startDate: 1, endDate: 1 },
  { unique: true }
);

// Pre-save validation: endDate must be on or after startDate
TimeOffRequestSchema.pre("save", function () {
  if (this.endDate < this.startDate) {
    throw new Error("End date must be on or after start date");
  }
});

// Singleton pattern for Next.js HMR compatibility
const TimeOffRequest: Model<ITimeOffRequestDocument> =
  mongoose.models.TimeOffRequest ||
  mongoose.model<ITimeOffRequestDocument>(
    "TimeOffRequest",
    TimeOffRequestSchema
  );

export default TimeOffRequest;
