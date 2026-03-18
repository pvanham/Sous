import type { GetStaffSummaryParams, StaffSummary } from "./get-staff-summary.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { StaffService } from "@/server/services/staff.service";

export async function executeGetStaffSummary(
  params: GetStaffSummaryParams,
  context: ToolExecutionContext
): Promise<StaffSummary> {
  const allStaff = await StaffService.list(context.orgId, context.locationId);

  const activeStaff = allStaff.filter((s) => s.isActive);
  const inactiveStaff = allStaff.filter((s) => !s.isActive);

  const filtered = params.activeOnly ? activeStaff : allStaff;

  const roleCounts = new Map<string, number>();
  for (const member of filtered) {
    for (const role of member.roles) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    }
  }
  const roleDistribution = Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);

  const stationData = new Map<string, { totalProficiency: number; count: number }>();
  for (const member of filtered) {
    for (const skill of member.skills) {
      const entry = stationData.get(skill.station) ?? { totalProficiency: 0, count: 0 };
      entry.totalProficiency += skill.proficiency;
      entry.count += 1;
      stationData.set(skill.station, entry);
    }
  }
  const stationCoverage = Array.from(stationData.entries())
    .map(([station, { totalProficiency, count }]) => ({
      station,
      staffCount: count,
      avgProficiency: Math.round((totalProficiency / count) * 10) / 10,
    }))
    .sort((a, b) => b.staffCount - a.staffCount);

  const totalAvailableHours = filtered.reduce((sum, s) => sum + s.maxHoursPerWeek, 0);
  const avgMaxHoursPerWeek =
    filtered.length > 0
      ? Math.round((totalAvailableHours / filtered.length) * 10) / 10
      : 0;
  const avgMinHoursPerWeek =
    filtered.length > 0
      ? Math.round(
          (filtered.reduce((sum, s) => sum + s.minHoursPerWeek, 0) / filtered.length) * 10
        ) / 10
      : 0;

  return {
    totalStaff: filtered.length,
    activeStaff: activeStaff.length,
    inactiveStaff: inactiveStaff.length,
    staffList: filtered.map((member) => ({ id: member.id, name: member.name })),
    roleDistribution,
    stationCoverage,
    hoursSummary: {
      avgMaxHoursPerWeek,
      avgMinHoursPerWeek,
      totalAvailableHours,
    },
  };
}
