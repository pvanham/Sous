import mongoose, { Schema, Document, Model } from "mongoose";
import type { IAsyncTask } from "@/types/async-task";

export interface IAsyncTaskDocument extends IAsyncTask, Document {}

const ASYNC_TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "infeasible",
  "timed_out",
] as const;

const ASYNC_TASK_TYPES = ["schedule_generation"] as const;

const AsyncTaskResultSchema = new Schema(
  {
    solverStatus: { type: String, required: true },
    objectiveValue: { type: Number, required: true },
    solveTimeMs: { type: Number, required: true },
    totalCostCents: { type: Number, required: true },
    fallbackRatesUsed: { type: Boolean, required: true },
    overtimeSummary: { type: Schema.Types.Mixed, required: true },
    generatedDays: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: String, required: true },
    suggestedRelaxations: { type: [Schema.Types.Mixed] },
    likelyCauses: { type: [String] },
  },
  { _id: false }
);

const AsyncTaskErrorSchema = new Schema(
  {
    message: { type: String, required: true },
    code: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const AsyncTaskSchema = new Schema<IAsyncTaskDocument>(
  {
    taskType: {
      type: String,
      required: true,
      enum: ASYNC_TASK_TYPES,
    },
    status: {
      type: String,
      required: true,
      enum: ASYNC_TASK_STATUSES,
      default: "pending",
    },
    conversationId: { type: String, required: true },
    proposalId: { type: String, required: true },
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
    },
    clerkUserId: { type: String, required: true },
    inputPayload: { type: Schema.Types.Mixed, required: true },
    scheduleId: { type: String, required: true },
    weekStartDate: { type: String, required: true },
    result: { type: AsyncTaskResultSchema },
    error: { type: AsyncTaskErrorSchema },
    dispatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    deadline: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "asynctasks",
  }
);

AsyncTaskSchema.index({ orgId: 1, conversationId: 1, status: 1 });
AsyncTaskSchema.index({ status: 1, deadline: 1 });
AsyncTaskSchema.index({ proposalId: 1 });

const AsyncTask: Model<IAsyncTaskDocument> =
  mongoose.models.AsyncTask ||
  mongoose.model<IAsyncTaskDocument>("AsyncTask", AsyncTaskSchema);

export default AsyncTask;
