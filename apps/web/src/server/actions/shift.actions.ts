"use server";

import { auth } from "@clerk/nextjs/server";
import {
  createShiftSchema,
  updateShiftSchema,
  listShiftsByScheduleSchema,
  deleteShiftSchema,
} from "@/lib/validations/shift.schema";
import { ShiftService } from "@/server/services/shift.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { ShiftDTO } from "@/types/shift";

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

    // 4. Service call
    const deleted = await ShiftService.delete(
      ctx.orgId,
      ctx.locationId,
      shiftId
    );

    if (!deleted) {
      return { success: false, error: "Shift not found" };
    }

    // 5. Return response
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete shift";
    return { success: false, error: message };
  }
}

/**
 * List all shifts for a schedule.
 * @param input - Object containing scheduleId
 * @returns ActionResponse containing array of ShiftDTOs
 */
export async function listShiftsBySchedule(
  input: unknown
): Promise<ActionResponse<ShiftDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = listShiftsByScheduleSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const { scheduleId } = parseResult.data;

    // 3. Get location context (handles DB connection - for auth check)
    await getLocationContext(userId);

    // 4. Service call
    const shifts = await ShiftService.getBySchedule(scheduleId);

    // 5. Return response
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
