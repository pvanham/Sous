import type {
  GetScheduleHealthParams,
  ScheduleHealthSummary,
} from "./get-schedule-health.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { Types } from "mongoose";

const DEFAULT_OVERTIME_THRESHOLD_HOURS = 40;

export async function executeGetScheduleHealth(
  params: GetScheduleHealthParams,
  context: ToolExecutionContext
): Promise<ScheduleHealthSummary | null> {
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
      "[get_schedule_health] No schedule found for context",
      {
        orgId: context.orgId,
        locationId: context.locationId,
        requestedScheduleId: params.scheduleId ?? null,
      }
    );
    return null;
  }

  const [shifts, staff, config] = await Promise.all([
    ShiftService.getBySchedule(schedule.id),
    StaffService.list(context.orgId, context.locationId),
    KitchenConfigService.getByLocation(context.orgId, context.locationId),
  ]);

  const overtimeThreshold =
    config?.scheduleGenerationSettings.overtimeThresholdHours ??
    DEFAULT_OVERTIME_THRESHOLD_HOURS;

  const totalShifts = shifts.length;

  const scheduledStaffIds = new Set(shifts.map((s) => s.staffId));
  const totalStaffScheduled = scheduledStaffIds.size;

  const hoursByStaff = new Map<string, number>();
  let totalHoursScheduled = 0;

  for (const shift of shifts) {
    const hours =
      (new Date(shift.end).getTime() - new Date(shift.start).getTime()) /
      (1000 * 60 * 60);
    totalHoursScheduled += hours;
    hoursByStaff.set(
      shift.staffId,
      (hoursByStaff.get(shift.staffId) ?? 0) + hours
    );
  }

  totalHoursScheduled = Math.round(totalHoursScheduled * 100) / 100;

  const averageHoursPerStaff =
    totalStaffScheduled > 0
      ? Math.round((totalHoursScheduled / totalStaffScheduled) * 100) / 100
      : 0;

  const staffById = new Map(staff.map((s) => [s.id, s]));

  const overtimeRisks: ScheduleHealthSummary["overtimeRisks"] = [];
  for (const [staffId, hours] of hoursByStaff) {
    if (hours > overtimeThreshold) {
      const member = staffById.get(staffId);
      overtimeRisks.push({
        staffName: member?.name ?? "Unknown Staff",
        totalHours: Math.round(hours * 100) / 100,
        threshold: overtimeThreshold,
      });
    }
  }

  const managerCoverageGaps: ScheduleHealthSummary["managerCoverageGaps"] =
    config
      ? ScheduleService.validateManagerCoverage(
          schedule.weekStartDate,
          shifts,
          staff,
          config
        )
      : [];

  const activeStaff = staff.filter((s) => s.isActive);
  const unscheduledStaffCount = activeStaff.filter(
    (s) => !scheduledStaffIds.has(s.id)
  ).length;

  console.log(`[get_schedule_health] Returning data for schedule ${schedule.id}`, {
    totalShifts,
    totalStaffScheduled,
    overtimeRiskCount: overtimeRisks.length,
  });

  return {
    scheduleId: schedule.id,
    weekStartDate: schedule.weekStartDate.toISOString(),
    status: schedule.status,
    totalShifts,
    totalStaffScheduled,
    totalHoursScheduled,
    averageHoursPerStaff,
    overtimeRisks,
    managerCoverageGaps,
    unscheduledStaffCount,
  };
}
