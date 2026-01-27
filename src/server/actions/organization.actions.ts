"use server";

import { auth } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@/lib/validations/organization.schema";
import { OrganizationService } from "@/server/services/organization.service";
import type { ActionResponse } from "@/lib/safe-action";
import type { OrganizationDTO } from "@/types/organization";

/**
 * Get the current user's organization.
 * For MVP, users have one organization (auto-created on first access).
 * @returns ActionResponse containing OrganizationDTO
 */
export async function getMyOrganization(): Promise<
  ActionResponse<OrganizationDTO | null>
> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. DB connect
    await dbConnect();

    // 3. Service call
    const org = await OrganizationService.getByOwnerId(userId);

    // 4. Return response (null is valid - user may not have an org yet)
    return { success: true, data: org };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get organization";
    return { success: false, error: message };
  }
}

/**
 * Create a new organization.
 * @param input - Organization data
 * @returns ActionResponse containing created OrganizationDTO
 */
export async function createOrganization(
  input: unknown
): Promise<ActionResponse<OrganizationDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = createOrganizationSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const org = await OrganizationService.create(userId, data);

    // 5. Return response
    return { success: true, data: org };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create organization";
    return { success: false, error: message };
  }
}

/**
 * Update an existing organization.
 * @param orgId - Organization document ID
 * @param input - Partial organization data to update
 * @returns ActionResponse containing updated OrganizationDTO
 */
export async function updateOrganization(
  orgId: string,
  input: unknown
): Promise<ActionResponse<OrganizationDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = updateOrganizationSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const data = parseResult.data;

    // 3. DB connect
    await dbConnect();

    // 4. Verify ownership
    const existing = await OrganizationService.getById(orgId);
    if (!existing) {
      return { success: false, error: "Organization not found" };
    }
    if (existing.ownerId !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 5. Service call
    const org = await OrganizationService.update(orgId, data);
    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    // 6. Return response
    return { success: true, data: org };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update organization";
    return { success: false, error: message };
  }
}
