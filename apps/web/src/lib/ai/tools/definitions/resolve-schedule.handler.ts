import type {
  ResolveScheduleParams,
  ResolveScheduleResult,
} from "./resolve-schedule.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { getWeekStart } from "@/lib/utils/date";

/**
 * Parse a date-only ISO string (e.g. "2026-03-31") as a local-timezone Date
 * rather than UTC midnight. Falls back to standard Date parsing for
 * non-date-only strings.
 */
function parseAsLocalDate(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(input);
}

export async function executeResolveSchedule(
  params: ResolveScheduleParams,
  context: ToolExecutionContext,
): Promise<ResolveScheduleResult> {
  const parsed = parseAsLocalDate(params.weekDate);
  if (isNaN(parsed.getTime())) {
    return {
      found: false,
      scheduleId: null,
      weekStartDate: params.weekDate,
      weekLabel: params.weekDate,
      status: null,
      shiftCount: 0,
    };
  }

  const weekStartsOn = await KitchenConfigService.getWeekStartsOn(
    context.orgId,
    context.locationId,
  );
  const weekStart = getWeekStart(parsed, weekStartsOn);

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(weekStart);

  const weekStartDate = weekStart.toISOString();

  const schedule = await ScheduleService.getByWeek(
    context.orgId,
    context.locationId,
    weekStart,
  );

  if (!schedule) {
    console.log(
      `[resolve_schedule] No schedule found for week of ${weekLabel}`,
      { orgId: context.orgId, locationId: context.locationId },
    );
    return {
      found: false,
      scheduleId: null,
      weekStartDate,
      weekLabel,
      status: null,
      shiftCount: 0,
    };
  }

  const shifts = await ShiftService.getBySchedule(schedule.id);

  console.log(
    `[resolve_schedule] Resolved week of ${weekLabel} → schedule ${schedule.id} (${shifts.length} shifts)`,
  );

  return {
    found: true,
    scheduleId: schedule.id,
    weekStartDate,
    weekLabel,
    status: schedule.status,
    shiftCount: shifts.length,
  };
}
