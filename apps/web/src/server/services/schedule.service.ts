import { Types } from "mongoose";
import Schedule from "@/server/models/Schedule";
import Shift from "@/server/models/Shift";
import { ScheduleDTO, ScheduleStatus, toScheduleDTO } from "@/types/schedule";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";
import type { KitchenConfigDTO } from "@/types/kitchen-config";
import {
  getWeekStart,
  getWeekDays,
  getStoreHoursForDay,
  formatFullDayLabel,
} from "@/lib/utils/date";
import { dayOfWeekToIndex } from "@sous/types";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { LocationService } from "@/server/services/location.service";
import { getDayOfWeekInTz } from "@/lib/utils/timezone";

/**
 * Manager coverage gap info for a specific day.
 */
export interface ManagerCoverageGap {
  day: string; // Human-readable day label
  gaps: { start: string; end: string }[]; // Array of gap periods
}

export type EffectiveScheduleStatus = "PUBLISHED" | "DRAFT" | "EMPTY";

/**
 * Check if a staff member has a manager role.
 * Matches case-insensitively against common manager role patterns.
 */
function isManager(staff: StaffDTO, managerRoles: string[]): boolean {
  if (managerRoles && managerRoles.length > 0) {
    return staff.roles.some((role) => managerRoles.includes(role));
  }
  
  // Fallback to strict hardcoded checks if no manager roles configured
  return staff.roles.some(
    (role) =>
      role.toLowerCase().includes("manager") ||
      role.toLowerCase() === "gm" ||
      role.toLowerCase() === "km" ||
      role.toLowerCase() === "agm" ||
      role.toLowerCase() === "shift leader" ||
      role.toLowerCase() === "sous chef"
  );
}

/**
 * Find manager coverage gaps for a specific day.
 * Returns an array of time gaps where no manager is scheduled.
 */
function findManagerGapsForDay(
  shifts: ShiftDTO[],
  staff: StaffDTO[],
  storeOpen: string,
  storeClose: string,
  managerRoles: string[]
): { start: string; end: string }[] {
  // Get manager staff IDs
  const managerIds = new Set(staff.filter((s) => isManager(s, managerRoles)).map((s) => s.id));

  // Filter shifts to only manager shifts
  const managerShifts = shifts.filter((shift) => managerIds.has(shift.staffId));

  if (managerShifts.length === 0) {
    // No manager coverage at all
    return [{ start: storeOpen, end: storeClose }];
  }

  // Sort manager shifts by start time
  const sorted = [...managerShifts].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const gaps: { start: string; end: string }[] = [];

  // Convert store hours to minutes for easier comparison
  const [storeOpenHour, storeOpenMin] = storeOpen.split(":").map(Number);
  const [storeCloseHour, storeCloseMin] = storeClose.split(":").map(Number);
  const storeOpenMinutes = storeOpenHour * 60 + storeOpenMin;
  const storeCloseMinutes = storeCloseHour * 60 + storeCloseMin;

  // Track covered time ranges (merge overlapping shifts)
  interface TimeRange {
    start: number;
    end: number;
  }
  const coveredRanges: TimeRange[] = [];

  for (const shift of sorted) {
    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);
    const startMinutes = shiftStart.getHours() * 60 + shiftStart.getMinutes();
    const endMinutes = shiftEnd.getHours() * 60 + shiftEnd.getMinutes();

    // Clamp shift to store hours
    const clampedStart = Math.max(startMinutes, storeOpenMinutes);
    const clampedEnd = Math.min(endMinutes, storeCloseMinutes);

    if (clampedStart >= clampedEnd) continue; // Shift doesn't overlap with store hours

    // Try to merge with existing ranges
    let merged = false;
    for (const range of coveredRanges) {
      if (clampedStart <= range.end && clampedEnd >= range.start) {
        // Overlaps or adjacent, merge
        range.start = Math.min(range.start, clampedStart);
        range.end = Math.max(range.end, clampedEnd);
        merged = true;
        break;
      }
    }

    if (!merged) {
      coveredRanges.push({ start: clampedStart, end: clampedEnd });
    }
  }

  // Sort and merge any overlapping ranges that resulted from the merge step
  coveredRanges.sort((a, b) => a.start - b.start);
  const mergedRanges: TimeRange[] = [];
  for (const range of coveredRanges) {
    if (
      mergedRanges.length > 0 &&
      range.start <= mergedRanges[mergedRanges.length - 1].end
    ) {
      mergedRanges[mergedRanges.length - 1].end = Math.max(
        mergedRanges[mergedRanges.length - 1].end,
        range.end,
      );
    } else {
      mergedRanges.push({ ...range });
    }
  }

  // Find gaps between store open and covered ranges
  let currentTime = storeOpenMinutes;
  for (const range of mergedRanges) {
    if (range.start > currentTime) {
      // There's a gap from currentTime to range.start
      const gapStartHour = Math.floor(currentTime / 60);
      const gapStartMin = currentTime % 60;
      const gapEndHour = Math.floor(range.start / 60);
      const gapEndMin = range.start % 60;
      gaps.push({
        start: `${String(gapStartHour).padStart(2, "0")}:${String(gapStartMin).padStart(2, "0")}`,
        end: `${String(gapEndHour).padStart(2, "0")}:${String(gapEndMin).padStart(2, "0")}`,
      });
    }
    currentTime = Math.max(currentTime, range.end);
  }

  // Check for gap at the end of the day
  if (currentTime < storeCloseMinutes) {
    const gapStartHour = Math.floor(currentTime / 60);
    const gapStartMin = currentTime % 60;
    gaps.push({
      start: `${String(gapStartHour).padStart(2, "0")}:${String(gapStartMin).padStart(2, "0")}`,
      end: storeClose,
    });
  }

  return gaps;
}

