"use server";

import { auth } from "@clerk/nextjs/server";
import { addDays, startOfDay } from "date-fns";
import {
  createTimeOffRequestSchema,
  updateTimeOffStatusSchema,
  timeOffByStaffSchema,
  timeOffByDateRangeSchema,
  approvedTimeOffQuerySchema,
} from "@/lib/validations/time-off-request.schema";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { TimeOffRequestDTO } from "@/types/time-off-request";

/**
 * List all time-off requests for the current location.
 */
export async function listTimeOffRequests(): Promise<
  ActionResponse<TimeOffRequestDTO[]>
> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await TimeOffRequestService.list(
      ctx.orgId,
      ctx.locationId
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("listTimeOffRequests error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list time-off requests",
    };
  }
}

/**
 * Create a new time-off request for a staff member.
 * @param input - Object with staffId, startDate, endDate, optional reason
 */
export async function createTimeOffRequest(
  input: unknown
): Promise<ActionResponse<TimeOffRequestDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = createTimeOffRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);

    // Dynamic validation: check minTimeOffAdvanceDays from KitchenConfig
    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId
    );
    const minAdvanceDays = config?.minTimeOffAdvanceDays ?? 7;
    const minAllowedDate = startOfDay(addDays(new Date(), minAdvanceDays));

    if (parsed.data.startDate < minAllowedDate) {
      return {
        success: false,
        error: `Time-off requests must be submitted at least ${minAdvanceDays} days in advance`,
      };
    }

    const result = await TimeOffRequestService.create(
      ctx.orgId,
      ctx.locationId,
      parsed.data
    );

    const staff = await StaffService.getById(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId,
    );
    void NotificationEvents.timeOffSubmitted({
      request: result,
      staffName: staff?.name ?? "A staff member",
      orgId: ctx.orgId,
      locationId: ctx.locationId,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("createTimeOffRequest error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create time-off request",
    };
  }
}

/**
 * Get all time-off requests for a specific staff member.
 * @param input - Object with staffId
 */
export async function getTimeOffRequestsByStaff(
  input: unknown
): Promise<ActionResponse<TimeOffRequestDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = timeOffByStaffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await TimeOffRequestService.getByStaffId(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getTimeOffRequestsByStaff error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get time-off requests",
    };
  }
}

/**
 * Get all time-off requests overlapping a date range (any status).
 * @param input - Object with startDate and endDate
 */
export async function getTimeOffRequestsByDateRange(
  input: unknown
): Promise<ActionResponse<TimeOffRequestDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = timeOffByDateRangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await TimeOffRequestService.getByDateRange(
      ctx.orgId,
      ctx.locationId,
      parsed.data.startDate,
      parsed.data.endDate
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getTimeOffRequestsByDateRange error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get time-off requests",
    };
  }
}

/**
 * Approve or deny a time-off request.
 * Passes the current user's Clerk userId as reviewedBy.
 * @param input - Object with requestId, status ('approved' | 'denied'), optional notes
 */
export async function updateTimeOffRequestStatus(
  input: unknown
): Promise<ActionResponse<TimeOffRequestDTO>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = updateTimeOffStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await TimeOffRequestService.updateStatus(
      ctx.orgId,
      ctx.locationId,
      parsed.data.requestId,
      parsed.data.status,
      userId, // Clerk userId as reviewedBy for audit trail
      parsed.data.notes
    );

    if (!result) {
      return { success: false, error: "Time-off request not found" };
    }

    const requester = await StaffService.getById(
      ctx.orgId,
      ctx.locationId,
      result.staffId,
    );
    if (requester?.clerkUserId) {
      void NotificationEvents.timeOffDecision({
        request: result,
        requesterClerkUserId: requester.clerkUserId,
        orgId: ctx.orgId,
        locationId: ctx.locationId,
      });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("updateTimeOffRequestStatus error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update time-off request status",
    };
  }
}

/**
 * Get approved time-off requests for a staff member in a date range.
 * Used by CandidateService (Sprint 3.5) to exclude staff from shift assignments.
 * @param input - Object with staffId, startDate, endDate
 */
export async function getApprovedTimeOffForStaff(
  input: unknown
): Promise<ActionResponse<TimeOffRequestDTO[]>> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = approvedTimeOffQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const ctx = await getLocationContext(userId);
    const result = await TimeOffRequestService.getApprovedTimeOff(
      ctx.orgId,
      ctx.locationId,
      parsed.data.staffId,
      parsed.data.startDate,
      parsed.data.endDate
    );
    return { success: true, data: result };
  } catch (error) {
    console.error("getApprovedTimeOffForStaff error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get approved time-off",
    };
  }
}

/**
 * Delete a pending time-off request.
 * Only pending requests can be deleted to preserve audit trails.
 * @param id - TimeOffRequest document ID
 */
export async function deleteTimeOffRequest(
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
    const deleted = await TimeOffRequestService.delete(
      ctx.orgId,
      ctx.locationId,
      id
    );
    if (!deleted) {
      return {
        success: false,
        error:
          "Time-off request not found or cannot be deleted (only pending requests can be deleted)",
      };
    }
    return { success: true, data: true };
  } catch (error) {
    console.error("deleteTimeOffRequest error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete time-off request",
    };
  }
}
