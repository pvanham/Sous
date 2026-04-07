"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { inviteManagerSchema } from "@/lib/validations/invitation.schema";
import { getLocationContext } from "@/lib/auth/get-location-context";
import type { ActionResponse } from "@/lib/safe-action";

export async function inviteManager(
  input: unknown
): Promise<ActionResponse<{ id: string; emailAddress: string }>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Validate input
    const parseResult = inviteManagerSchema.safeParse(input);
    if (!parseResult.success) {
      return { 
        success: false, 
        error: parseResult.error.issues[0]?.message ?? "Invalid input" 
      };
    }
    const data = parseResult.data;

    // 3. Get context & enforce owner access
    const ctx = await getLocationContext(userId);
    if (ctx.role !== "owner") {
      return { success: false, error: "Only owners can invite managers" };
    }

    // 4. Send invitation via Clerk
    // Pass orgId and locationId in publicMetadata so webhook can parse it
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: data.email,
      ignoreExisting: true,
      publicMetadata: {
        role: "manager",
        orgId: ctx.orgId,
        locationId: data.locationId === "org-wide" ? null : data.locationId,
      },
    });

    return { 
      success: true, 
      data: { id: invitation.id, emailAddress: invitation.emailAddress } 
    };
  } catch (error) {
    console.error("inviteManager error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to invite manager" 
    };
  }
}
