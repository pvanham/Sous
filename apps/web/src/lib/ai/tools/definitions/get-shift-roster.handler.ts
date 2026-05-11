import type {
  GetShiftRosterParams,
  ShiftRosterEntry,
  ShiftRosterResult,
} from "./get-shift-roster.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { paginate } from "../pagination";
import { sanitizeUserText } from "../sanitize";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { dayOfWeekToIndex, type DayOfWeek } from "@sous/types";
import { Types } from "mongoose";

function createFormatters(tz: string) {
  return {
    day: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }),
  };
}

/**
 * Convert a Date to a week-start-relative day index where 0 is the
 * location's configured `weekStartsOn`. This is the convention every
 * `dayOfWeek` tool parameter uses, so the model and the SQL-side filter
 * agree on the meaning of "0".
 */
function toWeekStartRelativeDay(
  date: Date,
  tz: string,
  weekStartsOn: DayOfWeek,
): number {
  const localDay = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: tz,
  }).format(date);
  const calendarMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const calendarIndex = calendarMap[localDay] ?? 0;
  const startIndex = dayOfWeekToIndex(weekStartsOn);
  return (calendarIndex - startIndex + 7) % 7;
}

export async function executeGetShiftRoster(
  params: GetShiftRosterParams,
  context: ToolExecutionContext
): Promise<ShiftRosterResult | null> {
  const hasValidId =
    params.scheduleId && Types.ObjectId.isValid(params.scheduleId);

  let schedule = hasValidId
    ? await ScheduleService.getById(
        context.orgId,
        context.locationId,
        params.scheduleId!
      )
    : null;

  if (!schedule) {
    schedule = await ScheduleService.getMostRecent(
      context.orgId,
      context.locationId
    );
  }

  if (!schedule) {
    console.log(
      "[get_shift_roster] No schedule found for context",
      {
        orgId: context.orgId,
        locationId: context.locationId,
        requestedScheduleId: params.scheduleId ?? null,
      }
    );
    return null;
  }

  const [shifts, staff, weekStartsOn] = await Promise.all([
    ShiftService.getBySchedule(schedule.id),
    StaffService.list(context.orgId, context.locationId),
    KitchenConfigService.getWeekStartsOn(context.orgId, context.locationId),
  ]);

  const tz = context.timezone || "UTC";
  const fmt = createFormatters(tz);

  const staffById = new Map(staff.map((s) => [s.id, s]));

  let filtered = shifts;

  if (params.staffId) {
    filtered = filtered.filter((s) => s.staffId === params.staffId);
  }

  if (params.dayOfWeek !== undefined) {
    filtered = filtered.filter(
      (s) =>
        toWeekStartRelativeDay(new Date(s.start), tz, weekStartsOn) ===
        params.dayOfWeek,
    );
  }

  const entries: ShiftRosterEntry[] = filtered.map((shift) => {
    const startDate = new Date(shift.start);
    const endDate = new Date(shift.end);
    const hours =
      Math.round(
        ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)) * 10
      ) / 10;

    const member = staffById.get(shift.staffId);

    return {
      shiftId: shift.id,
      staffName: member?.name ?? "Unknown Staff",
      staffId: shift.staffId,
      day: fmt.day.format(startDate),
      start: fmt.time.format(startDate),
      end: fmt.time.format(endDate),
      hours,
      station: shift.station,
      notes: sanitizeUserText(shift.notes),
    };
  });

  const paginated = paginate(entries, {
    page: params.page,
    pageSize: params.pageSize,
  });

  console.log(`[get_shift_roster] Returning data for schedule ${schedule.id}`, {
    totalShifts: entries.length,
    paginatedCount: paginated.items.length,
  });

  return {
    scheduleId: schedule.id,
    shifts: paginated.items,
    pagination: paginated.pagination,
  };
}
