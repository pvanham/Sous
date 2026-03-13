"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { ActionResponse } from "@/lib/safe-action";

export async function switchActiveLocation(
  locationId: string
): Promise<ActionResponse<{ success: boolean }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const client = await clerkClient();
    
    // Update the user's public metadata with the newly selected active location
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        activeLocationId: locationId,
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
