import type { ProposalStatus } from "./conversation";
import type { ClientSafeProposal } from "@/lib/ai/orchestrator/proposal-handler";

/**
 * Client-side proposal with local status tracking.
 * Extends the server-streamed ClientSafeProposal with a mutable status
 * that the hook updates on resolve actions and OCC rejections.
 */
export interface ChatProposal extends ClientSafeProposal {
  status: ProposalStatus;
  /** Badge text when status is "collapsed" (cascade after accept-generated-schedule) */
  collapsedMessage?: string;
}

/**
 * Shape of the JSON response from POST /api/ai/proposals/[proposalId]/resolve.
 */
export interface ResolveProposalResponse {
  success: boolean;
  proposalId: string;
  action?: "approved" | "denied";
  result?: unknown;
  executionSummary?: string;
  error?: string;
  message?: string;
  async?: boolean;
  asyncTaskId?: string;
  asyncDeadline?: string;
  /** Present when approving propose_accept_generated_schedule — collapse related UI */
  cascadeState?: {
    collapseProposalId: string;
    collapseTaskId: string;
    collapsedMessage: string;
  };
}
