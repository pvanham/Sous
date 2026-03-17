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

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/** Convert JS Date.getUTCDay() (0=Sun..6=Sat) to schema convention (0=Mon..6=Sun) */
function toMondayBasedDay(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export async function executeGetShiftRoster(
  params: GetShiftRosterParams,
  context: ToolExecutionContext
): Promise<ShiftRosterResult | null> {
  const schedule = await ScheduleService.getById(
    context.orgId,
    context.locationId,
    params.scheduleId
  );

  if (!schedule) return null;

  const [shifts, staff] = await Promise.all([
    ShiftService.getBySchedule(schedule.id),
    StaffService.list(context.orgId, context.locationId),
  ]);

  const staffById = new Map(staff.map((s) => [s.id, s]));

  let filtered = shifts;

  if (params.staffId) {
    filtered = filtered.filter((s) => s.staffId === params.staffId);
  }

  if (params.dayOfWeek !== undefined) {
    filtered = filtered.filter(
      (s) => toMondayBasedDay(new Date(s.start)) === params.dayOfWeek
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
      day: dayFormatter.format(startDate),
      start: timeFormatter.format(startDate),
      end: timeFormatter.format(endDate),
      hours,
      station: shift.station,
      notes: sanitizeUserText(shift.notes),
    };
  });

  const paginated = paginate(entries, {
    page: params.page,
    pageSize: params.pageSize,
  });

  return {
    scheduleId: schedule.id,
    shifts: paginated.items,
    pagination: paginated.pagination,
  };
}
