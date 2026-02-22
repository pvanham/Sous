import { Types } from "mongoose";
import KitchenConfig from "@/server/models/KitchenConfig";
import type {
  KitchenConfigInput,
  AISettingsInput,
} from "@/lib/validations/kitchen-config.schema";
import { KitchenConfigDTO, toKitchenConfigDTO } from "@/types/kitchen-config";

/**
 * KitchenConfigService - Service layer for KitchenConfig operations.
 * This is the ONLY place that imports and interacts with the Mongoose model.
 */
export const KitchenConfigService = {
  /**
   * Get kitchen config by organization and location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns KitchenConfigDTO or null if not found
   */
  async getByLocation(
    orgId: string,
    locationId: string
  ): Promise<KitchenConfigDTO | null> {
    const doc = await KitchenConfig.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();

    if (!doc) {
      return null;
    }

    return toKitchenConfigDTO(doc);
  },

  /**
   * Create or update kitchen config for a location (upsert pattern).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated kitchen config input
   * @returns Created or updated KitchenConfigDTO
   */
  async upsert(
    orgId: string,
    locationId: string,
    data: KitchenConfigInput
  ): Promise<KitchenConfigDTO> {
    const orgObjectId = new Types.ObjectId(orgId);
    const locationObjectId = new Types.ObjectId(locationId);

    const updateData: Record<string, unknown> = {
      orgId: orgObjectId,
      locationId: locationObjectId,
      name: data.name,
      stations: data.stations.filter((s) => s.trim() !== ""),
      roles: data.roles.filter((r) => r.trim() !== ""),
      operatingHours: data.operatingHours,
      minTimeOffAdvanceDays: data.minTimeOffAdvanceDays ?? 7,
    };

    // Include aiSettings if provided, using defaults for missing values
    if (data.aiSettings) {
      updateData.aiSettings = {
        monthlyGenerationLimit: data.aiSettings.monthlyGenerationLimit ?? 1000,
        subscriptionTier: data.aiSettings.subscriptionTier ?? "free",
      };
    }

    const doc = await KitchenConfig.findOneAndUpdate(
      { orgId: orgObjectId, locationId: locationObjectId },
      updateData,
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
   * Update only the AI settings for a location's kitchen config.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated AI settings input
   * @returns Updated KitchenConfigDTO
   */
  async updateAISettings(
    orgId: string,
    locationId: string,
    data: AISettingsInput
  ): Promise<KitchenConfigDTO> {
    const doc = await KitchenConfig.findOneAndUpdate(
      {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: { aiSettings: data } },
      { new: true, upsert: false }
    ).lean();

    if (!doc) {
      throw new Error("Kitchen config not found.");
    }

    return toKitchenConfigDTO(doc);
  },

  /**
   * Delete kitchen config by organization and location.
   * Used primarily for testing/cleanup.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns true if deleted, false if not found
   */
  async deleteByLocation(orgId: string, locationId: string): Promise<boolean> {
    const result = await KitchenConfig.deleteOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all kitchen configs for an organization.
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await KitchenConfig.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
