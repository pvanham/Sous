import type {
  ProposeScheduleGenerationParams,
  ScheduleGenerationPayload,
} from "./propose-schedule-generation.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import type { ToolProposal } from "../tool-proposal.types";
import { sanitizeUserText } from "../sanitize";
import { computeDataVersion } from "@/lib/ai/orchestrator/occ";
import { ScheduleService } from "@/server/services/schedule.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";

const DEFAULT_OVERTIME_THRESHOLD_HOURS = 40;
const DEFAULT_OVERTIME_POLICY = "avoid";

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parseISODate(value: string): Date | null {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export async function executeProposeScheduleGeneration(
  params: ProposeScheduleGenerationParams,
  context: ToolExecutionContext
): Promise<ToolProposal<ScheduleGenerationPayload> | null> {
  const weekStart = parseISODate(params.weekStartDate);
  if (!weekStart) {
    throw new Error(
      "Invalid date format for weekStartDate. Expected ISO date string (e.g., '2026-03-17')."
    );
  }

  const [schedule, config, staff] = await Promise.all([
    ScheduleService.getByWeek(context.orgId, context.locationId, weekStart),
    KitchenConfigService.getByLocation(context.orgId, context.locationId),
    StaffService.list(context.orgId, context.locationId),
  ]);

  if (params.templateScheduleId) {
    const template = await ScheduleService.getById(
      context.orgId,
      context.locationId,
      params.templateScheduleId
    );
    if (!template) return null;
  }

  const activeStaff = staff.filter((s) => s.isActive);

  // Composite dataVersion: schedule updatedAt + config updatedAt + latest staff updatedAt
  const scheduleVersion = schedule
    ? schedule.updatedAt.toISOString()
    : "none";
  const configVersion = config ? config.updatedAt.toISOString() : "none";
  const latestStaffUpdate =
    activeStaff.length > 0
      ? activeStaff
          .reduce((latest, s) =>
            s.updatedAt > latest.updatedAt ? s : latest
          )
          .updatedAt.toISOString()
      : "none";

  const dataVersion = computeDataVersion(
    scheduleVersion,
    configVersion,
    latestStaffUpdate
  );

  const overtimeThresholdHours =
    config?.scheduleGenerationSettings.overtimeThresholdHours ??
    DEFAULT_OVERTIME_THRESHOLD_HOURS;
  const overtimePolicy =
    config?.scheduleGenerationSettings.overtimePolicy ??
    DEFAULT_OVERTIME_POLICY;
  const allowClopening =
    config?.scheduleGenerationSettings.allowClopening ?? false;

  const weekLabel = weekFormatter.format(weekStart);
  const description = `Generate a new schedule for the week of ${weekLabel} with ${activeStaff.length} staff members`;

  const payload: ScheduleGenerationPayload = {
    weekStartDate: params.weekStartDate,
    templateScheduleId: params.templateScheduleId ?? null,
    additionalInstructions: sanitizeUserText(params.additionalInstructions),
    staffCount: activeStaff.length,
    configSnapshot: {
      overtimeThresholdHours,
      overtimePolicy,
      allowClopening,
    },
    _occTimestamps: {
      scheduleUpdatedAt: schedule ? schedule.updatedAt.toISOString() : null,
      configUpdatedAt: config ? config.updatedAt.toISOString() : null,
      latestStaffUpdatedAt:
        latestStaffUpdate !== "none" ? latestStaffUpdate : null,
    },
  };

  return {
    proposalId: crypto.randomUUID(),
    toolName: "propose_schedule_generation",
    description,
    payload,
    dataVersion,
    type: "write",
  };
}
