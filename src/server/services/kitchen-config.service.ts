import KitchenConfig from "@/server/models/KitchenConfig";
import type { KitchenConfigInput } from "@/lib/validations/kitchen-config.schema";
import { KitchenConfigDTO, toKitchenConfigDTO } from "@/types/kitchen-config";

/**
 * KitchenConfigService - Service layer for KitchenConfig operations.
 * This is the ONLY place that imports and interacts with the Mongoose model.
 */
export const KitchenConfigService = {
  /**
   * Get kitchen config by Clerk user ID.
   * @param userId - Clerk user ID
   * @returns KitchenConfigDTO or null if not found
   */
  async getByUserId(userId: string): Promise<KitchenConfigDTO | null> {
    const doc = await KitchenConfig.findOne({ userId }).lean();

    if (!doc) {
      return null;
    }

    return toKitchenConfigDTO(doc);
  },

  /**
   * Create or update kitchen config for a user (upsert pattern).
   * @param userId - Clerk user ID
   * @param data - Validated kitchen config input
   * @returns Created or updated KitchenConfigDTO
   */
  async upsert(
    userId: string,
    data: KitchenConfigInput
  ): Promise<KitchenConfigDTO> {
    const doc = await KitchenConfig.findOneAndUpdate(
      { userId },
      {
        userId,
        name: data.name,
        stations: data.stations.filter((s) => s.trim() !== ""),
        roles: data.roles.filter((r) => r.trim() !== ""),
        operatingHours: data.operatingHours,
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create if doesn't exist
        runValidators: true, // Run Mongoose validators
      }
    ).lean();

    if (!doc) {
      throw new Error("Failed to upsert kitchen config");
    }

    return toKitchenConfigDTO(doc);
  },

  /**
   * Delete kitchen config by user ID.
   * Used primarily for testing/cleanup.
   * @param userId - Clerk user ID
   * @returns true if deleted, false if not found
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await KitchenConfig.deleteOne({ userId });
    return result.deletedCount > 0;
  },
};
