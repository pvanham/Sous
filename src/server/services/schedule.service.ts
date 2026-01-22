import Schedule from "@/server/models/Schedule";
import { ScheduleDTO, ScheduleStatus, toScheduleDTO } from "@/types/schedule";

/**
 * ScheduleService - Service layer for Schedule operations.
 * This is the ONLY place that imports and interacts with the Schedule Mongoose model.
 */
export const ScheduleService = {
  /**
   * Get or create a schedule for a specific week.
   * @param userId - Clerk user ID (restaurant owner)
   * @param weekStartDate - Monday of the week
   * @returns ScheduleDTO
   */
  async getOrCreateForWeek(userId: string, weekStartDate: Date): Promise<ScheduleDTO> {
    // Normalize to start of day
    const normalizedDate = new Date(weekStartDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Try to find existing schedule
    let doc = await Schedule.findOne({
      userId,
      weekStartDate: normalizedDate,
    }).lean();

    // If not found, create a new one
    if (!doc) {
      const newSchedule = await Schedule.create({
        userId,
        weekStartDate: normalizedDate,
        status: "DRAFT",
        notes: "",
      });
      doc = newSchedule.toObject();
    }

    return toScheduleDTO(doc);
  },

  /**
   * Get a schedule by week start date.
   * @param userId - Clerk user ID (ownership check)
   * @param weekStartDate - Monday of the week
   * @returns ScheduleDTO or null if not found
   */
  async getByWeek(userId: string, weekStartDate: Date): Promise<ScheduleDTO | null> {
    // Normalize to start of day
    const normalizedDate = new Date(weekStartDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const doc = await Schedule.findOne({
      userId,
      weekStartDate: normalizedDate,
    }).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Get a schedule by ID.
   * @param userId - Clerk user ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @returns ScheduleDTO or null if not found
   */
  async getById(userId: string, scheduleId: string): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOne({
      _id: scheduleId,
      userId,
    }).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Update schedule status.
   * @param userId - Clerk user ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @param status - New status (DRAFT or PUBLISHED)
   * @returns Updated ScheduleDTO or null if not found
   */
  async updateStatus(
    userId: string,
    scheduleId: string,
    status: ScheduleStatus
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOneAndUpdate(
      { _id: scheduleId, userId },
      { $set: { status } },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Update schedule notes.
   * @param userId - Clerk user ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @param notes - New notes content
   * @returns Updated ScheduleDTO or null if not found
   */
  async updateNotes(
    userId: string,
    scheduleId: string,
    notes: string
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOneAndUpdate(
      { _id: scheduleId, userId },
      { $set: { notes } },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Delete a schedule and all associated shifts.
   * @param userId - Clerk user ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @returns true if deleted, false if not found
   */
  async delete(userId: string, scheduleId: string): Promise<boolean> {
    const result = await Schedule.deleteOne({ _id: scheduleId, userId });
    return result.deletedCount > 0;
  },

  /**
   * Delete all schedules for a user (for testing/cleanup).
   * @param userId - Clerk user ID
   * @returns Number of deleted documents
   */
  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await Schedule.deleteMany({ userId });
    return result.deletedCount;
  },
};
