"use server";

import { auth } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import {
  scheduleWeekSchema,
  scheduleStatusUpdateSchema,
  scheduleNotesUpdateSchema,
} from "@/lib/validations/schedule.schema";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import type { ActionResponse } from "@/lib/safe-action";
import type { ScheduleDTO } from "@/types/schedule";

/**
 * Get or create a schedule for a specific week.
 * @param input - Object containing weekStartDate
 * @returns ActionResponse containing ScheduleDTO
 */
export async function getOrCreateScheduleForWeek(
  input: unknown
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

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const schedule = await ScheduleService.getOrCreateForWeek(userId, weekStartDate);

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get or create schedule";
    return { success: false, error: message };
  }
}

/**
 * Get a schedule by week start date.
 * @param input - Object containing weekStartDate
 * @returns ActionResponse containing ScheduleDTO or null
 */
export async function getScheduleByWeek(
  input: unknown
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

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const schedule = await ScheduleService.getByWeek(userId, weekStartDate);

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
  input: unknown
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

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const schedule = await ScheduleService.updateStatus(userId, scheduleId, status);

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update schedule status";
    return { success: false, error: message };
  }
}

/**
 * Update schedule notes.
 * @param input - Object containing scheduleId and notes
 * @returns ActionResponse containing updated ScheduleDTO
 */
export async function updateScheduleNotes(
  input: unknown
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

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const schedule = await ScheduleService.updateNotes(userId, scheduleId, notes ?? "");

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // 5. Return response
    return { success: true, data: schedule };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update schedule notes";
    return { success: false, error: message };
  }
}

/**
 * Delete a schedule and all its shifts.
 * @param scheduleId - Schedule document ID
 * @returns ActionResponse with deletion status
 */
export async function deleteSchedule(
  scheduleId: string
): Promise<ActionResponse<{ deleted: boolean; shiftsDeleted: number }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Delete shifts first
    const shiftsDeleted = await ShiftService.deleteBySchedule(scheduleId);

    // 4. Delete schedule
    const deleted = await ScheduleService.delete(userId, scheduleId);

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
