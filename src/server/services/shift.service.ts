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
   * @param userId - Clerk user ID (for filtering)
   * @param staffId - Staff member ID
   * @param start - Proposed shift start time
   * @param end - Proposed shift end time
   * @param excludeShiftId - Optional shift ID to exclude (for updates)
   * @returns true if overlap exists, false otherwise
   */
  async checkOverlap(
    userId: string,
    staffId: string,
    start: Date,
    end: Date,
    excludeShiftId?: string
  ): Promise<boolean> {
    const query: Record<string, unknown> = {
      userId,
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
      data.userId,
      data.staffId,
      data.start,
      data.end
    );

    if (hasOverlap) {
      throw new Error("This shift overlaps with an existing shift for this staff member");
    }

    const doc = await Shift.create({
      userId: data.userId,
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
   * @param userId - Clerk user ID (ownership check)
   * @param shiftId - Shift document ID
   * @param data - Partial shift data to update
   * @returns Updated ShiftDTO or null if not found
   * @throws Error if updated shift would overlap with existing shift
   */
  async update(
    userId: string,
    shiftId: string,
    data: UpdateShiftInput
  ): Promise<ShiftDTO | null> {
    // First, get the existing shift to check ownership and get current values
    const existing = await Shift.findOne({ _id: shiftId, userId }).lean();
    if (!existing) return null;

    // Determine the effective start and end times
    const effectiveStart = data.start ?? existing.start;
    const effectiveEnd = data.end ?? existing.end;

    // Check for overlap with the new times (excluding self)
    const hasOverlap = await this.checkOverlap(
      userId,
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
      { _id: shiftId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toShiftDTO(doc);
  },

  /**
   * Delete a shift.
   * @param userId - Clerk user ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns true if deleted, false if not found
   */
  async delete(userId: string, shiftId: string): Promise<boolean> {
    const result = await Shift.deleteOne({ _id: shiftId, userId });
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
   * @param userId - Clerk user ID (ownership check)
   * @param shiftId - Shift document ID
   * @returns ShiftDTO or null if not found
   */
  async getById(userId: string, shiftId: string): Promise<ShiftDTO | null> {
    const doc = await Shift.findOne({ _id: shiftId, userId }).lean();
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
   * Delete all shifts for a user (for testing/cleanup).
   * @param userId - Clerk user ID
   * @returns Number of deleted documents
   */
  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await Shift.deleteMany({ userId });
    return result.deletedCount;
  },

  /**
   * Copy shifts from one schedule to another with adjusted dates.
   * Handles overlap detection - skips shifts that would conflict with existing ones.
   * @param userId - Clerk user ID (ownership check)
   * @param sourceScheduleId - Schedule ID to copy from
   * @param targetScheduleId - Schedule ID to copy to
   * @param dayOffset - Number of days to add to shift dates (e.g., 7 for next week)
   * @returns Object with count of created and skipped shifts
   */
  async copyShiftsToNewWeek(
    userId: string,
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
        userId,
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
        userId,
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
