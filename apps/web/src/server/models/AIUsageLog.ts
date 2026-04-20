import mongoose, { Schema, Document, Model, Types } from "mongoose";

/** Valid AI action types for usage tracking */
export const AI_ACTIONS = [
  "schedule_generation",
  "schedule_refinement",
  "message_parsing",
  "exchange_insight",
] as const;

export type AIAction = (typeof AI_ACTIONS)[number];

/** Valid subscription tiers */
export const SUBSCRIPTION_TIERS = ["free", "pro", "enterprise"] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

// AI Usage Log interface
// Note: "modelName" instead of "model" to avoid conflict with Mongoose Document.model
export interface IAIUsageLog {
  orgId: Types.ObjectId;
  locationId: Types.ObjectId;
  clerkUserId: string;
  action: AIAction;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  durationMs: number;
  success: boolean;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Document interface (with Mongoose document methods)
export interface IAIUsageLogDocument extends IAIUsageLog, Document {}

// Main AIUsageLog schema
const AIUsageLogSchema = new Schema<IAIUsageLogDocument>(
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
    clerkUserId: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: AI_ACTIONS,
    },
    modelName: {
      type: String,
      required: true,
      default: "gpt-4o",
    },
    promptTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    completionTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    totalTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedCostCents: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMs: {
      type: Number,
      required: true,
      min: 0,
    },
    success: {
      type: Boolean,
      required: true,
      default: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "aiusagelogs",
  }
);

// Compound index for efficient monthly rollup queries
AIUsageLogSchema.index({ orgId: 1, locationId: 1, createdAt: -1 });

// Index for user-level queries
AIUsageLogSchema.index({ clerkUserId: 1, createdAt: -1 });

// Singleton pattern for Next.js HMR compatibility
const AIUsageLog: Model<IAIUsageLogDocument> =
  mongoose.models.AIUsageLog ||
  mongoose.model<IAIUsageLogDocument>("AIUsageLog", AIUsageLogSchema);

export default AIUsageLog;
