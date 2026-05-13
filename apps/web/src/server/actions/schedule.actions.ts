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
  type EffectiveScheduleStatus,
  ManagerCoverageGap,
  assertWeekStartAligned,
} from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { ScheduleDTO } from "@/types/schedule";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Get the effective status for all visible shifts in a location week.
 */
export async function getEffectiveStatusForWeek(
  input: unknown,
): Promise<ActionResponse<EffectiveScheduleStatus>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parseResult = scheduleWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { weekStartDate } = parseResult.data;

    const ctx = await getLocationContext(userId);
    await assertWeekStartAligned(ctx.orgId, ctx.locationId, weekStartDate);

    const weekEnd = new Date(weekStartDate.getTime() + WEEK_MS);
    const status = await ScheduleService.getEffectiveStatusForWeek(
      ctx.orgId,
      ctx.locationId,
      weekStartDate,
      weekEnd,
    );

    return { success: true, data: status };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get effective schedule status";
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

    // 4. Read the existing status so we know whether this is a real
    // PUBLISHED→DRAFT transition (worth notifying about) or just a
    // no-op write.
    const previous = await ScheduleService.getById(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
    );

    const schedule = await ScheduleService.updateStatus(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
      status,
    );

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    if (
      previous &&
      previous.status === "PUBLISHED" &&
      schedule.status === "DRAFT"
    ) {
      void NotificationEvents.scheduleUnpublished({
        schedule,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
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
 * Copy shifts from one week to another, sourced by **date range** so the
 * copy survives a per-location `weekStartsOn` flip. The previous Wed-Tue
 * window may contain shifts that still live on a legacy Mon-anchored
 * Schedule doc; the service-layer date-range lookup picks those up
 * regardless of which Schedule owns them.
 *
 * Overlap detection (per-staff) skips shifts that would conflict with
 * existing target-week shifts; semantics unchanged.
 *
 * @param input - Object containing sourceWeekStart and targetWeekStart
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

    // 2. Zod validation — both fields are midnight-aligned Dates.
    const parseResult = copyWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { sourceWeekStart, targetWeekStart } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Reject a same-week copy outright.
    const sourceWeekNormalized = new Date(sourceWeekStart);
    sourceWeekNormalized.setHours(0, 0, 0, 0);
    const targetWeekNormalized = new Date(targetWeekStart);
    targetWeekNormalized.setHours(0, 0, 0, 0);
    if (sourceWeekNormalized.getTime() === targetWeekNormalized.getTime()) {
      return { success: false, error: "Cannot copy to the same week" };
    }

    // 5. Ensure the target Schedule exists. This is the only place that
    //    actually creates a Schedule doc — the read paths use the no-op
    //    `getByWeek` so visiting weeks alone never pollutes the
    //    collection. The alignment check inside `getOrCreateForWeek`
    //    will reject a misaligned `targetWeekStart` with a readable
    //    error, no extra guard needed here.
    const targetSchedule = await ScheduleService.getOrCreateForWeek(
      ctx.orgId,
      ctx.locationId,
      targetWeekNormalized,
    );

    // 6. Delegate the date-range copy to the service.
    const result = await ShiftService.copyShiftsAcrossWeeks(
      ctx.orgId,
      ctx.locationId,
      sourceWeekNormalized,
      targetSchedule.id,
      targetWeekNormalized,
    );

    // 7. Return response
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

    const weekStart = new Date(schedule.weekStartDate);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

    // 5. Verify at least one shift exists in the visible week window
    const shifts = await ShiftService.getByLocationAndDateRange(
      ctx.orgId,
      ctx.locationId,
      weekStart,
      weekEnd,
    );
    if (shifts.length === 0) {
      return {
        success: false,
        error:
          "Cannot publish an empty schedule. Add at least one shift first.",
      };
    }

    // 6. Reassign visible week shifts to the schedule being published.
    await ShiftService.reassignShiftsForLocationWeek(
      ctx.orgId,
      ctx.locationId,
      weekStart,
      weekEnd,
      schedule.id,
    );

    // 7. Sweep now-empty legacy schedules near this window.
    const sweepStart = new Date(weekStart.getTime() - WEEK_MS);
    const sweepEnd = new Date(weekEnd.getTime() + WEEK_MS);
    const nearbySchedules = await ScheduleService.listByWeekStartRange(
      ctx.orgId,
      ctx.locationId,
      sweepStart,
      sweepEnd,
    );

    for (const nearby of nearbySchedules) {
      if (nearby.id === schedule.id) continue;
      await ScheduleService.deleteIfEmpty(ctx.orgId, ctx.locationId, nearby.id);
    }

    // 8. Re-read shifts after consolidation and check manager coverage gaps.
    const consolidatedShifts = await ShiftService.getByLocationAndDateRange(
      ctx.orgId,
      ctx.locationId,
      weekStart,
      weekEnd,
    );

    let managerWarnings: ManagerCoverageGap[] = [];
    const [staff, config] = await Promise.all([
      StaffService.list(ctx.orgId, ctx.locationId),
      KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
    ]);

    if (config) {
      managerWarnings = ScheduleService.validateManagerCoverage(
        weekStart,
        consolidatedShifts,
        staff,
        config,
      );
    }

    // 9. Update status to PUBLISHED
    const updatedSchedule = await ScheduleService.updateStatus(
      ctx.orgId,
      ctx.locationId,
      scheduleId,
      "PUBLISHED",
    );
    if (!updatedSchedule) {
      return { success: false, error: "Failed to update schedule status" };
    }

    // 10. Fire-and-forget notifications. The dispatcher never throws,
    // so wrap each emission in `void` and let the action return.
    void NotificationEvents.schedulePublished({
      schedule: updatedSchedule,
      orgId: ctx.orgId,
      locationId: ctx.locationId,
    });
    if (managerWarnings.length > 0) {
      const summary = managerWarnings
        .map(
          (w) =>
            `${w.day}: ${w.gaps
              .map((g) => `${g.start}–${g.end}`)
              .join(", ")}`,
        )
        .join("; ");
      void NotificationEvents.managerCoverageGap({
        schedule: updatedSchedule,
        summary,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
    }

    // 11. Return response with warnings
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
    const weekStart = new Date(schedule.weekStartDate);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS);
    const [shifts, staff, config] = await Promise.all([
      ShiftService.getByLocationAndDateRange(
        ctx.orgId,
        ctx.locationId,
        weekStart,
        weekEnd,
      ),
      StaffService.list(ctx.orgId, ctx.locationId),
      KitchenConfigService.getByLocation(ctx.orgId, ctx.locationId),
    ]);

    // 5. Check for manager coverage gaps
    let warnings: ManagerCoverageGap[] = [];
    if (config) {
      warnings = ScheduleService.validateManagerCoverage(
        weekStart,
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

/**
 * Clear every shift visible in a location week window, regardless of
 * which Schedule document owns those shifts.
 *
 * @param input - Object containing `weekStartDate`
 * @returns ActionResponse with count of deleted shifts
 */
export async function clearWeekShiftsForLocationWeek(
  input: unknown,
): Promise<ActionResponse<{ shiftsDeleted: number }>> {
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

    // 4. Enforce location-configured week anchor
    await assertWeekStartAligned(ctx.orgId, ctx.locationId, weekStartDate);

    // 5. Delete all shifts in the half-open week window
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const weekEnd = new Date(weekStartDate.getTime() + WEEK_MS);
    const shiftsDeleted = await ShiftService.deleteByLocationAndDateRange(
      ctx.orgId,
      ctx.locationId,
      weekStartDate,
      weekEnd,
    );

    // 6. Return response
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
