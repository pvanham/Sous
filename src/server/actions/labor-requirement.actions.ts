"use server";

import { auth } from "@clerk/nextjs/server";
import {
  laborRequirementSchema,
  laborRequirementUpdateSchema,
  dayOfWeekSchema,
} from "@/lib/validations/labor-requirement.schema";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";
import type { LaborRequirementDTO } from "@/types/labor-requirement";

/**
 * List all labor requirements for the current user's location.
 * @returns ActionResponse containing array of LaborRequirementDTO
 */
export async function listLaborRequirements(): Promise<
  ActionResponse<LaborRequirementDTO[]>
> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const requirements = await LaborRequirementService.list(
      ctx.orgId,
      ctx.locationId
    );

    // 4. Return response
    return { success: true, data: requirements };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list labor requirements";
    return { success: false, error: message };
  }
}

/**
 * Get labor requirements for a specific day of the week.
 * @param day - Day of week (0-6, 0=Sunday)
 * @returns ActionResponse containing array of LaborRequirementDTO
 */
export async function getLaborRequirementsByDay(
  day: unknown
): Promise<ActionResponse<LaborRequirementDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = dayOfWeekSchema.safeParse(day);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const dayOfWeek = parseResult.data;

    // 3. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 4. Service call
    const requirements = await LaborRequirementService.getByDayOfWeek(
      ctx.orgId,
      ctx.locationId,
      dayOfWeek
    );

    // 5. Return response
    return { success: true, data: requirements };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get labor requirements by day";
    return { success: false, error: message };
  }
}

/**
 * Get a single labor requirement by ID.
 * @param id - Labor requirement document ID
 * @returns ActionResponse containing LaborRequirementDTO or null
 */
export async function getLaborRequirementById(
  id: string
): Promise<ActionResponse<LaborRequirementDTO | null>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const requirement = await LaborRequirementService.getById(
      ctx.orgId,
      ctx.locationId,
      id
    );

    // 4. Return response
    return { success: true, data: requirement };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get labor requirement";
    return { success: false, error: message };
  }
}

/**
 * Create a new labor requirement.
 * @param input - Labor requirement data
 * @returns ActionResponse containing created LaborRequirementDTO
 */
export async function createLaborRequirement(
  input: unknown
): Promise<ActionResponse<LaborRequirementDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = laborRequirementSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

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

    const validStations = new Set(config.stations);
    if (!validStations.has(data.station)) {
      return {
        success: false,
        error: `Invalid station: "${data.station}". Valid stations are: ${config.stations.join(", ")}`,
      };
    }

    // 5. Service call
    const requirement = await LaborRequirementService.create(
      ctx.orgId,
      ctx.locationId,
      data
    );

    // 6. Return response
    return { success: true, data: requirement };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create labor requirement";
    // Check for duplicate key error
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return {
        success: false,
        error:
          "A labor requirement already exists for this day, station, and start time",
      };
    }
    return { success: false, error: message };
  }
}

/**
 * Update an existing labor requirement.
 * @param id - Labor requirement document ID
 * @param input - Partial labor requirement data to update
 * @returns ActionResponse containing updated LaborRequirementDTO
 */
export async function updateLaborRequirement(
  id: string,
  input: unknown
): Promise<ActionResponse<LaborRequirementDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = laborRequirementUpdateSchema.safeParse(input);
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

      const validStations = new Set(config.stations);
      if (!validStations.has(updateData.station)) {
        return {
          success: false,
          error: `Invalid station: "${updateData.station}". Valid stations are: ${config.stations.join(", ")}`,
        };
      }
    }

    // 5. Service call
    const requirement = await LaborRequirementService.update(
      ctx.orgId,
      ctx.locationId,
      id,
      updateData
    );

    if (!requirement) {
      return { success: false, error: "Labor requirement not found" };
    }

    // 6. Return response
    return { success: true, data: requirement };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update labor requirement";
    return { success: false, error: message };
  }
}

/**
 * Create or update a labor requirement.
 * Matches by dayOfWeek + station + startTime to determine if updating or creating.
 * @param input - Labor requirement data
 * @returns ActionResponse containing upserted LaborRequirementDTO
 */
export async function upsertLaborRequirement(
  input: unknown
): Promise<ActionResponse<{ requirement: LaborRequirementDTO; created: boolean }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = laborRequirementSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

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

    const validStations = new Set(config.stations);
    if (!validStations.has(data.station)) {
      return {
        success: false,
        error: `Invalid station: "${data.station}". Valid stations are: ${config.stations.join(", ")}`,
      };
    }

    // 5. Service call
    const result = await LaborRequirementService.upsert(
      ctx.orgId,
      ctx.locationId,
      data
    );

    // 6. Return response
    return { success: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to upsert labor requirement";
    return { success: false, error: message };
  }
}

/**
 * Delete a labor requirement.
 * @param id - Labor requirement document ID
 * @returns ActionResponse with deletion status
 */
export async function deleteLaborRequirement(
  id: string
): Promise<ActionResponse<{ deleted: boolean }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Get location context (handles DB connection)
    const ctx = await getLocationContext(userId);

    // 3. Service call
    const deleted = await LaborRequirementService.delete(
      ctx.orgId,
      ctx.locationId,
      id
    );

    if (!deleted) {
      return { success: false, error: "Labor requirement not found" };
    }

    // 4. Return response
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete labor requirement";
    return { success: false, error: message };
  }
}
