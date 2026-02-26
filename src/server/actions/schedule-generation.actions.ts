"use server";

import { auth } from "@clerk/nextjs/server";
import {
  checkReadinessSchema,
  generateScheduleSchema,
  acceptGeneratedScheduleSchema,
} from "@/lib/validations/schedule-generation.schema";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { combineDateTime, parseDateString } from "@/lib/utils/date";
import { SchedulingAgentService } from "@/server/services/ai/scheduling-agent.service";
import { AIUsageService } from "@/server/services/ai-usage.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { StaffService } from "@/server/services/staff.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { ShiftService } from "@/server/services/shift.service";
import type { ActionResponse } from "@/lib/safe-action";
import type {
  GeneratedSchedule,
  ReadinessCheckResult,
  ReadinessIssue,
} from "@/types/ai-scheduling";
import type { KitchenConfigDTO, IWeeklyOperatingHours } from "@/types/kitchen-config";
import type { LaborRequirementDTO } from "@/types/labor-requirement";

// ────────────────────────────────────────────────────────────
// Day key lookup for operating hours
// ────────────────────────────────────────────────────────────

const DAY_INDEX_TO_KEY: Record<number, keyof IWeeklyOperatingHours> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

// ────────────────────────────────────────────────────────────
// checkGenerationReadiness
// ────────────────────────────────────────────────────────────

/**
 * Run pre-generation readiness checks.
 * Verifies AI usage limits, staff data completeness, availability coverage,
 * labor requirements, and skill coverage gaps.
 *
 * @param input - Object with scheduleId
 * @returns ReadinessCheckResult with canProceed flag and categorized issues
 */
