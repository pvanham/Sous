"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { ActionResponse } from "@/lib/safe-action";
import { dbConnect } from "@/lib/db";
import {
  createOrganizationSchema,
} from "@/lib/validations/organization.schema";
import { updateLocationSchema } from "@/lib/validations/location.schema";
import { kitchenConfigSchema, type KitchenConfigInput } from "@/lib/validations/kitchen-config.schema";
import { laborRequirementSchema, type LaborRequirementInput } from "@/lib/validations/labor-requirement.schema";
import { OrganizationService } from "@/server/services/organization.service";
import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";

const saveOnboardingShiftSlotsSchema = laborRequirementSchema.array();

function parseValidationError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues;
    if (issues && issues.length > 0) {
      return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    }
  }
  return fallback;
}

async function getOwnerMembership(userId: string) {
  const membership = await OrganizationMemberService.getFirstByUserId(userId);
  if (!membership) return null;
  return membership.role === "owner" ? membership : null;
}

async function getOwnerContext(userId: string): Promise<{ orgId: string; locationId: string } | null> {
  const ownerMembership = await getOwnerMembership(userId);
  if (!ownerMembership) return null;
  const location = await LocationService.getDefaultByOrgId(ownerMembership.orgId);
  if (!location) return null;
  return {
    orgId: ownerMembership.orgId,
    locationId: location.id,
  };
}

export async function provisionOrganizationAndLocation(
  input: unknown,
): Promise<ActionResponse<{ orgId: string; locationId: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = createOrganizationSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parseValidationError(parsed.error, "Invalid organization input"),
      };
    }

    await dbConnect();

    const existingContext = await getOwnerContext(userId);
    if (existingContext) {
      return { success: true, data: existingContext };
    }

    const org = await OrganizationService.create(userId, parsed.data);
    const location = await LocationService.create(org.id, {
      name: "Main Location",
      timezone: "America/New_York",
    });

    await OrganizationMemberService.create({
      orgId: org.id,
      locationId: null,
      clerkUserId: userId,
      role: "owner",
    });

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { orgId: org.id, locationId: location.id },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to provision organization and location";
    return { success: false, error: message };
  }
}

export async function saveOnboardingLocationIdentity(
  locationId: string,
  input: unknown,
): Promise<ActionResponse<{ locationId: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = updateLocationSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parseValidationError(parsed.error, "Invalid location input"),
      };
    }

    await dbConnect();

    const ownerContext = await getOwnerContext(userId);
    if (!ownerContext) {
      return { success: false, error: "Organization not found. Complete step 1 first." };
    }

    const targetLocationId = locationId || ownerContext.locationId;
    const updated = await LocationService.update(ownerContext.orgId, targetLocationId, parsed.data);
    if (!updated) {
      return { success: false, error: "Location not found" };
    }

    revalidatePath("/", "layout");
    return { success: true, data: { locationId: updated.id } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save location identity";
    return { success: false, error: message };
  }
}

export async function saveOnboardingKitchenConfig(
  input: unknown,
): Promise<ActionResponse<{ locationId: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = kitchenConfigSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parseValidationError(parsed.error, "Invalid kitchen config input"),
      };
    }
    const data: KitchenConfigInput = parsed.data;

    await dbConnect();

    const ownerContext = await getOwnerContext(userId);
    if (!ownerContext) {
      return { success: false, error: "Organization not found. Complete step 1 first." };
    }

    await KitchenConfigService.upsert(ownerContext.orgId, ownerContext.locationId, data);
    revalidatePath("/", "layout");

    return { success: true, data: { locationId: ownerContext.locationId } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save onboarding config";
    return { success: false, error: message };
  }
}

export async function saveOnboardingShiftSlots(
  input: unknown,
): Promise<ActionResponse<{ created: number }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = saveOnboardingShiftSlotsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parseValidationError(parsed.error, "Invalid shift slot input"),
      };
    }

    await dbConnect();

    const ownerContext = await getOwnerContext(userId);
    if (!ownerContext) {
      return { success: false, error: "Organization not found. Complete step 1 first." };
    }

    await LaborRequirementService.deleteAllByLocation(
      ownerContext.orgId,
      ownerContext.locationId,
    );

    let created = 0;
    for (const slot of parsed.data) {
      const payload: LaborRequirementInput = {
        dayOfWeek: slot.dayOfWeek,
        station: slot.station,
        startTime: slot.startTime,
        endTime: slot.endTime,
        minStaff: slot.minStaff,
        preferredStaff: slot.preferredStaff,
        priority: slot.priority,
      };
      await LaborRequirementService.create(
        ownerContext.orgId,
        ownerContext.locationId,
        payload,
      );
      created += 1;
    }

    revalidatePath("/", "layout");
    return { success: true, data: { created } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save onboarding shift slots";
    return { success: false, error: message };
  }
}

export async function completeOnboarding(): Promise<ActionResponse<{ completed: true }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        onboardingComplete: true,
      },
    });

    revalidatePath("/", "layout");
    return { success: true, data: { completed: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete onboarding";
    return { success: false, error: message };
  }
}
