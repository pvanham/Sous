"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResponse } from "@/lib/safe-action";
import { dbConnect } from "@/lib/db";
import { LocationService } from "@/server/services/location.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";

const switchActiveLocationSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, "Invalid location id");

export async function switchActiveLocation(
  input: unknown
): Promise<ActionResponse<{ success: boolean }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = switchActiveLocationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Location not found" };
    }
    const locationId = parsed.data;

    // Only org-wide memberships read `activeLocationId`, and the switcher
    // is an owner control. Location-scoped members stay on their location.
    await dbConnect();
    const memberships = await OrganizationMemberService.listByUserId(userId);
    const owner = memberships.find((m) => m.role === "owner");
    if (!owner) {
      return { success: false, error: "Only owners can switch locations" };
    }

    const location = await LocationService.getByOrgAndId(owner.orgId, locationId);
    if (!location) {
      return { success: false, error: "Location not found" };
    }

    const client = await clerkClient();
    
    // Update the user's public metadata with the newly selected active location
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        activeLocationId: location.id,
      },
    });

    // Revalidate the caching of the layout/pages downstream
    revalidatePath("/", "layout");

    return { success: true, data: { success: true } };
  } catch (error) {
    console.error("switchActiveLocation error:", error);
    return { success: false, error: "Failed to switch active location" };
  }
}
