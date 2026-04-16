"use server";

import { auth } from "@clerk/nextjs/server";
import {
  staffAvailabilitySchema,
  bulkAvailabilitySchema,
  availabilityByDaySchema,
  availabilityByStaffSchema,
  availableStaffQuerySchema,
} from "@/lib/validations/staff-availability.schema";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { StaffAvailabilityDTO } from "@/types/staff-availability";

/**
 * List all availability entries for the current location.
 */
export async function listStaffAvailability(): Promise<
  ActionResponse<StaffAvailabilityDTO[]>
> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await StaffAvailabilityService.list(
      ctx.orgId,
      ctx.locationId
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("listStaffAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to list availability",
    };
  }
}

/**
 * Get all availability entries for a specific staff member.
 * @param input - Object with staffId
 */
export async function getStaffAvailability(
  input: unknown
): Promise<ActionResponse<StaffAvailabilityDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = availabilityByStaffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await StaffAvailabilityService.getByStaffId(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getStaffAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get availability",
    };
  }
}

/**
 * Get availability for a specific day of the week.
 * @param input - Object with dayOfWeek (0-6)
 */
export async function getAvailabilityByDay(
  input: unknown
): Promise<ActionResponse<StaffAvailabilityDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = availabilityByDaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await StaffAvailabilityService.getByDayOfWeek(
      ctx.orgId,
      ctx.locationId,
      parsed.data.dayOfWeek
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getAvailabilityByDay error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get availability",
    };
  }
}

/**
 * Find staff available for a specific time slot.
 * Used by AI scheduling (CandidateService) in Sprint 3.5.
 * @param input - Object with dayOfWeek, startTime, endTime
 */
export async function getAvailableStaffForSlot(
  input: unknown
): Promise<ActionResponse<StaffAvailabilityDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = availableStaffQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await StaffAvailabilityService.getAvailableStaff(
      ctx.orgId,
      ctx.locationId,
      parsed.data.dayOfWeek,
      parsed.data.startTime,
      parsed.data.endTime
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getAvailableStaffForSlot error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get available staff",
    };
  }
}

/**
 * Create or update a single availability entry.
 * Upserts by staffId + dayOfWeek.
 * @param input - StaffAvailabilityInput
 */
export async function upsertStaffAvailability(
  input: unknown
): Promise<ActionResponse<StaffAvailabilityDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = staffAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const { availability } = await StaffAvailabilityService.upsert(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );
    return { success: true, data: availability };
  } catch (error) {
    console.error("upsertStaffAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save availability",
    };
  }
}

/**
 * Bulk update weekly availability for a staff member.
 * Upserts multiple days at once.
 * @param input - BulkAvailabilityInput with staffId and availabilities array
 */
export async function bulkUpdateAvailability(
  input: unknown
): Promise<ActionResponse<StaffAvailabilityDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = bulkAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await StaffAvailabilityService.bulkUpsert(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId,
      parsed.data.availabilities
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("bulkUpdateAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update availability",
    };
  }
}

/**
 * Delete an availability entry by ID.
 * @param id - Availability document ID
 */
export async function deleteStaffAvailability(
  id: string
): Promise<ActionResponse<boolean>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  if (!id || typeof id !== "string") {
    return { success: false, error: "Invalid ID" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const deleted = await StaffAvailabilityService.delete(
      ctx.orgId,
      ctx.locationId,
      id
    );
    if (!deleted) {
      return { success: false, error: "Availability entry not found" };
    }
    return { success: true, data: true };
  } catch (error) {
    console.error("deleteStaffAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete availability",
    };
  }
}

/**
 * Delete all availability entries for a staff member.
 * @param staffId - Staff document ID
 */
export async function deleteAllStaffAvailability(
  staffId: string
): Promise<ActionResponse<number>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  if (!staffId || typeof staffId !== "string") {
    return { success: false, error: "Invalid staff ID" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const count = await StaffAvailabilityService.deleteByStaffId(
      ctx.orgId,
      ctx.locationId,
      staffId
    );
    return { success: true, data: count };
  } catch (error) {
    console.error("deleteAllStaffAvailability error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete availability",
    };
  }
}

/**
 * Get availability count for a staff member.
 * @param staffId - Staff document ID
 */
export async function getAvailabilityCount(
  staffId: string
): Promise<ActionResponse<number>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  if (!staffId || typeof staffId !== "string") {
    return { success: false, error: "Invalid staff ID" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const count = await StaffAvailabilityService.countByStaffId(
      ctx.orgId,
      ctx.locationId,
      staffId
    );
    return { success: true, data: count };
  } catch (error) {
    console.error("getAvailabilityCount error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to count availability",
    };
  }
}