export async function checkGenerationReadiness(
  input: unknown
): Promise<ActionResponse<ReadinessCheckResult>> {
  // 1. Auth check
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  // 2. Validation
  const parsed = checkReadinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((e) => e.message).join(", "),
    };
  }

  // 3. Get location context (handles DB connection)
  const ctx = await getLocationContext(userId);

  try {
    const issues: ReadinessIssue[] = [];

    // Fetch all required data in parallel
    const [usageCheck, allStaff, availabilities, laborRequirements, config] =
      await Promise.all([
        AIUsageService.canGenerate(ctx.orgId, ctx.locationId),
        StaffService.list(ctx.orgId, ctx.locationId),
        StaffAvailabilityService.list(ctx.orgId, ctx.locationId),
        LaborRequirementService.list(ctx.orgId, ctx.locationId),
        KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
      ]);

    // --- Check: Kitchen config exists ---
    if (!config) {
      issues.push({
        severity: "blocker",
        category: "no_kitchen_config",
        message: "Kitchen configuration is missing. Please set up your kitchen first.",
      });

      return {
        success: true,
        data: {
          canProceed: false,
          issues,
          usageRemaining: usageCheck.remaining,
          usageLimit: 0,
          activeStaffCount: 0,
          availabilityCompleteness: 0,
          totalRequirements: 0,
        },
      };
    }

    // --- Check: AI usage limit (informational — deterministic generation works without AI) ---
    if (!usageCheck.allowed) {
      issues.push({
        severity: "warning",
        category: "usage_limit",
        message: "Monthly AI optimization limit reached. You can still generate a base schedule. Resets next month.",
      });
    }

    // --- Check: Active staff ---
    const activeStaff = allStaff.filter((s) => s.isActive);
    if (activeStaff.length === 0) {
      issues.push({
        severity: "blocker",
        category: "no_active_staff",
        message: "No active staff members found. Add staff before generating.",
      });
    }

    // --- Check: Staff missing hourly rate ---
    const missingHourlyRate = activeStaff.filter(
      (s) => !s.hourlyRate || s.hourlyRate <= 0
    );
    if (missingHourlyRate.length > 0) {
      const names = missingHourlyRate.map((s) => s.name);
      issues.push({
        severity: "warning",
        category: "missing_hourly_rate",
        message: `${missingHourlyRate.length} staff missing hourly rate`,
        count: missingHourlyRate.length,
        details: names,
      });
    }

    // --- Check: Availability completeness ---
    // Each active staff member should ideally have 7 availability entries (one per day)
    const staffIdsWithAvailability = new Set(
      availabilities.map((a) => a.staffId)
    );
    const staffWithAvailability = activeStaff.filter((s) =>
      staffIdsWithAvailability.has(s.id)
    );
    const availabilityCompleteness =
      activeStaff.length > 0
        ? Math.round((staffWithAvailability.length / activeStaff.length) * 100)
        : 0;

    if (availabilityCompleteness < 50) {
      const staffWithoutAvailability = activeStaff.filter(
        (s) => !staffIdsWithAvailability.has(s.id)
      );
      issues.push({
        severity: "warning",
        category: "low_availability",
        message: `Only ${availabilityCompleteness}% of staff have availability set (${staffWithoutAvailability.length} missing)`,
        count: availabilityCompleteness,
        details: staffWithoutAvailability.map((s) => s.name),
      });
    }

    // --- Check: Labor requirements exist ---
    if (laborRequirements.length === 0) {
      issues.push({
        severity: "blocker",
        category: "missing_requirements",
        message:
          "No shift slots defined. Set up shift slots before generating.",
      });
    } else {
      // Check for requirements on days the kitchen is open
      const openDays = getOpenDays(config);
      const requirementDays = new Set(
        laborRequirements.map((r) => r.dayOfWeek)
      );
      const missingDays = openDays.filter((day) => !requirementDays.has(day));

      if (missingDays.length > 0) {
        const dayNames = missingDays.map((d) => getDayName(d));
        issues.push({
          severity: "warning",
          category: "missing_requirements",
          message: `No shift slots for open days: ${dayNames.join(", ")}`,
          count: missingDays.length,
        });
      }

      // Check for requirements outside operating hours
      const outsideHours = findRequirementsOutsideHours(
        laborRequirements,
        config
      );
      if (outsideHours > 0) {
        issues.push({
          severity: "warning",
          category: "requirements_outside_hours",
          message: `${outsideHours} shift slots fall outside operating hours`,
          count: outsideHours,
        });
      }

      // Check for skill coverage gaps
      const uncoveredStations = findUncoveredStations(
        laborRequirements,
        activeStaff
      );
      if (uncoveredStations.length > 0) {
        issues.push({
          severity: "warning",
          category: "no_qualified_candidates",
          message: `${uncoveredStations.length} station(s) have no qualified staff`,
          count: uncoveredStations.length,
          details: uncoveredStations,
        });
      }
    }

    // Determine if we can proceed (no blockers)
    const canProceed = !issues.some((i) => i.severity === "blocker");

    // Get usage summary for limit display
    const usageSummary = await AIUsageService.getMonthlyUsage(
      ctx.orgId,
      ctx.locationId
    );

    return {
      success: true,
      data: {
        canProceed,
        issues,
        usageRemaining: usageSummary.remaining,
        usageLimit: usageSummary.limit,
        activeStaffCount: activeStaff.length,
        availabilityCompleteness,
        totalRequirements: laborRequirements.length,
      },
    };
  } catch (error) {
    console.error("checkGenerationReadiness error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to check readiness",
    };
  }
}

// ────────────────────────────────────────────────────────────
// generateBaseSchedule
// ────────────────────────────────────────────────────────────

/**
 * Generate a week's schedule using the CP solver.
 * No AI optimizer calls, no AI usage check, no token logging.
 * Returns a schedule for preview that can be accepted by the user.
 *
 * @param input - Object with scheduleId
 * @returns GeneratedSchedule with aiOptimized = false
 */
export async function generateBaseSchedule(
  input: unknown
): Promise<ActionResponse<GeneratedSchedule>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = generateScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((e) => e.message).join(", "),
    };
  }

  const ctx = await getLocationContext(userId);

  try {
    const schedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      parsed.data.scheduleId
    );
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    const context = await SchedulingAgentService.buildSchedulingContext(
      ctx.orgId,
      ctx.locationId,
      userId,
      schedule.weekStartDate
    );

    if (parsed.data.costOptimizationWeight !== undefined) {
      context.config.scheduleGenerationSettings.costOptimizationWeight =
        parsed.data.costOptimizationWeight;
    }

    const generatedSchedule =
      await SchedulingAgentService.generateBaseWeekSchedule(context);

    return { success: true, data: generatedSchedule };
  } catch (error) {
    console.error("generateBaseSchedule error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Schedule generation failed",
    };
  }
}

