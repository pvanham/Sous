import mongoose, { Schema, Document, Model } from "mongoose";
import type { ISchedule, ScheduleStatus } from "@/types/schedule";

// Document interface (with Mongoose document methods)
export interface IScheduleDocument extends ISchedule, Document {}

// Valid schedule statuses
const SCHEDULE_STATUSES: ScheduleStatus[] = ["DRAFT", "PUBLISHED"];

// Main Schedule schema
const ScheduleSchema = new Schema<IScheduleDocument>(
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
    weekStartDate: {
      type: Date,
      required: true,
      validate: {
        // The midnight + day-of-week alignment lives in
        // `ScheduleService.assertWeekStartAligned`, which interprets the
        // boundary in the location's IANA timezone — something a sync
        // Mongoose validator can't do (it has no access to LocationService
        // and can't await). This schema-level check only confirms the
        // value is a real Date so a NaN coercion can't sneak through.
        validator: (v: Date) =>
          v instanceof Date && !Number.isNaN(v.getTime()),
        message: "Week start date must be a valid Date",
      },
    },
    status: {
      type: String,
      required: true,
      enum: SCHEDULE_STATUSES,
      default: "DRAFT",
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "schedules",
  }
);

// Composite unique index: one schedule per week per location
ScheduleSchema.index({ orgId: 1, locationId: 1, weekStartDate: 1 }, { unique: true });

// Singleton pattern for Next.js HMR compatibility
const Schedule: Model<IScheduleDocument> =
  mongoose.models.Schedule ||
  mongoose.model<IScheduleDocument>("Schedule", ScheduleSchema);

export default Schedule;
