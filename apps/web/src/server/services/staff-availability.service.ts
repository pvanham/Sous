import { Types } from "mongoose";
import StaffAvailability from "@/server/models/StaffAvailability";
import type {
  StaffAvailabilityInput,
  DayAvailabilityInput,
} from "@/lib/validations/staff-availability.schema";
import {
  StaffAvailabilityDTO,
  toStaffAvailabilityDTO,
} from "@/types/staff-availability";

/**
 * StaffAvailabilityService - Service layer for Staff Availability operations.
 * This is the ONLY place that imports and interacts with the StaffAvailability Mongoose model.
 */
export const StaffAvailabilityService = {
  /**
   * List all availability entries for a location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Array of StaffAvailabilityDTO sorted by staff ID then day of week
   */
  async list(
    orgId: string,
    locationId: string
  ): Promise<StaffAvailabilityDTO[]> {
    const docs = await StaffAvailability.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ staffId: 1, dayOfWeek: 1 })
      .lean();
    return docs.map(toStaffAvailabilityDTO);
  },

  /**
   * Get all availability entries for a specific staff member.
   * One entry per day of the week (max 7).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @returns Array of StaffAvailabilityDTO for the staff member (up to 7 entries)
   */
  async getByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<StaffAvailabilityDTO[]> {
    const docs = await StaffAvailability.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    })
      .sort({ dayOfWeek: 1 })
      .lean();
    return docs.map(toStaffAvailabilityDTO);
  },

  /**
   * Get availability for a specific day of the week.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param dayOfWeek - Day of week (0-6, 0=Sunday)
   * @returns Array of StaffAvailabilityDTO for the specified day
   */
  async getByDayOfWeek(
    orgId: string,
    locationId: string,
    dayOfWeek: number
  ): Promise<StaffAvailabilityDTO[]> {
    const docs = await StaffAvailability.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      dayOfWeek,
    })
      .sort({ staffId: 1 })
      .lean();
    return docs.map(toStaffAvailabilityDTO);
  },

  /**
   * Find staff available for a specific time slot.
   * This is a KEY METHOD used by CandidateService (Sprint 3.5) for AI scheduling.
   *
   * Filters by:
   * - preference !== 'unavailable'
   * - Time overlap: availableFrom <= startTime && availableTo >= endTime
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param dayOfWeek - Day of week (0-6, 0=Sunday)
   * @param startTime - Shift start time in HH:MM format
   * @param endTime - Shift end time in HH:MM format
   * @returns Array of StaffAvailabilityDTO for staff who can work the slot
   */
  async getAvailableStaff(
    orgId: string,
    locationId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string
  ): Promise<StaffAvailabilityDTO[]> {
    const docs = await StaffAvailability.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      dayOfWeek,
      // Exclude unavailable staff
      preference: { $ne: "unavailable" },
      // Staff availability must cover the entire shift
      // availableFrom <= startTime AND availableTo >= endTime
      availableFrom: { $lte: startTime },
      availableTo: { $gte: endTime },
    })
      .sort({ preference: -1, staffId: 1 }) // Sort preferred first
      .lean();
    return docs.map(toStaffAvailabilityDTO);
  },

  /**
   * Get a single availability entry by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Availability document ID
   * @returns StaffAvailabilityDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    id: string
  ): Promise<StaffAvailabilityDTO | null> {
    const doc = await StaffAvailability.findOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toStaffAvailabilityDTO(doc);
  },

  /**
   * Create a new availability entry.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated availability input
   * @returns Created StaffAvailabilityDTO
   */
  async create(
    orgId: string,
    locationId: string,
    data: StaffAvailabilityInput
  ): Promise<StaffAvailabilityDTO> {
    const doc = await StaffAvailability.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(data.staffId),
      dayOfWeek: data.dayOfWeek,
      availableFrom: data.availableFrom,
      availableTo: data.availableTo,
      preference: data.preference,
      notes: data.notes ?? "",
    });

    return toStaffAvailabilityDTO(doc.toObject());
  },

  /**
   * Create or update an availability entry.
   * Matches by staffId + dayOfWeek to determine if updating or creating.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param data - Validated availability input
   * @returns Upserted StaffAvailabilityDTO and whether it was created
   */
  async upsert(
    orgId: string,
    locationId: string,
    data: StaffAvailabilityInput
  ): Promise<{ availability: StaffAvailabilityDTO; created: boolean }> {
    const filter = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(data.staffId),
      dayOfWeek: data.dayOfWeek,
    };

    const update = {
      $set: {
        availableFrom: data.availableFrom,
        availableTo: data.availableTo,
        preference: data.preference,
        notes: data.notes ?? "",
      },
      $setOnInsert: {
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        staffId: new Types.ObjectId(data.staffId),
        dayOfWeek: data.dayOfWeek,
      },
    };

    const doc = await StaffAvailability.findOneAndUpdate(filter, update, {
      returnDocument: "after",
      upsert: true,
      runValidators: true,
    }).lean();

    // Check if this was a new document
    const created =
      doc.createdAt.getTime() === doc.updatedAt.getTime() ||
      doc.updatedAt.getTime() - doc.createdAt.getTime() < 1000;

    return {
      availability: toStaffAvailabilityDTO(doc),
      created,
    };
  },

  /**
   * Bulk upsert weekly availability for a staff member.
   * Replaces all existing availability entries with the new set.
   * One entry per day of the week (max 7).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @param availabilities - Array of day availability entries (one per day)
   * @returns Array of upserted StaffAvailabilityDTO
   */
  async bulkUpsert(
    orgId: string,
    locationId: string,
    staffId: string,
    availabilities: DayAvailabilityInput[]
  ): Promise<StaffAvailabilityDTO[]> {
    const orgObjectId = new Types.ObjectId(orgId);
    const locationObjectId = new Types.ObjectId(locationId);
    const staffObjectId = new Types.ObjectId(staffId);

    // Delete all existing availability entries for this staff member
    await StaffAvailability.deleteMany({
      orgId: orgObjectId,
      locationId: locationObjectId,
      staffId: staffObjectId,
    });

    // If no new entries to add, return empty array
    if (availabilities.length === 0) {
      return [];
    }

    // Filter out "unavailable" entries - they're implicit (no entry = unavailable)
    const availableEntries = availabilities.filter(
      (avail) => avail.preference !== "unavailable"
    );

    if (availableEntries.length === 0) {
      return [];
    }

    // Insert new entries
    const docs = await StaffAvailability.insertMany(
      availableEntries.map((avail) => ({
        orgId: orgObjectId,
        locationId: locationObjectId,
        staffId: staffObjectId,
        dayOfWeek: avail.dayOfWeek,
        availableFrom: avail.availableFrom,
        availableTo: avail.availableTo,
        preference: avail.preference,
        notes: avail.notes ?? "",
      }))
    );

    return docs.map((doc) => toStaffAvailabilityDTO(doc.toObject()));
  },

  /**
   * Update an existing availability entry.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Availability document ID
   * @param data - Partial availability data to update
   * @returns Updated StaffAvailabilityDTO or null if not found
   */
  async update(
    orgId: string,
    locationId: string,
    id: string,
    data: Partial<Omit<StaffAvailabilityInput, "staffId">>
  ): Promise<StaffAvailabilityDTO | null> {
    const updateData: Record<string, unknown> = {};

    if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
    if (data.availableFrom !== undefined)
      updateData.availableFrom = data.availableFrom;
    if (data.availableTo !== undefined)
      updateData.availableTo = data.availableTo;
    if (data.preference !== undefined) updateData.preference = data.preference;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const doc = await StaffAvailability.findOneAndUpdate(
      {
        _id: id,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!doc) return null;
    return toStaffAvailabilityDTO(doc);
  },

  /**
   * Delete an availability entry.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param id - Availability document ID
   * @returns true if deleted, false if not found
   */
  async delete(
    orgId: string,
    locationId: string,
    id: string
  ): Promise<boolean> {
    const result = await StaffAvailability.deleteOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete all availability entries for a staff member.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @returns Number of deleted documents
   */
  async deleteByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    const result = await StaffAvailability.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all availability entries for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await StaffAvailability.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all availability entries for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await StaffAvailability.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Count availability entries for a location.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of availability entries
   */
  async count(orgId: string, locationId: string): Promise<number> {
    return await StaffAvailability.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
  },

  /**
   * Count availability entries for a staff member.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff document ID
   * @returns Number of availability entries (0-7)
   */
  async countByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    return await StaffAvailability.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    });
  },
};
