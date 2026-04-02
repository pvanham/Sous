import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import AsyncTask from "@/server/models/AsyncTask";
import type {
  AcceptSchedulePayload,
  ProposeAcceptGeneratedScheduleParams,
} from "./propose-accept-generated-schedule.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import type { ToolProposal } from "../tool-proposal.types";
import type { AcceptedShift } from "@/types/ai-scheduling";

function createWeekLabel(weekStart: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  }).format(weekStart);
}

function parseWeekStart(weekStartDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartDate);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
  }
  const d = new Date(weekStartDate);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Flatten solver DayResult JSON into shifts for acceptGeneratedSchedule.
 */
function extractShiftsFromGeneratedDays(generatedDays: unknown[]): AcceptedShift[] {
  const shifts: AcceptedShift[] = [];

  for (const day of generatedDays) {
    if (!day || typeof day !== "object" || Array.isArray(day)) continue;
    const d = day as Record<string, unknown>;
    const date = typeof d.date === "string" ? d.date : "";
    const assignments = Array.isArray(d.assignments) ? d.assignments : [];

    for (const raw of assignments) {
      if (!raw || typeof raw !== "object") continue;
      const a = raw as Record<string, unknown>;
      const staffId = typeof a.staffId === "string" ? a.staffId : "";
      const station = typeof a.station === "string" ? a.station : "";
      const startTime = typeof a.startTime === "string" ? a.startTime : "";
      const endTime = typeof a.endTime === "string" ? a.endTime : "";

      if (staffId && station && date && startTime && endTime) {
        shifts.push({ staffId, station, date, startTime, endTime });
      }
    }
  }

  return shifts;
}

export async function executeProposeAcceptGeneratedSchedule(
  params: ProposeAcceptGeneratedScheduleParams,
  context: ToolExecutionContext,
): Promise<ToolProposal<AcceptSchedulePayload> | null> {
  if (!Types.ObjectId.isValid(params.taskId)) {
    throw new Error("Task not found or not accessible.");
  }

  await dbConnect();

  const task = await AsyncTask.findOne({
    _id: new Types.ObjectId(params.taskId),
    orgId: new Types.ObjectId(context.orgId),
    locationId: new Types.ObjectId(context.locationId),
    clerkUserId: context.clerkUserId,
  }).lean();

  if (!task) {
    throw new Error("Task not found or not accessible.");
  }

  if (task.status !== "completed") {
    throw new Error(
      `Cannot accept schedule: task status is '${task.status}', expected 'completed'.`,
    );
  }

  const result = task.result;
  const generatedDays = result?.generatedDays;
  if (!Array.isArray(generatedDays) || generatedDays.length === 0) {
    throw new Error("Cannot accept schedule: no shifts were generated.");
  }

  const shifts = extractShiftsFromGeneratedDays(generatedDays);
  if (shifts.length === 0) {
    throw new Error("Cannot accept schedule: no shifts were generated.");
  }

  const totalCostCents =
    typeof result?.totalCostCents === "number" && Number.isFinite(result.totalCostCents)
      ? result.totalCostCents
      : 0;

  const weekStart = parseWeekStart(task.weekStartDate);
  const tz = context.timezone || "UTC";
  const weekLabel = weekStart
    ? createWeekLabel(weekStart, tz)
    : task.weekStartDate;

  const costFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totalCostCents / 100);

  const description = `Accept the generated schedule for the week of ${weekLabel} (${shifts.length} shifts, ${costFormatted} estimated cost).`;

  const payload: AcceptSchedulePayload = {
    scheduleId: task.scheduleId,
    shifts,
    originatingProposalId: task.proposalId,
    originatingTaskId: String(task._id),
    totalShiftsGenerated: shifts.length,
    totalCostCents,
  };

  return {
    proposalId: crypto.randomUUID(),
    toolName: "propose_accept_generated_schedule",
    description,
    payload,
    dataVersion: "",
    type: "write",
  };
}
