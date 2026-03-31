import type { StoredProposal } from "@/types/conversation";
import { buildOCCFilter, getStaleReason } from "./occ";
import { ShiftService } from "@/server/services/shift.service";

export type ProposalErrorCode =
  | "stale_data"
  | "malformed_payload"
  | "unknown_tool"
  | "execution_failed";

export interface ExecuteProposalInput {
  proposal: StoredProposal;
  orgId: string;
  locationId: string;
  clerkUserId: string;
}

export interface ExecuteProposalResult {
  success: boolean;
  executionSummary: string;
  data?: unknown;
  error?: string;
  errorCode?: ProposalErrorCode;
}

/**
 * Maps a validated StoredProposal to the correct service-layer mutation.
 * Internally builds the atomic OCC filter and executes the mutation
 * in a single findOneAndUpdate call. The caller only needs to provide
 * the proposal and tenant-scoping fields.
 */
export async function executeProposal(
  input: ExecuteProposalInput
): Promise<ExecuteProposalResult> {
  const { proposal, orgId, locationId } = input;

  switch (proposal.toolName) {
    case "propose_shift_swap":
      return executeShiftSwap(proposal, orgId, locationId);
    case "propose_schedule_generation":
      return executeScheduleGeneration(proposal);
    default:
      return {
        success: false,
        executionSummary: "",
        error: `Unknown proposal type: '${proposal.toolName}'. This proposal cannot be executed.`,
        errorCode: "unknown_tool",
      };
  }
}

async function executeShiftSwap(
  proposal: StoredProposal,
  orgId: string,
  locationId: string,
): Promise<ExecuteProposalResult> {
  const { payload } = proposal;

  const shiftId = payload.shiftId;
  if (typeof shiftId !== "string") {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_shift_swap': missing required field 'shiftId'.",
      errorCode: "malformed_payload",
    };
  }

  const targetStaffId = payload.targetStaffId;
  if (typeof targetStaffId !== "string") {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_shift_swap': missing required field 'targetStaffId'.",
      errorCode: "malformed_payload",
    };
  }

  let occFilter;
  try {
    occFilter = buildOCCFilter(proposal);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      executionSummary: "",
      error: message,
      errorCode: "stale_data",
    };
  }

  if (Array.isArray(occFilter)) {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_shift_swap': expected single OCC filter.",
      errorCode: "malformed_payload",
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
        errorCode: "stale_data",
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
      errorCode: "execution_failed",
    };
  }
}

async function executeScheduleGeneration(
  proposal: StoredProposal,
): Promise<ExecuteProposalResult> {
  const weekStartDate = proposal.payload.weekStartDate;
  if (typeof weekStartDate !== "string") {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_schedule_generation': missing required field 'weekStartDate'.",
      errorCode: "malformed_payload",
    };
  }

  return {
    success: false,
    executionSummary: `Schedule generation is not yet available. This feature is coming soon.`,
    error: "Schedule generation is not yet available. This feature is coming soon.",
    errorCode: "execution_failed",
  };
}
