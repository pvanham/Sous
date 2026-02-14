import { Types } from "mongoose";
import LaborRequirement from "@/server/models/LaborRequirement";
import type { LaborRequirementInput, LaborRequirementUpdateInput } from "@/lib/validations/labor-requirement.schema";
import { LaborRequirementDTO, toLaborRequirementDTO, LaborPriority } from "@/types/labor-requirement";

/**
 * LaborRequirementService - Service layer for Labor Requirement operations.
 * This is the ONLY place that imports and interacts with the LaborRequirement Mongoose model.
 */
export const LaborRequirementService = {
  /**
   * List all labor requirements for a location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Array of LaborRequirementDTO sorted by day of week, then station, then start time
   */
  async list(orgId: string, locationId: string): Promise<LaborRequirementDTO[]> {
    const docs = await LaborRequirement.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ dayOfWeek: 1, station: 1, startTime: 1 })
      .lean();
    return docs.map(toLaborRequirementDTO);
  },

  /**
   * Get labor requirements for a specific day of the week.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param dayOfWeek - Day of week (0-6, 0=Sunday)
   * @returns Array of LaborRequirementDTO for the specified day
   */
  async getByDayOfWeek(
    orgId: string,
    locationId: string,
    dayOfWeek: number
  ): Promise<LaborRequirementDTO[]> {
    const docs = await LaborRequirement.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      dayOfWeek,
    })
      .sort({ station: 1, startTime: 1 })
      .lean();
    return docs.map(toLaborRequirementDTO);
  },

  /**
   * Get a single labor requirement by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Labor requirement document ID
   * @returns LaborRequirementDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    id: string
  ): Promise<LaborRequirementDTO | null> {
    const doc = await LaborRequirement.findOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toLaborRequirementDTO(doc);
  },

  /**
   * Create a new labor requirement (shift slot).
   * Overlapping time ranges on the same station/day are allowed since
   * shift slots represent shift definitions that commonly overlap.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated labor requirement input
   * @returns Created LaborRequirementDTO
   */
  async create(
    orgId: string,
    locationId: string,
    data: LaborRequirementInput
  ): Promise<LaborRequirementDTO> {
    const doc = await LaborRequirement.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      dayOfWeek: data.dayOfWeek,
      station: data.station,
      startTime: data.startTime,
      endTime: data.endTime,
      minStaff: data.minStaff,
      preferredStaff: data.preferredStaff,
      priority: data.priority,
    });

    return toLaborRequirementDTO(doc.toObject());
  },

  /**
   * Update an existing labor requirement (shift slot).
   * Overlapping time ranges are allowed.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Labor requirement document ID
   * @param data - Partial labor requirement data to update
   * @returns Updated LaborRequirementDTO or null if not found
   */
  async update(
    orgId: string,
    locationId: string,
    id: string,
    data: LaborRequirementUpdateInput
  ): Promise<LaborRequirementDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
    if (data.station !== undefined) updateData.station = data.station;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.minStaff !== undefined) updateData.minStaff = data.minStaff;
    if (data.preferredStaff !== undefined)
      updateData.preferredStaff = data.preferredStaff;
    if (data.priority !== undefined) updateData.priority = data.priority;

    const doc = await LaborRequirement.findOneAndUpdate(
      {
        _id: id,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toLaborRequirementDTO(doc);
  },

  /**
   * Create or update a labor requirement.
   * Matches by dayOfWeek + station + startTime + endTime to determine if updating or creating.
   * Two slots may share the same startTime if their endTimes differ.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated labor requirement input
   * @returns Upserted LaborRequirementDTO and whether it was created
   */
  async upsert(
    orgId: string,
    locationId: string,
    data: LaborRequirementInput
  ): Promise<{ requirement: LaborRequirementDTO; created: boolean }> {
    const filter = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      dayOfWeek: data.dayOfWeek,
      station: data.station,
      startTime: data.startTime,
      endTime: data.endTime,
    };

    const update = {
      $set: {
        minStaff: data.minStaff,
        preferredStaff: data.preferredStaff,
        priority: data.priority,
      },
      $setOnInsert: {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        dayOfWeek: data.dayOfWeek,
        station: data.station,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    };

    const doc = await LaborRequirement.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      runValidators: true,
    }).lean();

    // Check if this was a new document by comparing createdAt and updatedAt
    // If they're within a small threshold, it was just created
    const created =
      doc.createdAt.getTime() === doc.updatedAt.getTime() ||
      doc.updatedAt.getTime() - doc.createdAt.getTime() < 1000;

    return {
      requirement: toLaborRequirementDTO(doc),
      created,
    };
  },

  /**
   * Delete a labor requirement.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Labor requirement document ID
   * @returns true if deleted, false if not found
   */
  async delete(orgId: string, locationId: string, id: string): Promise<boolean> {
    const result = await LaborRequirement.deleteOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all labor requirements for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await LaborRequirement.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all labor requirements for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await LaborRequirement.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Get labor requirements for a specific station.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param station - Station name
   * @returns Array of LaborRequirementDTO for the specified station
   */
  async getByStation(
    orgId: string,
    locationId: string,
    station: string
  ): Promise<LaborRequirementDTO[]> {
    const docs = await LaborRequirement.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station,
    })
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    return docs.map(toLaborRequirementDTO);
  },

  /**
   * Get labor requirements for a specific station and day.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param station - Station name
   * @param dayOfWeek - Day of week (0-6, 0=Sunday)
   * @returns Array of LaborRequirementDTO for the specified station and day
   */
  async getByStationAndDay(
    orgId: string,
    locationId: string,
    station: string,
    dayOfWeek: number
  ): Promise<LaborRequirementDTO[]> {
    const docs = await LaborRequirement.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station,
      dayOfWeek,
    })
      .sort({ startTime: 1 })
      .lean();
    return docs.map(toLaborRequirementDTO);
  },

  /**
   * Count labor requirements for a location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of labor requirements
   */
  async count(orgId: string, locationId: string): Promise<number> {
    return await LaborRequirement.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
  },

  /**
   * Count labor requirements that reference any of the given station names.
   * Used for impact analysis when removing stations from kitchen config.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to count
   * @returns Number of labor requirements for the specified stations
   */
  async countByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    return await LaborRequirement.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station: { $in: stations },
    });
  },

  /**
   * Delete all labor requirements that reference any of the given station names.
   * Used when a station is removed from kitchen config (cascading cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to delete requirements for
   * @returns Number of deleted documents
   */
  async deleteByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    const result = await LaborRequirement.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station: { $in: stations },
    });
    return result.deletedCount;
  },

  /**
   * Create labor requirements for multiple cells (station/day combinations).
   * Each cell gets a new requirement with the specified settings.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param cells - Array of station/day combinations
   * @param requirement - The requirement settings to apply to all cells
   * @returns Count of created requirements and array of errors for failed cells
   */
  async bulkCreate(
    orgId: string,
    locationId: string,
    cells: Array<{ station: string; dayOfWeek: number }>,
    requirement: {
      startTime: string;
      endTime: string;
      minStaff: number;
      preferredStaff: number;
      priority: LaborPriority;
    }
  ): Promise<{
    created: number;
    errors: Array<{ station: string; dayOfWeek: number; error: string }>;
  }> {
    const results = {
      created: 0,
      errors: [] as Array<{ station: string; dayOfWeek: number; error: string }>,
    };

    for (const cell of cells) {
      try {
        await this.create(orgId, locationId, {
          station: cell.station,
          dayOfWeek: cell.dayOfWeek,
          ...requirement,
        });
        results.created++;
      } catch (error) {
        results.errors.push({
          station: cell.station,
          dayOfWeek: cell.dayOfWeek,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },

  /**
   * Delete labor requirements for multiple cells (station/day combinations).
   * Deletes ALL requirements in each selected cell.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param cells - Array of station/day combinations
   * @returns Total number of deleted requirements
   */
  async bulkDelete(
    orgId: string,
    locationId: string,
    cells: Array<{ station: string; dayOfWeek: number }>
  ): Promise<{ deleted: number }> {
    let totalDeleted = 0;

    for (const cell of cells) {
      const result = await LaborRequirement.deleteMany({
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        station: cell.station,
        dayOfWeek: cell.dayOfWeek,
      });
      totalDeleted += result.deletedCount;
    }

    return { deleted: totalDeleted };
  },
};
