"use server";

import { auth } from "@clerk/nextjs/server";
import {
  staffSchema,
  staffUpdateSchema,
  importStaffSchema,
  staffListParamsSchema,
} from "@/lib/validations/staff.schema";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { ShiftService } from "@/server/services/shift.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type {
  StaffDTO,
  ImportResult,
  ImportRowError,
  PaginatedStaffResult,
} from "@/types/staff";

/**
 * Get a single staff member by ID.
 * @param staffId - Staff document ID
 * @returns ActionResponse containing StaffDTO or null if not found
 */
export async function getStaffById(
  staffId: string
): Promise<ActionResponse<StaffDTO | null>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!staffId || typeof staffId !== "string") {
      return { success: false, error: "Invalid staff ID" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const staff = await StaffService.getById(ctx.orgId, ctx.locationId, staffId);

    // 4. Return response
    return { success: true, data: staff };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get staff member";
    return { success: false, error: message };
  }
}

/**
 * List all staff for the current user's location (includes both active and inactive).
 * @returns ActionResponse containing array of StaffDTO
 */
export async function listStaff(): Promise<ActionResponse<StaffDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const staff = await StaffService.list(ctx.orgId, ctx.locationId);

    // 4. Return response
    return { success: true, data: staff };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list staff";
    return { success: false, error: message };
  }
}

/**
 * List staff with pagination, sorting by last name, and search.
 * @param input - Pagination and filter parameters
 * @returns ActionResponse containing PaginatedStaffResult
 */
export async function listStaffPaginated(
  input: unknown
): Promise<ActionResponse<PaginatedStaffResult>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = staffListParamsSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const params = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const result = await StaffService.listPaginated(
      ctx.orgId,
      ctx.locationId,
      params
    );

    // 5. Return response
    return { success: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list staff";
    return { success: false, error: message };
  }
}

/**
 * Import staff from CSV data.
 * Validates roles/stations against KitchenConfig.
 * @param input - Array of staff data from CSV
 * @returns ActionResponse with import counts and errors
 */
export async function importStaffFromCSV(
  input: unknown
): Promise<ActionResponse<ImportResult>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = importStaffSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const staffData = parseResult.data;

    if (staffData.length === 0) {
      return { success: false, error: "No valid staff data to import" };
    }

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Fetch KitchenConfig to validate roles/stations
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

    const validRoles = new Set(config.roles);
    const validStations = new Set(config.stations);

    // 5. Validate each staff member against config with detailed error tracking
    const errors: ImportRowError[] = [];
    const validStaff = staffData.filter((staff, index) => {
      const invalidRoles = staff.roles.filter((r) => !validRoles.has(r));
      const invalidStations = staff.skills
        .map((s) => s.station)
        .filter((st) => !validStations.has(st));

      if (invalidRoles.length > 0) {
        errors.push({
          row: index + 1,
          email: staff.email,
          reason: `Invalid role(s): ${invalidRoles.join(", ")}. Valid roles are: ${config.roles.join(", ")}`,
        });
        return false;
      }

      if (invalidStations.length > 0) {
        errors.push({
          row: index + 1,
          email: staff.email,
          reason: `Invalid station(s): ${invalidStations.join(", ")}. Valid stations are: ${config.stations.join(", ")}`,
        });
        return false;
      }

      return true;
    });

    const skipped = errors.length;

    if (validStaff.length === 0) {
      // Return success: false but with detailed error info
      return {
        success: false,
        error: `No valid staff to import. ${skipped} row(s) had validation errors.`,
      };
    }

    // 6. Service call - bulk upsert
    const result = await StaffService.bulkUpsert(
      ctx.orgId,
      ctx.locationId,
      validStaff
    );

    // 7. Return response with detailed error information
    return {
      success: true,
      data: {
        ...result,
        skipped,
        errors,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import staff";
    return { success: false, error: message };
  }
}

/**
 * Create a new staff member.
 * @param input - Staff data
 * @returns ActionResponse containing created StaffDTO
 */
