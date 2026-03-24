"use server";

import { auth } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import {
  createLocationSchema,
  updateLocationSchema,
} from "@/lib/validations/location.schema";
import { LocationService } from "@/server/services/location.service";
import { OrganizationService } from "@/server/services/organization.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import type { ActionResponse } from "@/lib/safe-action";
import type { LocationDTO } from "@/types/location";

/**
 * Get all locations for the current user's organization.
 * @returns ActionResponse containing array of LocationDTO
 */
export async function listLocations(): Promise<ActionResponse<LocationDTO[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Get user's organization
    const membership = await OrganizationMemberService.getFirstByUserId(userId);
    if (!membership) {
      return { success: true, data: [] };
    }

    // 4. Service call
    const locations = await LocationService.listByOrgId(membership.orgId);

    // 5. Return response
    return { success: true, data: locations };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list locations";
    return { success: false, error: message };
  }
}

/**
 * Get a single location by ID.
 * @param locationId - Location document ID
 * @returns ActionResponse containing LocationDTO
 */
export async function getLocation(
  locationId: string
): Promise<ActionResponse<LocationDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Get user's organization
    const membership = await OrganizationMemberService.getFirstByUserId(userId);
    if (!membership) {
      return { success: false, error: "No organization found" };
    }

    // 4. Service call with access control
    const location = await LocationService.getByOrgAndId(
      membership.orgId,
      locationId
    );
    if (!location) {
      return { success: false, error: "Location not found" };
    }

    // 5. Return response
    return { success: true, data: location };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get location";
    return { success: false, error: message };
  }
}

/**
 * Create a new location.
 * @param input - Location data
 * @returns ActionResponse containing created LocationDTO
 */
export async function createLocation(
  input: unknown
): Promise<ActionResponse<LocationDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = createLocationSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

    // 3. DB connect
    await dbConnect();

    // 4. Get user's organization (must be owner)
    const org = await OrganizationService.getByOwnerId(userId);
    if (!org) {
      return { success: false, error: "No organization found" };
    }

    // 5. Service call
    const location = await LocationService.create(org.id, data);

    // Revalidate the layout so the LocationSwitcher updates immediately with the new location
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/", "layout");

    // 6. Return response
    return { success: true, data: location };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create location";
    return { success: false, error: message };
  }
}

/**
 * Update an existing location.
 * @param locationId - Location document ID
 * @param input - Partial location data to update
 * @returns ActionResponse containing updated LocationDTO
 */
export async function updateLocation(
  locationId: string,
  input: unknown
): Promise<ActionResponse<LocationDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = updateLocationSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

    // 3. DB connect
    await dbConnect();

    // 4. Get user's organization (must be owner)
    const org = await OrganizationService.getByOwnerId(userId);
    if (!org) {
      return { success: false, error: "No organization found" };
    }

    // 5. Service call with access control
    const location = await LocationService.update(org.id, locationId, data);
    if (!location) {
      return { success: false, error: "Location not found" };
    }

    // 6. Return response
    return { success: true, data: location };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update location";
    return { success: false, error: message };
  }
}

/**
 * Delete a location.
 * @param locationId - Location document ID
 * @returns ActionResponse with deletion status
 */
export async function deleteLocation(
  locationId: string
): Promise<ActionResponse<{ deleted: boolean }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Get user's organization (must be owner)
    const org = await OrganizationService.getByOwnerId(userId);
    if (!org) {
      return { success: false, error: "No organization found" };
    }

    // 4. Service call with access control
    const deleted = await LocationService.delete(org.id, locationId);
    if (!deleted) {
      return { success: false, error: "Location not found" };
    }

    // 5. Return response
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete location";
    return { success: false, error: message };
  }
}