// ────────────────────────────────────────────────────────────
// acceptGeneratedSchedule
// ────────────────────────────────────────────────────────────

/**
 * Accept and persist generated shifts to the database.
 * Converts AI shift assignments (date string + time strings) into
 * full Date objects and creates Shift documents via ShiftService.
 *
 * @param input - Object with scheduleId and array of accepted shifts
 * @returns Count of created and failed shifts
 */
export async function acceptGeneratedSchedule(
  input: unknown
): Promise<
  ActionResponse<{
    created: number;
    failed: number;
    errors: Array<{ index: number; staffId: string; message: string }>;
  }>
> {
  // 1. Auth check
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  // 2. Validation
  const parsed = acceptGeneratedScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((e) => e.message).join(", "),
    };
  }

  // 3. Get location context (handles DB connection)
  const ctx = await getLocationContext(userId);

  try {
    const { scheduleId, shifts } = parsed.data;

    // Verify the schedule exists and belongs to this location
    const schedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      scheduleId
    );
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // Convert accepted shifts to CreateShiftInput format
    const createInputs = shifts.map((shift) => {
      const date = parseDateString(shift.date);
      const start = combineDateTime(date, shift.startTime);
      const end = combineDateTime(date, shift.endTime);

      return {
        orgId: ctx.orgId,
        locationId: ctx.locationId,
        scheduleId,
        staffId: shift.staffId,
        start,
        end,
        station: shift.station,
        notes: "",
      };
    });

    // Bulk create shifts (overlap-safe -- skips conflicts)
    const result = await ShiftService.bulkCreate(createInputs);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("acceptGeneratedSchedule error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save shifts",
    };
  }
}

// ────────────────────────────────────────────────────────────
// Helper functions (pure logic, no DB calls)
// ────────────────────────────────────────────────────────────

/**
 * Get the day-of-week numbers (0-6) that the kitchen is open.
 */
function getOpenDays(config: KitchenConfigDTO): number[] {
  const openDays: number[] = [];
  const hours = config.operatingHours;

  const dayEntries: Array<[keyof IWeeklyOperatingHours, number]> = [
    ["sunday", 0],
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
  ];

  for (const [key, dayIndex] of dayEntries) {
    if (hours[key].isOpen) {
      openDays.push(dayIndex);
    }
  }

  return openDays;
}

/**
 * Get human-readable day name from day-of-week number.
 */
function getDayName(dayOfWeek: number): string {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return names[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

/**
 * Count labor requirements that fall outside operating hours for their day.
 */
function findRequirementsOutsideHours(
  requirements: LaborRequirementDTO[],
  config: KitchenConfigDTO
): number {
  let count = 0;

  for (const req of requirements) {
    const dayKey = DAY_INDEX_TO_KEY[req.dayOfWeek];
    if (!dayKey) continue;

    const dayHours = config.operatingHours[dayKey];
    if (!dayHours.isOpen || !dayHours.open || !dayHours.close) {
      // Requirement on a closed day
      count++;
      continue;
    }

    // Check if requirement times fall outside operating hours
    if (req.startTime < dayHours.open || req.endTime > dayHours.close) {
      count++;
    }
  }

  return count;
}

/**
 * Find stations from labor requirements where no active staff have the required skill.
 */
function findUncoveredStations(
  requirements: LaborRequirementDTO[],
  activeStaff: Array<{ skills: Array<{ station: string; proficiency: number }> }>
): string[] {
  const requiredStations = new Set(requirements.map((r) => r.station));
  const uncovered: string[] = [];

  for (const station of requiredStations) {
    const hasQualifiedStaff = activeStaff.some((staff) =>
      staff.skills.some((skill) => skill.station === station)
    );
    if (!hasQualifiedStaff) {
      uncovered.push(station);
    }
  }

  return uncovered;
}
