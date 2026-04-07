import type {
  ProposeScheduleGenerationParams,
  ScheduleGenerationPayload,
} from "./propose-schedule-generation.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import type { ToolProposal } from "../tool-proposal.types";
import { sanitizeUserText } from "../sanitize";
import { computeDataVersion } from "@/lib/ai/orchestrator/occ";
import { getWeekStart, parseDateString } from "@/lib/utils/date";
import { ScheduleService } from "@/server/services/schedule.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";

const DEFAULT_OVERTIME_THRESHOLD_HOURS = 40;
const DEFAULT_OVERTIME_POLICY = "avoid";

function createWeekFormatter(tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

function parseAsLocalDate(value: string): Date | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateString(value)
    : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export async function executeProposeScheduleGeneration(
  params: ProposeScheduleGenerationParams,
  context: ToolExecutionContext
): Promise<ToolProposal<ScheduleGenerationPayload> | null> {
  const parsed = parseAsLocalDate(params.weekStartDate);
  if (!parsed) {
    throw new Error(
      "Invalid date format for weekStartDate. Expected ISO date string (e.g., '2026-03-17')."
    );
  }
  const weekStart = getWeekStart(parsed);

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

  const tz = context.timezone || "UTC";
  const weekLabel = createWeekFormatter(tz).format(weekStart);
  const description = `Generate a new schedule for the week of ${weekLabel} with ${activeStaff.length} staff members`;

  const normalizedWeekStart = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;

  const payload: ScheduleGenerationPayload = {
    weekStartDate: normalizedWeekStart,
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
