import Conversation from "@/server/models/Conversation";
import { PROPOSAL_TTL_MINUTES } from "@/lib/ai/constants";

/**
 * Expire all pending proposals that are no longer actionable.
 *
 * Two passes:
 *  1. All pending proposals in **inactive** conversations for this user.
 *  2. All pending proposals older than PROPOSAL_TTL_MINUTES in **any**
 *     conversation (including the active one), except the optionally
 *     excluded conversation.
 *
 * Scoped to orgId + clerkUserId — never touches another user's data.
 * Best-effort: errors are logged, never thrown.
 */
export async function expirePendingProposals(
  orgId: string,
  clerkUserId: string,
  excludeConversationId?: string
): Promise<{ expiredCount: number }> {
  try {
    // 1. Expire all pending proposals in inactive conversations
    const inactiveResult = await Conversation.updateMany(
      { orgId, clerkUserId, isActive: false },
      { $set: { "messages.$[elem].proposal.status": "expired" } },
      { arrayFilters: [{ "elem.proposal.status": "pending" }] }
    );

    // 2. Expire time-exceeded pending proposals in any conversation
    const cutoff = new Date(Date.now() - PROPOSAL_TTL_MINUTES * 60_000);

    const ttlFilter: Record<string, unknown> = { orgId, clerkUserId };
    if (excludeConversationId) {
      ttlFilter._id = { $ne: excludeConversationId };
    }

    const ttlResult = await Conversation.updateMany(
      ttlFilter,
      { $set: { "messages.$[elem].proposal.status": "expired" } },
      {
        arrayFilters: [
          {
            "elem.proposal.status": "pending",
            "elem.proposal.createdAt": { $lt: cutoff },
          },
        ],
      }
    );

    const expiredCount =
      (inactiveResult.modifiedCount ?? 0) + (ttlResult.modifiedCount ?? 0);

    if (expiredCount > 0) {
      console.info(
        `[ProposalExpiry] Expired ${expiredCount} pending proposals for user ${clerkUserId}`
      );
    }

    return { expiredCount };
  } catch (err) {
    console.warn(`[ProposalExpiry] Failed to expire proposals: ${err}`);
    return { expiredCount: 0 };
  }
}
