import type { StoredProposal } from "@/types/conversation";
import { combineDateTime, getWeekStart, parseDateString } from "@/lib/utils/date";
import { buildOCCFilter, getStaleReason } from "./occ";
import type { AcceptSchedulePayload } from "@/lib/ai/tools/definitions/propose-accept-generated-schedule.schema";
import { AsyncTaskService } from "@/server/services/async-task.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import type { CreateShiftInput } from "@/types/shift";

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
  /** Required for `propose_schedule_generation` — links the async task to the conversation */
  conversationId?: string;
}

export interface ExecuteProposalResult {
  success: boolean;
  executionSummary: string;
  data?: unknown;
  error?: string;
  errorCode?: ProposalErrorCode;
  /** If set, schedule generation was dispatched to the async solver; client should poll */
  asyncTaskId?: string;
  /** ISO timestamp — polling deadline for the async task */
  asyncDeadline?: string;
  /** Collapse related generation card + async indicator after accept-generated-schedule */
  cascadeState?: {
    collapseProposalId: string;
    collapseTaskId: string;
    collapsedMessage: string;
  };
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
      return executeScheduleGeneration(input);
    case "propose_accept_generated_schedule":
      return executeAcceptGeneratedSchedule(proposal, orgId, locationId);
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

const ASYNC_SCHEDULE_SUCCESS_SUMMARY =
  "Schedule generation has been dispatched to the solver. This typically takes 10-30 seconds.";

async function executeScheduleGeneration(
  input: ExecuteProposalInput,
): Promise<ExecuteProposalResult> {
  const { proposal, orgId, locationId, clerkUserId, conversationId } = input;

  if (!conversationId) {
    return {
      success: false,
      executionSummary: "",
      error:
        "Malformed execution context for 'propose_schedule_generation': missing conversationId.",
      errorCode: "malformed_payload",
    };
  }

  const weekStartDate = proposal.payload.weekStartDate;
  if (typeof weekStartDate !== "string") {
    return {
      success: false,
      executionSummary: "",
      error: "Malformed proposal payload for 'propose_schedule_generation': missing required field 'weekStartDate'.",
      errorCode: "malformed_payload",
    };
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)
    ? parseDateString(weekStartDate)
    : new Date(weekStartDate);
  if (isNaN(parsed.getTime())) {
    return {
      success: false,
      executionSummary: "",
      error:
        "Malformed proposal payload for 'propose_schedule_generation': invalid 'weekStartDate'.",
      errorCode: "malformed_payload",
    };
  }
  const weekStart = getWeekStart(parsed);

  const rawTemplate = proposal.payload.templateScheduleId;
  let templateScheduleId: string | undefined;
  if (typeof rawTemplate === "string" && rawTemplate.length > 0) {
    templateScheduleId = rawTemplate;
  }

  let schedule;
  try {
    schedule = await ScheduleService.getOrCreateForWeek(
      orgId,
      locationId,
      weekStart,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      executionSummary: "",
      error: `Failed to dispatch schedule generation: ${message}`,
      errorCode: "execution_failed",
    };
  }

  const dispatch = await AsyncTaskService.dispatchScheduleGeneration({
    proposalId: proposal.proposalId,
    conversationId,
    orgId,
    locationId,
    clerkUserId,
    scheduleId: schedule.id,
    weekStartDate,
    ...(templateScheduleId ? { templateScheduleId } : {}),
  });

  if (!dispatch.dispatched) {
    const detail = dispatch.error ?? "Unknown error";
    return {
      success: false,
      executionSummary: "",
      error: `Failed to dispatch schedule generation: ${detail}`,
      errorCode: "execution_failed",
    };
  }

  return {
    success: true,
    executionSummary: ASYNC_SCHEDULE_SUCCESS_SUMMARY,
    asyncTaskId: dispatch.taskId,
    asyncDeadline: dispatch.deadline.toISOString(),
  };
}

function formatWeekLabelForSummary(weekStartDate: Date | string): string {
  const d =
    weekStartDate instanceof Date
      ? weekStartDate
      : parseDateString(weekStartDate);
  if (isNaN(d.getTime())) {
    return weekStartDate instanceof Date
      ? weekStartDate.toISOString().slice(0, 10)
      : String(weekStartDate);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

async function executeAcceptGeneratedSchedule(
  proposal: StoredProposal,
  orgId: string,
  locationId: string,
): Promise<ExecuteProposalResult> {
  const payload = proposal.payload as Partial<AcceptSchedulePayload>;

  const scheduleId = typeof payload.scheduleId === "string" ? payload.scheduleId : "";
  const shifts = Array.isArray(payload.shifts) ? payload.shifts : null;
  const originatingProposalId =
    typeof payload.originatingProposalId === "string"
      ? payload.originatingProposalId
      : "";
  const originatingTaskId =
    typeof payload.originatingTaskId === "string" ? payload.originatingTaskId : "";

  if (!scheduleId || !shifts || shifts.length === 0) {
    return {
      success: false,
      executionSummary: "",
      error:
        "Malformed proposal payload for 'propose_accept_generated_schedule': missing scheduleId or shifts.",
      errorCode: "malformed_payload",
    };
  }

  if (!originatingProposalId || !originatingTaskId) {
    return {
      success: false,
      executionSummary: "",
      error:
        "Malformed proposal payload for 'propose_accept_generated_schedule': missing originatingProposalId or originatingTaskId.",
      errorCode: "malformed_payload",
    };
  }

  const schedule = await ScheduleService.getById(orgId, locationId, scheduleId);
  if (!schedule) {
    return {
      success: false,
      executionSummary: "",
      error: "Schedule not found.",
      errorCode: "execution_failed",
    };
  }

  const createInputs: CreateShiftInput[] = shifts.map((shift) => {
    const date = parseDateString(shift.date);
    const start = combineDateTime(date, shift.startTime);
    const end = combineDateTime(date, shift.endTime);

    return {
      orgId,
      locationId,
      scheduleId,
      staffId: shift.staffId,
      start,
      end,
      station: shift.station,
      notes: "",
    };
  });

  try {
    const result = await ShiftService.bulkCreate(createInputs);
    const weekLabel = formatWeekLabelForSummary(schedule.weekStartDate);
    const created = result.created;
    const executionSummary = `Schedule saved: ${created} shift${created === 1 ? "" : "s"} created for the week of ${weekLabel}.`;

    const collapsedMessage = `✅ Schedule Accepted — ${created} shift${created === 1 ? "" : "s"} saved`;

    return {
      success: true,
      executionSummary,
      data: result,
      cascadeState: {
        collapseProposalId: originatingProposalId,
        collapseTaskId: originatingTaskId,
        collapsedMessage,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      executionSummary: "",
      error: `Failed to save generated schedule: ${message}`,
      errorCode: "execution_failed",
    };
  }
}
