import type { ToolProposal } from "../tools/tool-proposal.types";
import type { StoredProposal } from "@/types/conversation";
import Conversation from "@/server/models/Conversation";

/**
 * Client-safe proposal shape streamed to the frontend via the SDK's
 * native `toolInvocations`. The mutation `payload` is stripped —
 * it lives server-side only in the Conversation model.
 */
export interface ClientSafeProposal {
  type: "write";
  proposalId: string;
  toolName: string;
  description: string;
  summary: {
    action: string;
    details: string[];
  };
  dataVersion: string;
  createdAt: string;
}

/**
 * Structural type guard — checks `type === "write"` and the presence
 * of `proposalId`, never relies on tool name string matching.
 */
export function isProposalResult(result: unknown): result is ToolProposal {
  if (result == null || typeof result !== "object") return false;
  const obj = result as Record<string, unknown>;
  return (
    obj.type === "write" &&
    typeof obj.proposalId === "string" &&
    typeof obj.toolName === "string"
  );
}

/**
 * Build a human-readable summary from the proposal's payload,
 * then strip the payload so the mutation details never reach the client.
 */
export function toClientSafeProposal(proposal: ToolProposal): ClientSafeProposal {
  const summary = buildSummary(proposal);

  return {
    type: "write",
    proposalId: proposal.proposalId,
    toolName: proposal.toolName,
    description: proposal.description,
    summary,
    dataVersion: proposal.dataVersion,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Persist the full proposal (with payload) to the Conversation model.
 * Best-effort: errors are logged, never thrown.
 */
export async function persistProposal(
  conversationId: string,
  proposal: ToolProposal
): Promise<void> {
  const storedProposal: StoredProposal = {
    proposalId: proposal.proposalId,
    toolName: proposal.toolName,
    description: proposal.description,
    payload: proposal.payload as Record<string, unknown>,
    dataVersion: proposal.dataVersion,
    status: "pending",
    createdAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };

  try {
    await Conversation.findByIdAndUpdate(conversationId, {
      $push: {
        messages: {
          role: "tool" as const,
          content: proposal.description,
          proposal: storedProposal,
          toolCall: {
            toolName: proposal.toolName,
            arguments: proposal.payload as Record<string, unknown>,
          },
          timestamp: new Date(),
        },
      },
    });
  } catch (err) {
    console.error(
      `[ProposalHandler] Failed to persist proposal '${proposal.proposalId}': ${err}`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary builders — extract human-readable details from typed payloads
// ---------------------------------------------------------------------------

interface ShiftSwapPayloadShape {
  currentStaffName?: string;
  targetStaffName?: string;
  shiftDetails?: {
    day?: string;
    start?: string;
    end?: string;
    station?: string;
  };
}

interface ScheduleGenPayloadShape {
  weekStartDate?: string;
  staffCount?: number;
  configSnapshot?: {
    overtimeThresholdHours?: number;
    overtimePolicy?: string;
    allowClopening?: boolean;
  };
}

interface AcceptSchedulePayloadShape {
  totalShiftsGenerated?: number;
  totalCostCents?: number;
}

function buildSummary(proposal: ToolProposal): { action: string; details: string[] } {
  switch (proposal.toolName) {
    case "propose_shift_swap":
      return buildShiftSwapSummary(proposal.payload as ShiftSwapPayloadShape);
    case "propose_schedule_generation":
      return buildScheduleGenSummary(proposal.payload as ScheduleGenPayloadShape);
    case "propose_accept_generated_schedule":
      return buildAcceptScheduleSummary(
        proposal.payload as AcceptSchedulePayloadShape,
      );
    default:
      return buildFallbackSummary(proposal);
  }
}

function buildShiftSwapSummary(payload: ShiftSwapPayloadShape): {
  action: string;
  details: string[];
} {
  const details: string[] = [];

  if (payload.currentStaffName) {
    details.push(`From: ${payload.currentStaffName}`);
  }
  if (payload.targetStaffName) {
    details.push(`To: ${payload.targetStaffName}`);
  }

  const sd = payload.shiftDetails;
  if (sd) {
    const parts = [sd.day, sd.start && sd.end ? `${sd.start} – ${sd.end}` : null, sd.station]
      .filter(Boolean)
      .join(", ");
    if (parts) details.push(`Shift: ${parts}`);
  }

  return { action: "Shift Swap", details };
}

function buildScheduleGenSummary(payload: ScheduleGenPayloadShape): {
  action: string;
  details: string[];
} {
  const details: string[] = [];

  if (payload.weekStartDate) {
    details.push(`Week of: ${payload.weekStartDate}`);
  }
  if (payload.staffCount != null) {
    details.push(`Staff: ${payload.staffCount} active members`);
  }

  const cs = payload.configSnapshot;
  if (cs) {
    details.push(
      `Overtime: ${cs.overtimePolicy ?? "default"} (threshold: ${cs.overtimeThresholdHours ?? "N/A"}h)`
    );
    if (cs.allowClopening === true) {
      details.push("Clopening: allowed");
    }
  }

  return { action: "Schedule Generation", details };
}

function buildAcceptScheduleSummary(payload: AcceptSchedulePayloadShape): {
  action: string;
  details: string[];
} {
  const details: string[] = [];

  const n =
    typeof payload.totalShiftsGenerated === "number" &&
    Number.isFinite(payload.totalShiftsGenerated)
      ? payload.totalShiftsGenerated
      : 0;
  if (n > 0) {
    details.push(`${n} shift${n === 1 ? "" : "s"}`);
  }

  const cents =
    typeof payload.totalCostCents === "number" &&
    Number.isFinite(payload.totalCostCents)
      ? payload.totalCostCents
      : 0;
  details.push(
    `Estimated cost: ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)}`,
  );

  return { action: "Accept Generated Schedule", details };
}

function buildFallbackSummary(proposal: ToolProposal): {
  action: string;
  details: string[];
} {
  const action = proposal.toolName
    .replace(/^propose_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return { action, details: [proposal.description] };
}