/**
 * Throws if the supplied date does not fall on the location's
 * configured `weekStartsOn` calendar day, interpreted in the location's
 * timezone. Used by every code path that reads or writes a Schedule
 * by week-start so a stale URL or AI-supplied date can never silently
 * land on a non-canonical week.
 *
 * Exported so the manager-facing actions (which run their own
 * week-bounded queries before touching the Schedule collection) can
 * share the same TZ-aware check — otherwise a server in UTC and a
 * developer's laptop in PDT would disagree on what "Monday" means.
 */
export async function assertWeekStartAligned(
  orgId: string,
  locationId: string,
  weekStartDate: Date,
): Promise<void> {
  const [weekStartsOn, location] = await Promise.all([
    KitchenConfigService.getWeekStartsOn(orgId, locationId),
    LocationService.getById(locationId),
  ]);
  const tz = location?.timezone ?? "UTC";
  const expectedDayIndex = dayOfWeekToIndex(weekStartsOn);
  if (getDayOfWeekInTz(weekStartDate, tz) !== expectedDayIndex) {
    throw new Error(
      `Schedule week must start on ${weekStartsOn} for this location.`,
    );
  }
}

/**
 * ScheduleService - Service layer for Schedule operations.
 * This is the ONLY place that imports and interacts with the Schedule Mongoose model.
 */
