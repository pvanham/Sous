import type {
  ResolveScheduleParams,
  ResolveScheduleResult,
} from "./resolve-schedule.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";

/**
 * Compute the Monday (start-of-week) for a given date in a timezone.
 * Uses Intl to determine the local weekday, then subtracts days to reach Monday.
 */
function toMonday(date: Date, tz: string): Date {
  const localDay = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: tz,
  }).format(date);

  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const daysSinceMonday = dayMap[localDay] ?? 0;

  const monday = new Date(date);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function executeResolveSchedule(
  params: ResolveScheduleParams,
  context: ToolExecutionContext,
): Promise<ResolveScheduleResult> {
  const parsed = new Date(params.weekDate);
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

  const tz = context.timezone || "UTC";
  const monday = toMonday(parsed, tz);

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  }).format(monday);

  const weekStartDate = monday.toISOString();

  const schedule = await ScheduleService.getByWeek(
    context.orgId,
    context.locationId,
    monday,
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
