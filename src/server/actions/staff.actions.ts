"use server";

import { auth } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import {
  staffSchema,
  staffUpdateSchema,
  importStaffSchema,
  staffListParamsSchema,
} from "@/lib/validations/staff.schema";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import type { ActionResponse } from "@/lib/safe-action";
import type {
  StaffDTO,
  ImportResult,
  ImportRowError,
  PaginatedStaffResult,
} from "@/types/staff";

/**
 * List all staff for the currently authenticated user (includes both active and inactive).
 * @returns ActionResponse containing array of StaffDTO
 */
export async function listStaff(): Promise<ActionResponse<StaffDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Service call
    const staff = await StaffService.list(userId);

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

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const result = await StaffService.listPaginated(userId, params);

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

    // 3. DB connect
    await dbConnect();

    // 4. Fetch KitchenConfig to validate roles/stations
    const config = await KitchenConfigService.getByUserId(userId);
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
    const result = await StaffService.bulkUpsert(userId, validStaff);

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

    // 3. DB connect
    await dbConnect();

    // 4. Validate roles/stations against KitchenConfig
    const config = await KitchenConfigService.getByUserId(userId);
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
    const staff = await StaffService.create(userId, staffData);

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

    // 3. DB connect
    await dbConnect();

    // 4. Validate roles/stations if provided
    if (updateData.roles || updateData.skills) {
      const config = await KitchenConfigService.getByUserId(userId);
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
    const staff = await StaffService.update(userId, staffId, updateData);

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

    // 2. DB connect
    await dbConnect();

    // 3. Service call
    const staff = await StaffService.setActive(userId, staffId, isActive);

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
 * Permanently delete a staff member.
 * @param staffId - Staff document ID
 * @returns ActionResponse with deletion status
 */
export async function deleteStaff(
  staffId: string
): Promise<ActionResponse<{ deleted: boolean }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Service call
    const deleted = await StaffService.delete(userId, staffId);

    if (!deleted) {
      return { success: false, error: "Staff member not found" };
    }

    // 4. Return response
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete staff member";
    return { success: false, error: message };
  }
}
