import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { IShift } from "@/types/shift";

// Document interface (with Mongoose document methods)
export interface IShiftDocument extends Omit<IShift, "orgId" | "locationId" | "scheduleId" | "staffId">, Document {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  scheduleId: Types.ObjectId;
  staffId: Types.ObjectId;
}

// Main Shift schema
const ShiftSchema = new Schema<IShiftDocument>(
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
    scheduleId: {
      type: Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    station: {
      type: String,
      required: true,
      minlength: 1,
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "shifts",
  }
);

// Pre-validate hook to check end > start
ShiftSchema.pre("validate", function () {
  if (this.end && this.start && this.end <= this.start) {
    this.invalidate("end", "End time must be after start time");
  }
});

// Index for finding all shifts in a schedule for a staff member
ShiftSchema.index({ scheduleId: 1, staffId: 1 });

// Index for date range queries by location
ShiftSchema.index({ orgId: 1, locationId: 1, start: 1, end: 1 });

// Index for overlap detection (find shifts for a staff member in a time range)
ShiftSchema.index({ staffId: 1, start: 1, end: 1 });

// Singleton pattern for Next.js HMR compatibility
const Shift: Model<IShiftDocument> =
  mongoose.models.Shift ||
  mongoose.model<IShiftDocument>("Shift", ShiftSchema);

export default Shift;
