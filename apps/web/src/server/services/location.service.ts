import { Types } from "mongoose";
import Location from "@/server/models/Location";
import type { CreateLocationInput } from "@/lib/validations/location.schema";
import {
  LocationDTO,
  toLocationDTO,
  UpdateLocationInput,
} from "@/types/location";

/**
 * LocationService - Service layer for Location operations.
 * This is the ONLY place that imports and interacts with the Location Mongoose model.
 */
export const LocationService = {
  /**
   * Get location by ID.
   * @param locationId - Location document ID
   * @returns LocationDTO or null if not found
   */
  async getById(locationId: string): Promise<LocationDTO | null> {
    const doc = await Location.findById(locationId).lean();
    if (!doc) return null;
    return toLocationDTO(doc);
  },

  /**
   * Get location by ID and orgId (for access control).
   * @param orgId - Organization ID
   * @param locationId - Location document ID
   * @returns LocationDTO or null if not found or doesn't belong to org
   */
  async getByOrgAndId(
    orgId: string,
    locationId: string
  ): Promise<LocationDTO | null> {
    const doc = await Location.findOne({
      _id: locationId,
      orgId: new Types.ObjectId(orgId),
    }).lean();
    if (!doc) return null;
    return toLocationDTO(doc);
  },

  /**
   * List all locations for an organization.
   * @param orgId - Organization ID
   * @returns Array of LocationDTO
   */
  async listByOrgId(orgId: string): Promise<LocationDTO[]> {
    const docs = await Location.find({ orgId: new Types.ObjectId(orgId) })
      .sort({ name: 1 })
      .lean();
    return docs.map(toLocationDTO);
  },

  /**
   * Get the first (default) location for an organization.
   * Used for MVP single-location scenario.
   * @param orgId - Organization ID
   * @returns LocationDTO or null if no locations exist
   */
  async getDefaultByOrgId(orgId: string): Promise<LocationDTO | null> {
    const doc = await Location.findOne({ orgId: new Types.ObjectId(orgId) })
      .sort({ createdAt: 1 })
      .lean();
    if (!doc) return null;
    return toLocationDTO(doc);
  },

  /**
   * Create a new location.
   * @param orgId - Organization ID
   * @param data - Validated location input
   * @returns Created LocationDTO
   */
  async create(
    orgId: string,
    data: Omit<CreateLocationInput, "orgId">
  ): Promise<LocationDTO> {
    const doc = await Location.create({
      orgId: new Types.ObjectId(orgId),
      name: data.name,
      timezone: data.timezone || "America/New_York",
      twilioPhoneNumber: data.twilioPhoneNumber,
    });

    return toLocationDTO(doc.toObject());
  },

  /**
   * Update an existing location.
   * @param orgId - Organization ID (for access control)
   * @param locationId - Location document ID
   * @param data - Partial location data to update
   * @returns Updated LocationDTO or null if not found
   */
  async update(
    orgId: string,
    locationId: string,
    data: UpdateLocationInput
  ): Promise<LocationDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.twilioPhoneNumber !== undefined) {
      updateData.twilioPhoneNumber = data.twilioPhoneNumber;
    }

    const doc = await Location.findOneAndUpdate(
      { _id: locationId, orgId: new Types.ObjectId(orgId) },
      { $set: updateData },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!doc) return null;
    return toLocationDTO(doc);
  },

  /**
   * Delete a location by ID.
   * @param orgId - Organization ID (for access control)
   * @param locationId - Location document ID
   * @returns true if deleted, false if not found
   */
  async delete(orgId: string, locationId: string): Promise<boolean> {
    const result = await Location.deleteOne({
      _id: locationId,
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all locations for an organization.
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Location.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
