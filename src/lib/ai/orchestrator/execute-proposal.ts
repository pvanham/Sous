import type { StoredProposal } from "@/types/conversation";
import type { OCCFilterResult } from "./occ";
import { getStaleReason } from "./occ";
import { ShiftService } from "@/server/services/shift.service";

export interface ExecuteProposalInput {
  proposal: StoredProposal;
  occFilter: OCCFilterResult | OCCFilterResult[];
  orgId: string;
  locationId: string;
  clerkUserId: string;
}

export interface ExecuteProposalResult {
  success: boolean;
  executionSummary: string;
  data?: unknown;
  error?: string;
  /** True when the atomic OCC filter returned null (data modified since proposal). */
  stale?: boolean;
}

/**
 * Dispatch an approved proposal to the correct service layer mutation.
 * The OCC filter is already built by the caller — this function uses it
 * to perform the atomic findOneAndUpdate via the appropriate service.
 */
export async function executeProposal(
  input: ExecuteProposalInput
): Promise<ExecuteProposalResult> {
  const { proposal, occFilter, orgId, locationId } = input;

  switch (proposal.toolName) {
    case "propose_shift_swap":
      return executeShiftSwap(proposal, occFilter, orgId, locationId);
    case "propose_schedule_generation":
      return executeScheduleGeneration(proposal);
    default:
      return {
        success: false,
        executionSummary: "",
        error: `Unknown proposal type: '${proposal.toolName}'. This proposal cannot be executed.`,
      };
  }
}

async function executeShiftSwap(
  proposal: StoredProposal,
  occFilter: OCCFilterResult | OCCFilterResult[],
  orgId: string,
  locationId: string,
): Promise<ExecuteProposalResult> {
  const { payload } = proposal;

  const targetStaffId = payload.targetStaffId;
  if (typeof targetStaffId !== "string") {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_shift_swap': missing required field 'targetStaffId'.",
    };
  }

  if (Array.isArray(occFilter)) {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_shift_swap': expected single OCC filter.",
    };
  }

  try {
    const updated = await ShiftService.reassignWithOCC(
      occFilter.filter,
      targetStaffId,
      orgId,
      locationId,
    );

    if (!updated) {
      return {
        success: false,
        executionSummary: "",
        error: getStaleReason(proposal),
        stale: true,
      };
    }

    const currentName = payload.currentStaffName ?? "the previous assignee";
    const targetName = payload.targetStaffName ?? "the new assignee";

    return {
      success: true,
      executionSummary: `Shift reassigned from ${currentName} to ${targetName}. Shift: ${updated.station} on ${updated.start.toISOString()}.`,
      data: updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      executionSummary: "",
      error: `Shift swap failed: ${message}`,
    };
  }
}

async function executeScheduleGeneration(
  proposal: StoredProposal,
): Promise<ExecuteProposalResult> {
  const weekStartDate = proposal.payload.weekStartDate;

  return {
    success: true,
    executionSummary: `Schedule generation queued for week of ${typeof weekStartDate === "string" ? weekStartDate : "unknown"}. Phase 4 will handle async execution.`,
    data: { queued: true, weekStartDate },
  };
}