export async function createStaff(
  input: unknown
): Promise<ActionResponse<StaffDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = staffSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const staffData = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Validate roles/stations against KitchenConfig
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

    const validRoles = new Set(config.roles);
    const validStations = new Set(config.stations);

    const invalidRoles = staffData.roles.filter((r) => !validRoles.has(r));
    if (invalidRoles.length > 0) {
      return {
        success: false,
        error: `Invalid roles: ${invalidRoles.join(", ")}. Valid roles are: ${config.roles.join(", ")}`,
      };
    }

    const invalidStations = staffData.skills
      .map((s) => s.station)
      .filter((st) => !validStations.has(st));
    if (invalidStations.length > 0) {
      return {
        success: false,
        error: `Invalid stations: ${invalidStations.join(", ")}. Valid stations are: ${config.stations.join(", ")}`,
      };
    }

    // 5. Service call
    const staff = await StaffService.create(
      ctx.orgId,
      ctx.locationId,
      staffData
    );

    // 6. Return response
    return { success: true, data: staff };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create staff";
    // Check for duplicate email error
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return {
        success: false,
        error: "A staff member with this email already exists",
      };
    }
    return { success: false, error: message };
  }
}

/**
 * Update an existing staff member.
 * @param staffId - Staff document ID
 * @param input - Partial staff data to update
 * @returns ActionResponse containing updated StaffDTO
 */
export async function updateStaff(
  staffId: string,
  input: unknown
): Promise<ActionResponse<StaffDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = staffUpdateSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const updateData = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Validate roles/stations if provided
    if (updateData.roles || updateData.skills) {
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

      if (updateData.roles) {
        const validRoles = new Set(config.roles);
        const invalidRoles = updateData.roles.filter((r) => !validRoles.has(r));
        if (invalidRoles.length > 0) {
          return {
            success: false,
            error: `Invalid roles: ${invalidRoles.join(", ")}`,
          };
        }
      }

      if (updateData.skills) {
        const validStations = new Set(config.stations);
        const invalidStations = updateData.skills
          .map((s) => s.station)
          .filter((st) => !validStations.has(st));
        if (invalidStations.length > 0) {
          return {
            success: false,
            error: `Invalid stations: ${invalidStations.join(", ")}`,
          };
        }
      }
    }

    // 5. Service call
    const staff = await StaffService.update(
      ctx.orgId,
      ctx.locationId,
      staffId,
      updateData
    );

    if (!staff) {
      return { success: false, error: "Staff member not found" };
    }

    // 6. Return response
    return { success: true, data: staff };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update staff";
    return { success: false, error: message };
  }
}

/**
 * Set staff member active/inactive status.
 * @param staffId - Staff document ID
 * @param isActive - New active status
 * @returns ActionResponse containing updated StaffDTO
 */
export async function setStaffActive(
  staffId: string,
  isActive: boolean
): Promise<ActionResponse<StaffDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const staff = await StaffService.setActive(
      ctx.orgId,
      ctx.locationId,
      staffId,
      isActive
    );

    if (!staff) {
      return { success: false, error: "Staff member not found" };
    }

    // 4. Return response
    return { success: true, data: staff };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update staff status";
    return { success: false, error: message };
  }
}

/**
 * Permanently delete a staff member and all their associated shifts.
 * @param staffId - Staff document ID
 * @returns ActionResponse with deletion status and count of deleted shifts
 */
export async function deleteStaff(
  staffId: string
): Promise<ActionResponse<{ deleted: boolean; shiftsDeleted: number }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Delete all shifts for this staff member first (cascade delete)
    const shiftsDeleted = await ShiftService.deleteByStaffId(
      ctx.orgId,
      ctx.locationId,
      staffId
    );

    // 4. Delete the staff member
    const deleted = await StaffService.delete(
      ctx.orgId,
      ctx.locationId,
      staffId
    );

    if (!deleted) {
      return { success: false, error: "Staff member not found" };
    }

    // 5. Return response
    return { success: true, data: { deleted: true, shiftsDeleted } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete staff member";
    return { success: false, error: message };
  }
}
