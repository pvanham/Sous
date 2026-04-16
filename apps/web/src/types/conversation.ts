export type ProposalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "stale"
  | "collapsed";

export interface StoredProposal {
  proposalId: string;
  toolName: string;
  description: string;
  payload: Record<string, unknown>;
  dataVersion: string;
  status: ProposalStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  proposal?: StoredProposal;
  toolCall?: {
    toolName: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  };
  timestamp: Date;
}

// Mongoose document shape (ObjectId fields are unknown until converted)
export interface IConversation {
  orgId: unknown;
  locationId: unknown;
  clerkUserId: string;
  messages: ConversationMessage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// DTO returned from service layer (without Mongoose internals)
export interface ConversationDTO {
  id: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
  messages: ConversationMessage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationListItem {
  conversationId: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export function toConversationDTO(
  doc: IConversation & { _id: unknown }
): ConversationDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    clerkUserId: doc.clerkUserId,
    messages: doc.messages,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
