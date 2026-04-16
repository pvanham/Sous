"use server";

import { auth } from "@clerk/nextjs/server";
import {
  scheduleWeekSchema,
  scheduleStatusUpdateSchema,
  scheduleNotesUpdateSchema,
  copyWeekSchema,
} from "@/lib/validations/schedule.schema";
import {
  ScheduleService,
  ManagerCoverageGap,
} from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { ScheduleDTO } from "@/types/schedule";

/**
 * Publish result with optional manager coverage warnings.
 */
export interface PublishScheduleResult {
  schedule: ScheduleDTO;
  managerWarnings: ManagerCoverageGap[];
}

/**
 * Get or create a schedule for a specific week.
 * @param input - Object containing weekStartDate
 * @returns ActionResponse containing ScheduleDTO
 */
export async function getOrCreateScheduleForWeek(
  input: unknown,
): Promise<ActionResponse<ScheduleDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = scheduleWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { weekStartDate } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const schedule = await ScheduleService.getOrCreateForWeek(
      ctx.orgId,
      ctx.locationId,
      weekStartDate,
    );

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get or create schedule";
    return { success: false, error: message };
  }
}

/**
 * Get a schedule by week start date.
 * @param input - Object containing weekStartDate
 * @returns ActionResponse containing ScheduleDTO or null
 */
export async function getScheduleByWeek(
  input: unknown,
): Promise<ActionResponse<ScheduleDTO | null>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = scheduleWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { weekStartDate } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const schedule = await ScheduleService.getByWeek(
      ctx.orgId,
      ctx.locationId,
      weekStartDate,
    );

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get schedule";
    return { success: false, error: message };
  }
}

/**
 * Update schedule status (DRAFT → PUBLISHED or vice versa).
 * @param input - Object containing scheduleId and status
 * @returns ActionResponse containing updated ScheduleDTO
 */
export async function updateScheduleStatus(
  input: unknown,
): Promise<ActionResponse<ScheduleDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = scheduleStatusUpdateSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { scheduleId, status } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const schedule = await ScheduleService.updateStatus(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
      status,
    );

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update schedule status";
    return { success: false, error: message };
  }
}

/**
 * Update schedule notes.
 * @param input - Object containing scheduleId and notes
 * @returns ActionResponse containing updated ScheduleDTO
 */
export async function updateScheduleNotes(
  input: unknown,
): Promise<ActionResponse<ScheduleDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = scheduleNotesUpdateSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { scheduleId, notes } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const schedule = await ScheduleService.updateNotes(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
      notes ?? "",
    );

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update schedule notes";
    return { success: false, error: message };
  }
}

/**
 * Delete a schedule and all its shifts.
 * @param scheduleId - Schedule document ID
 * @returns ActionResponse with deletion status
 */
export async function deleteSchedule(
  scheduleId: string,
): Promise<ActionResponse<{ deleted: boolean; shiftsDeleted: number }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Delete shifts first
    const shiftsDeleted = await ShiftService.deleteBySchedule(scheduleId);

    // 4. Delete schedule
    const deleted = await ScheduleService.delete(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
    );

    if (!deleted) {
      return { success: false, error: "Schedule not found" };
    }

    // 5. Return response
    return { success: true, data: { deleted: true, shiftsDeleted } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete schedule";
    return { success: false, error: message };
  }
}

/**
 * Copy shifts from one week to another.
 * Handles overlap detection - skips shifts that would conflict with existing ones.
 * @param input - Object containing sourceScheduleId and targetWeekStart
 * @returns ActionResponse with count of created and skipped shifts
 */
