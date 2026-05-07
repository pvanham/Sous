import mongoose, { Schema, Document, Model } from "mongoose";
import type { IConversation } from "@/types/conversation";

export interface IConversationDocument extends IConversation, Document {}

const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "denied",
  "expired",
  "stale",
] as const;

const StoredProposalSchema = new Schema(
  {
    proposalId: { type: String, required: true },
    toolName: { type: String, required: true },
    description: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    dataVersion: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: PROPOSAL_STATUSES,
      default: "pending",
    },
    createdAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  { _id: false }
);

const ToolCallSchema = new Schema(
  {
    toolName: { type: String, required: true },
    arguments: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ConversationMessageSchema = new Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system", "tool"],
    },
    content: { type: String, required: true },
    proposal: { type: StoredProposalSchema },
    toolCall: { type: ToolCallSchema },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversationDocument>(
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
    messages: {
      type: [ConversationMessageSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "conversations",
  }
);

ConversationSchema.index({ orgId: 1, clerkUserId: 1, isActive: 1 });
ConversationSchema.index({ updatedAt: 1 });

const Conversation: Model<IConversationDocument> =
  mongoose.models.Conversation ||
  mongoose.model<IConversationDocument>("Conversation", ConversationSchema);

export default Conversation;