export const ScheduleService = {
  /**
   * Get or create a schedule for a specific week. Write path — call
   * from a flow that intends to mutate (add shift, generate, copy,
   * publish from a clean slate). Read paths should use `getByWeek`
   * so they don't pollute the collection with empty draft docs.
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param weekStartDate - The week-start date (must align to the location's
   *                       configured `weekStartsOn`; default Monday)
   * @returns ScheduleDTO
   */
  async getOrCreateForWeek(
    orgId: string,
    locationId: string,
    weekStartDate: Date,
  ): Promise<ScheduleDTO> {
    // Normalize to start of day
    const normalizedDate = new Date(weekStartDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Enforce the per-location week-start alignment. The Mongoose model
    // dropped its hardcoded "Monday" validator (alignment is now per
    // location), so this is the single source of truth before insertion.
    await assertWeekStartAligned(orgId, locationId, normalizedDate);

    const orgObjectId = new Types.ObjectId(orgId);
    const locationObjectId = new Types.ObjectId(locationId);

    // Try to find existing schedule
    let doc = await Schedule.findOne({
      orgId: orgObjectId,
      locationId: locationObjectId,
      weekStartDate: normalizedDate,
    }).lean();

    // If not found, create a new one
    if (!doc) {
      const newSchedule = await Schedule.create({
        orgId: orgObjectId,
        locationId: locationObjectId,
        weekStartDate: normalizedDate,
        status: "DRAFT",
        notes: "",
      });
      doc = newSchedule.toObject();
    }

    return toScheduleDTO(doc);
  },

  /**
   * Get a schedule by week start date. Read-only — never side-effect-
   * creates a new doc. Validates the date against the location's
   * `weekStartsOn` so a misaligned input returns a clear error rather
   * than silently returning `null` (and tricking the caller into a
   * "no schedule yet" branch they'd never get out of).
   *
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param weekStartDate - The week-start date (must align to weekStartsOn)
   * @returns ScheduleDTO or null if not found
   */
  async getByWeek(
    orgId: string,
    locationId: string,
    weekStartDate: Date,
  ): Promise<ScheduleDTO | null> {
    // Normalize to start of day
    const normalizedDate = new Date(weekStartDate);
    normalizedDate.setHours(0, 0, 0, 0);

    await assertWeekStartAligned(orgId, locationId, normalizedDate);

    const doc = await Schedule.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      weekStartDate: normalizedDate,
    }).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Get the most recent schedule for a location.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @returns Most recent ScheduleDTO by weekStartDate, or null if none exist
   */
  async getMostRecent(
    orgId: string,
    locationId: string,
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    })
      .sort({ weekStartDate: -1 })
      .lean();

    if (!doc) {
      const weekStartsOn = await KitchenConfigService.getWeekStartsOn(
        orgId,
        locationId,
      );
      const weekStart = getWeekStart(new Date(), weekStartsOn);
      return this.getOrCreateForWeek(orgId, locationId, weekStart);
    }
    return toScheduleDTO(doc);
  },

  /**
   * Get a schedule by ID.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @returns ScheduleDTO or null if not found
   */
  async getById(
    orgId: string,
    locationId: string,
    scheduleId: string,
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOne({
      _id: scheduleId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Update schedule status.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @param status - New status (DRAFT or PUBLISHED)
   * @returns Updated ScheduleDTO or null if not found
   */
  async updateStatus(
    orgId: string,
    locationId: string,
    scheduleId: string,
    status: ScheduleStatus,
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOneAndUpdate(
      {
        _id: scheduleId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: { status } },
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Update schedule notes.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @param notes - New notes content
   * @returns Updated ScheduleDTO or null if not found
   */
  async updateNotes(
    orgId: string,
    locationId: string,
    scheduleId: string,
    notes: string,
  ): Promise<ScheduleDTO | null> {
    const doc = await Schedule.findOneAndUpdate(
      {
        _id: scheduleId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: { notes } },
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!doc) return null;
    return toScheduleDTO(doc);
  },

  /**
   * Delete a schedule and all associated shifts.
   * @param orgId - Organization ID (ownership check)
   * @param locationId - Location ID (ownership check)
   * @param scheduleId - Schedule document ID
   * @returns true if deleted, false if not found
   */
  async delete(
    orgId: string,
    locationId: string,
    scheduleId: string
  ): Promise<boolean> {
    const result = await Schedule.deleteOne({
      _id: scheduleId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Delete a schedule only when it has no shifts.
   * @returns true when deleted, false when skipped/not found.
   */
  async deleteIfEmpty(
    orgId: string,
    locationId: string,
    scheduleId: string,
  ): Promise<boolean> {
    const shiftCount = await Shift.countDocuments({
      scheduleId: new Types.ObjectId(scheduleId),
    });
    if (shiftCount > 0) return false;

    const result = await Schedule.deleteOne({
      _id: scheduleId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * List schedules for a location by week-start date range.
   */
  async listByWeekStartRange(
    orgId: string,
    locationId: string,
    start: Date,
    end: Date,
  ): Promise<ScheduleDTO[]> {
    const docs = await Schedule.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      weekStartDate: { $gte: start, $lt: end },
    }).lean();
    return docs.map(toScheduleDTO);
  },

  /**
   * Resolve the aggregate status for the visible location-week window.
   */
  async getEffectiveStatusForWeek(
    orgId: string,
    locationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<EffectiveScheduleStatus> {
    const scheduleIds = await Shift.distinct("scheduleId", {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      start: { $gte: weekStart, $lt: weekEnd },
    });

    if (scheduleIds.length === 0) return "EMPTY";

    const schedules = await Schedule.find(
      { _id: { $in: scheduleIds } },
      { status: 1 },
    ).lean();
    return schedules.every((s) => s.status === "PUBLISHED")
      ? "PUBLISHED"
      : "DRAFT";
  },

  /**
   * Delete all schedules for a location (for testing/cleanup).
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await Schedule.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Delete all schedules for an organization (for testing/cleanup).
   * @param orgId - Organization ID
   * @returns Number of deleted documents
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Schedule.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },

  /**
   * Validate manager coverage for a week's schedule.
   * Checks each day during store hours for manager coverage gaps.
   * @param weekStartDate - Monday of the week
   * @param shifts - All shifts for the week
   * @param staff - All staff members
   * @param config - Kitchen configuration with operating hours
   * @returns Array of ManagerCoverageGap for days with gaps
   */
  validateManagerCoverage(
    weekStartDate: Date,
    shifts: ShiftDTO[],
    staff: StaffDTO[],
    config: KitchenConfigDTO,
  ): ManagerCoverageGap[] {
    const warnings: ManagerCoverageGap[] = [];
    const weekDays = getWeekDays(weekStartDate, config.weekStartsOn);

    for (const day of weekDays) {
      // Get store hours for this day (without buffer)
      const storeHours = getStoreHoursForDay(config.operatingHours, day);

      // If store is closed on this day, skip
      if (!storeHours) continue;

      // Get shifts for this specific day
      const dayShifts = shifts.filter((shift) => {
        const shiftDay = new Date(shift.start);
        return (
          shiftDay.getFullYear() === day.getFullYear() &&
          shiftDay.getMonth() === day.getMonth() &&
          shiftDay.getDate() === day.getDate()
        );
      });

      // Find manager coverage gaps
      const gaps = findManagerGapsForDay(
        dayShifts,
        staff,
        storeHours.open,
        storeHours.close,
        config.managerRoles || []
      );

      if (gaps.length > 0) {
        warnings.push({
          day: formatFullDayLabel(day),
          gaps,
        });
      }
    }

    return warnings;
  },
};
