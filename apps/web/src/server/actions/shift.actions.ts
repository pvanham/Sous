"use server";

import { auth } from "@clerk/nextjs/server";
import {
  createShiftSchema,
  updateShiftSchema,
  deleteShiftSchema,
} from "@/lib/validations/shift.schema";
import { scheduleWeekSchema } from "@sous/types/validations/schedule.schema";
import { ShiftService } from "@/server/services/shift.service";
import {
  ScheduleService,
  assertWeekStartAligned,
} from "@/server/services/schedule.service";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { ShiftDTO } from "@/types/shift";

/**
 * Best-effort: emit a `shiftAssignmentChanged` push/email if (a) the
 * shift's parent schedule is currently published and (b) the staff
 * member is linked to a Clerk user. Falls back silently in every
 * other case so we never spam staff with unverified changes (e.g.
 * draft schedule edits the manager is still tweaking).
 */
async function emitShiftAssignmentChanged(
  orgId: string,
  locationId: string,
  shift: ShiftDTO,
  reason: "assigned" | "updated" | "unassigned",
): Promise<void> {
  try {
    const schedule = await ScheduleService.getById(
      orgId,
      locationId,
      shift.scheduleId,
    );
    if (!schedule || schedule.status !== "PUBLISHED") return;
    const staff = await StaffService.getById(orgId, locationId, shift.staffId);
    if (!staff?.clerkUserId) return;
    void NotificationEvents.shiftAssignmentChanged({
      shift,
      affectedClerkUserIds: [staff.clerkUserId],
      orgId,
      locationId,
      reason,
    });
  } catch (err) {
    console.error("[shift.actions] failed to emit shift change notification", {
      shiftId: shift.id,
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Create a new shift.
 * Validates station against KitchenConfig before creating.
 * @param input - Shift creation data
 * @returns ActionResponse containing created ShiftDTO
 */
export async function createShift(
  input: unknown
): Promise<ActionResponse<ShiftDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = createShiftSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const shiftData = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Validate station against KitchenConfig
    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId
    );
    if (!config) {
      return {
        success: false,
        error:
          "Kitchen configuration not found. Please configure your kitchen first.",
      };
    }

    if (!config.stations.includes(shiftData.station)) {
      return {
        success: false,
        error: `Invalid station: ${shiftData.station}. Valid stations are: ${config.stations.join(", ")}`,
      };
    }

    // 5. Service call
    const shift = await ShiftService.create({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      scheduleId: shiftData.scheduleId,
      staffId: shiftData.staffId,
      start: shiftData.start,
      end: shiftData.end,
      station: shiftData.station,
      notes: shiftData.notes,
    });

    void emitShiftAssignmentChanged(
      ctx.orgId,
      ctx.locationId,
      shift,
      "assigned",
    );

    // 6. Return response
    return { success: true, data: shift };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create shift";
    return { success: false, error: message };
  }
}

/**
 * Update an existing shift.
 * Validates station against KitchenConfig if provided.
 * @param shiftId - Shift document ID
 * @param input - Partial shift data to update
 * @returns ActionResponse containing updated ShiftDTO
 */
export async function updateShift(
  shiftId: string,
  input: unknown
): Promise<ActionResponse<ShiftDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = updateShiftSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const updateData = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Validate station if provided
    if (updateData.station) {
      const config = await KitchenConfigService.getByLocation(
        ctx.orgId,
        ctx.locationId
      );
      if (!config) {
        return {
          success: false,
          error:
            "Kitchen configuration not found. Please configure your kitchen first.",
        };
      }

      if (!config.stations.includes(updateData.station)) {
        return {
          success: false,
          error: `Invalid station: ${updateData.station}. Valid stations are: ${config.stations.join(", ")}`,
        };
      }
    }

    // 5. Service call
    const shift = await ShiftService.update(
      ctx.orgId,
      ctx.locationId,
      shiftId,
      updateData
    );

    if (!shift) {
      return { success: false, error: "Shift not found" };
    }

    void emitShiftAssignmentChanged(
      ctx.orgId,
      ctx.locationId,
      shift,
      "updated",
    );

    // 6. Return response
    return { success: true, data: shift };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update shift";
    return { success: false, error: message };
  }
}

/**
 * Delete a shift.
 * @param input - Object containing shiftId
 * @returns ActionResponse with deletion status
 */
export async function deleteShift(
  input: unknown
): Promise<ActionResponse<{ deleted: boolean }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = deleteShiftSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { shiftId } = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Look up the shift before deleting so we can notify the affected
    //    staff member with the correct station + window after deletion.
    const beforeDelete = await ShiftService.getById(
      ctx.orgId,
      ctx.locationId,
      shiftId,
    );

    // 5. Service call
    const deleted = await ShiftService.delete(
      ctx.orgId,
      ctx.locationId,
      shiftId
    );

    if (!deleted) {
      return { success: false, error: "Shift not found" };
    }

    if (beforeDelete) {
      void emitShiftAssignmentChanged(
        ctx.orgId,
        ctx.locationId,
        beforeDelete,
        "unassigned",
      );
    }

    // 6. Return response
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete shift";
    return { success: false, error: message };
  }
}

/**
 * List every shift at the caller's location whose `start` falls in the
 * half-open `[weekStartDate, weekStartDate + 7d)` window, regardless of
 * which Schedule document owns it.
 *
 * Backs the schedule grid and dashboard widget. After an owner changes
 * `weekStartsOn`, the displayed week may include shifts that still live
 * on a legacy Schedule doc with a different anchor; this action surfaces
 * all of them so the manager never sees a falsely-empty week.
 *
 * `weekStartDate` is validated against the location's configured
 * `weekStartsOn` so a stale URL with a misaligned date returns a
 * readable error rather than slicing a non-canonical window.
 *
 * @param input - Object containing `weekStartDate: Date`
 * @returns ActionResponse containing array of ShiftDTOs sorted by `start`
 */
export async function listShiftsForLocationWeek(
  input: unknown,
): Promise<ActionResponse<ShiftDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation (midnight-aligned date, same as scheduleWeekSchema)
    const parseResult = scheduleWeekSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { weekStartDate } = parseResult.data;

    // 3. Get location context (handles DB connection + tenancy)
    const ctx = await getLocationContext(userId);

    // 4. Enforce the location's configured anchor in the location's
    //    timezone — single source of truth shared with the schedule
    //    service write path.
    await assertWeekStartAligned(ctx.orgId, ctx.locationId, weekStartDate);

    // 5. Service call — half-open `[weekStart, weekStart + 7d)`.
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const weekEnd = new Date(weekStartDate.getTime() + WEEK_MS);
    const shifts = await ShiftService.getByLocationAndDateRange(
      ctx.orgId,
      ctx.locationId,
      weekStartDate,
      weekEnd,
    );

    // 6. Return response
    return { success: true, data: shifts };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list shifts";
    return { success: false, error: message };
  }
}

/**
 * Get a single shift by ID.
 * @param shiftId - Shift document ID
 * @returns ActionResponse containing ShiftDTO or null
 */
export async function getShift(
  shiftId: string
): Promise<ActionResponse<ShiftDTO | null>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const shift = await ShiftService.getById(
      ctx.orgId,
      ctx.locationId,
      shiftId
    );

    // 4. Return response
    return { success: true, data: shift };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get shift";
    return { success: false, error: message };
  }
}
