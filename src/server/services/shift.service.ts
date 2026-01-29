import Shift from "@/server/models/Shift";
import { ShiftDTO, CreateShiftInput, UpdateShiftInput, toShiftDTO } from "@/types/shift";
import { Types } from "mongoose";

/**
 * ShiftService - Service layer for Shift operations.
 * This is the ONLY place that imports and interacts with the Shift Mongoose model.
 */
export const ShiftService = {
  /**
   * Check if a shift would overlap with existing shifts for a staff member.
   * Two shifts overlap if: (A.start < B.end) AND (A.end > B.start)
   * @param orgId - Organization ID (for filtering)
   * @param locationId - Location ID (for filtering)
   * @param staffId - Staff member ID
   * @param start - Proposed shift start time
   * @param end - Proposed shift end time
   * @param excludeShiftId - Optional shift ID to exclude (for updates)
   * @returns true if overlap exists, false otherwise
   */
  async checkOverlap(
    orgId: string,
    locationId: string,
    staffId: string,
    start: Date,
    end: Date,
    excludeShiftId?: string
  ): Promise<boolean> {
    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      start: { $lt: end },
      end: { $gt: start },
    };

    // Exclude the current shift when updating
    if (excludeShiftId) {
      query._id = { $ne: new Types.ObjectId(excludeShiftId) };
    }

    const overlap = await Shift.findOne(query).lean();
    return overlap !== null;
  },

  /**
   * Create a new shift.
   * @param data - Shift creation data
   * @returns Created ShiftDTO
   * @throws Error if shift overlaps with existing shift
   */
  async create(data: CreateShiftInput): Promise<ShiftDTO> {
    // Check for overlap before creating
    const hasOverlap = await this.checkOverlap(
      data.orgId,
      data.locationId,
      data.staffId,
      data.start,
      data.end
    );

    if (hasOverlap) {
      throw new Error("This shift overlaps with an existing shift for this staff member");
    }

    const doc = await Shift.create({
      orgId: new Types.ObjectId(data.orgId),
      locationId: new Types.ObjectId(data.locationId),
      scheduleId: new Types.ObjectId(data.scheduleId),
      staffId: new Types.ObjectId(data.staffId),
      start: data.start,
      end: data.end,
      station: data.station,
      notes: data.notes || "",
    });

    return toShiftDTO(doc.toObject());
  },

  /**
   * Update an existing shift.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @param data - Partial shift data to update
   * @returns Updated ShiftDTO or null if not found
   * @throws Error if updated shift would overlap with existing shift
   */
  async update(
    orgId: string,
    locationId: string,
    shiftId: string,
    data: UpdateShiftInput
  ): Promise<ShiftDTO | null> {
    // First, get the existing shift to check ownership and get current values
    const existing = await Shift.findOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!existing) return null;

    // Determine the effective start and end times
    const effectiveStart = data.start ?? existing.start;
    const effectiveEnd = data.end ?? existing.end;

    // Check for overlap with the new times (excluding self)
    const hasOverlap = await this.checkOverlap(
      orgId,
      locationId,
      String(existing.staffId),
      effectiveStart,
      effectiveEnd,
      shiftId
    );

    if (hasOverlap) {
      throw new Error("This shift overlaps with an existing shift for this staff member");
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (data.start !== undefined) updateData.start = data.start;
    if (data.end !== undefined) updateData.end = data.end;
    if (data.station !== undefined) updateData.station = data.station;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const doc = await Shift.findOneAndUpdate(
      {
        _id: shiftId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toShiftDTO(doc);
  },

  /**
   * Delete a shift.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns true if deleted, false if not found
   */
  async delete(
    orgId: string,
    locationId: string,
    shiftId: string
  ): Promise<boolean> {
    const result = await Shift.deleteOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Get all shifts for a schedule.
   * @param scheduleId - Schedule document ID
   * @returns Array of ShiftDTOs
   */
  async getBySchedule(scheduleId: string): Promise<ShiftDTO[]> {
    const docs = await Shift.find({
      scheduleId: new Types.ObjectId(scheduleId),
    })
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get shifts for a staff member within a date range.
   * @param staffId - Staff member ID
   * @param start - Range start (inclusive)
   * @param end - Range end (inclusive)
   * @returns Array of ShiftDTOs
   */
  async getByStaffAndDateRange(
    staffId: string,
    start: Date,
    end: Date
  ): Promise<ShiftDTO[]> {
    const docs = await Shift.find({
      staffId: new Types.ObjectId(staffId),
      start: { $gte: start },
      end: { $lte: end },
    })
      .sort({ start: 1 })
      .lean();

    return docs.map(toShiftDTO);
  },

  /**
   * Get a single shift by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns ShiftDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    shiftId: string
  ): Promise<ShiftDTO | null> {
    const doc = await Shift.findOne({
      _id: shiftId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();
    if (!doc) return null;
    return toShiftDTO(doc);
  },

  /**
   * Delete all shifts for a schedule.
   * @param scheduleId - Schedule document ID
   * @returns Number of deleted documents
   */
  async deleteBySchedule(scheduleId: string): Promise<number> {
    const result = await Shift.deleteMany({
      scheduleId: new Types.ObjectId(scheduleId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all shifts for a specific staff member.
   * Used when a staff member is permanently deleted to cascade the deletion.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param staffId - Staff member ID
   * @returns Number of deleted documents
   */
  async deleteByStaffId(
    orgId: string,
    locationId: string,
    staffId: string
  ): Promise<number> {
    const result = await Shift.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      staffId: new Types.ObjectId(staffId),
    });
    return result.deletedCount;
  },

  /**
   * Count shifts that reference specific stations.
   * Used for informational purposes when removing stations from kitchen config.
   * Historical shifts are NOT modified - this is just to inform the user.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param stations - Array of station names to count
   * @returns Number of shifts referencing any of the specified stations
   */
  async countByStations(
    orgId: string,
    locationId: string,
    stations: string[]
  ): Promise<number> {
    if (stations.length === 0) return 0;

    return await Shift.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      station: { $in: stations },
    });
  },

  /**
   * Copy shifts from one schedule to another with adjusted dates.
   * Handles overlap detection - skips shifts that would conflict with existing ones.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param sourceScheduleId - Schedule ID to copy from
   * @param targetScheduleId - Schedule ID to copy to
   * @param dayOffset - Number of days to add to shift dates (e.g., 7 for next week)
   * @returns Object with count of created and skipped shifts
   */
  async copyShiftsToNewWeek(
    orgId: string,
    locationId: string,
    sourceScheduleId: string,
    targetScheduleId: string,
    dayOffset: number
  ): Promise<{ created: number; skipped: number }> {
    // Get all shifts from source schedule
    const sourceShifts = await this.getBySchedule(sourceScheduleId);

    let created = 0;
    let skipped = 0;

    for (const sourceShift of sourceShifts) {
      // Calculate new dates by adding the day offset
      const newStart = new Date(sourceShift.start);
      newStart.setDate(newStart.getDate() + dayOffset);

      const newEnd = new Date(sourceShift.end);
      newEnd.setDate(newEnd.getDate() + dayOffset);

      // Check if this shift would overlap with existing shifts in target schedule
      const hasOverlap = await this.checkOverlap(
        orgId,
        locationId,
        sourceShift.staffId,
        newStart,
        newEnd
      );

      if (hasOverlap) {
        // Skip this shift due to conflict
        skipped++;
        continue;
      }

      // Create the new shift in the target schedule
      await Shift.create({
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
        scheduleId: new Types.ObjectId(targetScheduleId),
        staffId: new Types.ObjectId(sourceShift.staffId),
        start: newStart,
        end: newEnd,
        station: sourceShift.station,
        notes: sourceShift.notes || "",
      });

      created++;
    }

    return { created, skipped };
  },
};
