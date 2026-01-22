import mongoose, { Schema, Document, Model } from "mongoose";
import type { ISchedule, ScheduleStatus } from "@/types/schedule";

// Document interface (with Mongoose document methods)
export interface IScheduleDocument extends ISchedule, Document {}

// Valid schedule statuses
const SCHEDULE_STATUSES: ScheduleStatus[] = ["DRAFT", "PUBLISHED"];

// Main Schedule schema
const ScheduleSchema = new Schema<IScheduleDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    weekStartDate: {
      type: Date,
      required: true,
      validate: {
        validator: (v: Date) => v.getDay() === 1, // Must be Monday
        message: "Week start date must be a Monday",
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

// Composite unique index: one schedule per week per user
ScheduleSchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

// Singleton pattern for Next.js HMR compatibility
const Schedule: Model<IScheduleDocument> =
  mongoose.models.Schedule ||
  mongoose.model<IScheduleDocument>("Schedule", ScheduleSchema);

export default Schedule;
