"use server";

import { auth } from "@clerk/nextjs/server";
import { dbConnect } from "@/lib/db";
import { kitchenConfigSchema } from "@/lib/validations/kitchen-config.schema";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import type { ActionResponse } from "@/lib/safe-action";
import type { KitchenConfigDTO } from "@/types/kitchen-config";

/**
 * Get the kitchen config for the currently authenticated user.
 * @returns ActionResponse containing the config or null if not found
 */
export async function getKitchenConfig(): Promise<
  ActionResponse<KitchenConfigDTO | null>
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
    const config = await KitchenConfigService.getByUserId(userId);

    // 4. Return response
    return { success: true, data: config };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get kitchen config";
    return { success: false, error: message };
  }
}

/**
 * Save (create or update) the kitchen config for the currently authenticated user.
 * @param input - Kitchen config data to save
 * @returns ActionResponse containing the saved config
 */
export async function saveKitchenConfig(
  input: unknown
): Promise<ActionResponse<KitchenConfigDTO>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Zod validation
    const parseResult = kitchenConfigSchema.safeParse(input);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    const validatedData = parseResult.data;

    // 3. DB connect
    await dbConnect();

    // 4. Service call
    const config = await KitchenConfigService.upsert(userId, validatedData);

    // 5. Return response
    return { success: true, data: config };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save kitchen config";
    return { success: false, error: message };
  }
}
