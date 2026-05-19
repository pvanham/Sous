import { Types } from "mongoose";
import Conversation from "@/server/models/Conversation";

/**
 * ConversationService - Service layer for Conversation operations.
 * This is the ONLY place that imports and interacts with the Conversation model.
 */
export const ConversationService = {
  /**
   * Delete all conversations for an organization.
   * Used for owner-level cascading account deletion.
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Conversation.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