export async function copyWeekShifts(
  input: unknown,
): Promise<ActionResponse<{ shiftsCreated: number; shiftsSkipped: number }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = copyWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { sourceScheduleId, targetWeekStart } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Get source schedule to validate ownership and get source week start
    const sourceSchedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      sourceScheduleId,
    );
    if (!sourceSchedule) {
      return { success: false, error: "Source schedule not found" };
    }

    // 5. Check if target week is the same as source week
    const sourceWeekStart = new Date(sourceSchedule.weekStartDate);
    sourceWeekStart.setHours(0, 0, 0, 0);
    const targetWeekNormalized = new Date(targetWeekStart);
    targetWeekNormalized.setHours(0, 0, 0, 0);

    if (sourceWeekStart.getTime() === targetWeekNormalized.getTime()) {
      return { success: false, error: "Cannot copy to the same week" };
    }

    // 6. Calculate day offset between weeks
    const dayOffset = Math.round(
      (targetWeekNormalized.getTime() - sourceWeekStart.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    // 7. Get or create target schedule
    const targetSchedule = await ScheduleService.getOrCreateForWeek(
      ctx.orgId,
      ctx.locationId,
      targetWeekStart,
    );

    // 8. Copy shifts using service
    const result = await ShiftService.copyShiftsToNewWeek(
      ctx.orgId,
      ctx.locationId,
      sourceScheduleId,
      targetSchedule.id,
      dayOffset,
    );

    // 9. Return response
    return {
      success: true,
      data: {
        shiftsCreated: result.created,
        shiftsSkipped: result.skipped,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to copy week shifts";
    return { success: false, error: message };
  }
}

/**
 * Publish a schedule (change status to PUBLISHED).
 * Validates that at least one shift exists before publishing.
 * Also checks for manager coverage gaps and returns warnings.
 * @param scheduleId - Schedule document ID
 * @returns ActionResponse containing updated ScheduleDTO and any manager coverage warnings
 */
export async function publishSchedule(
  scheduleId: string,
): Promise<ActionResponse<PublishScheduleResult>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Get schedule to verify ownership
    const schedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
    );
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 4. Check if schedule already published
    if (schedule.status === "PUBLISHED") {
      return { success: false, error: "Schedule is already published" };
    }

    // 5. Verify at least one shift exists
    const shifts = await ShiftService.getBySchedule(scheduleId);
    if (shifts.length === 0) {
      return {
        success: false,
        error:
          "Cannot publish an empty schedule. Add at least one shift first.",
      };
    }

    // 6. Check for manager coverage gaps
    let managerWarnings: ManagerCoverageGap[] = [];
    const [staff, config] = await Promise.all([
      StaffService.list(ctx.orgId, ctx.locationId),
      KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
    ]);

    if (config) {
      managerWarnings = ScheduleService.validateManagerCoverage(
        new Date(schedule.weekStartDate),
        shifts,
        staff,
        config,
      );
    }

    // 7. Update status to PUBLISHED
    const updatedSchedule = await ScheduleService.updateStatus(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
      "PUBLISHED",
    );
    if (!updatedSchedule) {
      return { success: false, error: "Failed to update schedule status" };
    }

    // 8. Return response with warnings
    return {
      success: true,
      data: {
        schedule: updatedSchedule,
        managerWarnings,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish schedule";
    return { success: false, error: message };
  }
}

/**
 * Check for manager coverage gaps without publishing.
 * Use this to preview warnings before confirming publish.
 * @param scheduleId - Schedule document ID
 * @returns ActionResponse containing array of manager coverage gaps
 */
export async function checkManagerCoverage(
  scheduleId: string,
): Promise<ActionResponse<{ warnings: ManagerCoverageGap[] }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Get schedule to verify ownership
    const schedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
    );
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 4. Get shifts, staff, and config
    const [shifts, staff, config] = await Promise.all([
      ShiftService.getBySchedule(scheduleId),
      StaffService.list(ctx.orgId, ctx.locationId),
      KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
    ]);

    // 5. Check for manager coverage gaps
    let warnings: ManagerCoverageGap[] = [];
    if (config) {
      warnings = ScheduleService.validateManagerCoverage(
        new Date(schedule.weekStartDate),
        shifts,
        staff,
        config,
      );
    }

    return {
      success: true,
      data: { warnings },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to check manager coverage";
    return { success: false, error: message };
  }
}

/**
 * Clear all shifts from a schedule (delete all shifts for a week).
 * @param scheduleId - Schedule document ID
 * @returns ActionResponse with count of deleted shifts
 */
export async function clearWeekShifts(
  scheduleId: string,
): Promise<ActionResponse<{ shiftsDeleted: number }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Verify schedule ownership
    const schedule = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
    );
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 4. Delete all shifts for this schedule
    const shiftsDeleted = await ShiftService.deleteBySchedule(scheduleId);

    // 5. Return response
    return {
      success: true,
      data: { shiftsDeleted },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to clear week shifts";
    return { success: false, error: message };
  }
}
