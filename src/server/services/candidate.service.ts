import { StaffService } from "@/server/services/staff.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import {
  getDayOfWeek,
  calculateShiftDuration,
  combineDateTime,
  getWeekStart,
  getWeekEnd,
} from "@/lib/utils/date";
import type { StaffDTO } from "@/types/staff";
import type { StaffAvailabilityDTO } from "@/types/staff-availability";
import type { ShiftDTO } from "@/types/shift";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { CandidateDTO, SlotCandidates } from "@/types/candidate";

// ============================================================
// CandidateService - Sprint 3.5: Hard Filter Layer
// ============================================================
// Pure TypeScript service that filters valid staff candidates
// BEFORE the AI sees them. No OpenAI/LLM calls.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models directly
// - Calls existing services (StaffService, StaffAvailabilityService, etc.)
// - Applies pure filter functions on returned DTOs
// - Returns CandidateDTO[] (plain objects)
// ============================================================

// ============================================================
// Internal Pure Filter Functions
// ============================================================

/**
 * Filter staff to only those who have availability covering the slot.
 * Cross-references the staff list against availability records returned by
 * StaffAvailabilityService.getAvailableStaff().
 *
 * @param allStaff - All active staff for the location
 * @param availableStaff - Availability records covering the slot (already filtered by service)
 * @returns Filtered staff and a map of staffId -> availability preference
 */
function filterByAvailability(
  allStaff: StaffDTO[],
  availableStaff: StaffAvailabilityDTO[]
): { staff: StaffDTO[]; preferenceMap: Map<string, "preferred" | "available"> } {
  // Build a set of staff IDs who are available, plus their preference
  const preferenceMap = new Map<string, "preferred" | "available">();
  for (const avail of availableStaff) {
    // getAvailableStaff already excludes "unavailable", but be defensive
    if (avail.preference === "preferred" || avail.preference === "available") {
      preferenceMap.set(avail.staffId, avail.preference);
    }
  }

  const staff = allStaff.filter((s) => preferenceMap.has(s.id));
  return { staff, preferenceMap };
}

/**
 * Remove staff who have approved time-off on the given date.
 *
 * @param staff - Staff to filter
 * @param staffIdsWithTimeOff - Set of staff IDs who have approved time off on the target date
 * @returns Staff who do NOT have approved time off
 */
function filterByTimeOff(
  staff: StaffDTO[],
  staffIdsWithTimeOff: Set<string>
): StaffDTO[] {
  return staff.filter((s) => !staffIdsWithTimeOff.has(s.id));
}

/**
 * Filter staff to only those who have a skill matching the required station.
 *
 * @param staff - Staff to filter
 * @param station - Required station name
 * @returns Staff who have a skill entry for the station
 */
function filterBySkills(staff: StaffDTO[], station: string): StaffDTO[] {
  return staff.filter((s) =>
    s.skills.some((skill) => skill.station === station)
  );
}

/**
 * Remove staff who already have a shift overlapping the proposed slot time range.
 * Uses Date-based overlap detection on existing ShiftDTO start/end.
 *
 * @param staff - Staff to filter
 * @param existingShifts - All existing shifts for the relevant period
 * @param proposedStart - Proposed slot start as Date
 * @param proposedEnd - Proposed slot end as Date
 * @returns Staff who do NOT have an overlapping shift
 */
function filterByExistingShifts(
  staff: StaffDTO[],
  existingShifts: ShiftDTO[],
  proposedStart: Date,
  proposedEnd: Date
): StaffDTO[] {
  // Group shifts by staffId for efficient lookup
  const shiftsByStaff = new Map<string, ShiftDTO[]>();
  for (const shift of existingShifts) {
    const staffShifts = shiftsByStaff.get(shift.staffId) ?? [];
    staffShifts.push(shift);
    shiftsByStaff.set(shift.staffId, staffShifts);
  }

  return staff.filter((s) => {
    const staffShifts = shiftsByStaff.get(s.id);
    if (!staffShifts || staffShifts.length === 0) return true;

    // Check if any existing shift overlaps with the proposed slot
    // Overlap: existing.start < proposed.end AND existing.end > proposed.start
    const hasOverlap = staffShifts.some((shift) => {
      const shiftStart = new Date(shift.start);
      const shiftEnd = new Date(shift.end);
      return shiftStart < proposedEnd && shiftEnd > proposedStart;
    });

    return !hasOverlap;
  });
}

/**
 * Calculate total hours each staff member has scheduled in the current week.
 *
 * @param staffIds - Set of staff IDs to calculate for
 * @param existingShifts - All existing shifts (should cover the full week)
 * @param weekStart - Monday 00:00 of the target week
 * @param weekEnd - Sunday 23:59 of the target week
 * @returns Map of staffId -> total hours scheduled in the week
 */
function calculateWeekHours(
  staffIds: Set<string>,
  existingShifts: ShiftDTO[],
  weekStart: Date,
  weekEnd: Date
): Map<string, number> {
  const hoursMap = new Map<string, number>();

  // Initialize all staff to 0 hours
  for (const id of staffIds) {
    hoursMap.set(id, 0);
  }

  for (const shift of existingShifts) {
    if (!staffIds.has(shift.staffId)) continue;

    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);

    // Only count shifts within the week bounds
    if (shiftStart >= weekStart && shiftEnd <= weekEnd) {
      const duration = calculateShiftDuration(shiftStart, shiftEnd);
      const current = hoursMap.get(shift.staffId) ?? 0;
      hoursMap.set(shift.staffId, current + duration);
    }
  }

  return hoursMap;
}

const DEFAULT_CLOPENING_THRESHOLD_HOURS = 10;

/**
 * Remove staff who closed the previous day and would start too soon
 * (less than the configured gap). This prevents clopening
 * at the hard-filter level rather than relying on AI/solver avoidance.
 *
 * When `allowClopening` is true, skips filtering entirely.
 */
function filterByClopening(
  staff: StaffDTO[],
  previousDayClosingShifts: ShiftDTO[],
  slotStartTime: string,
  clopeningSettings?: { allowClopening: boolean; minHoursBetweenShifts: number; clopeningWarningThresholdHours: number },
): StaffDTO[] {
  if (clopeningSettings?.allowClopening) return staff;
  if (previousDayClosingShifts.length === 0) return staff;

  const thresholdHours = clopeningSettings?.minHoursBetweenShifts ?? DEFAULT_CLOPENING_THRESHOLD_HOURS;

  const closingByStaff = new Map<string, Date>();
  for (const shift of previousDayClosingShifts) {
    const existing = closingByStaff.get(shift.staffId);
    const shiftEnd = new Date(shift.end);
    if (!existing || shiftEnd > existing) {
      closingByStaff.set(shift.staffId, shiftEnd);
    }
  }

  const [openH, openM] = slotStartTime.split(":").map(Number);
  const openingMinutes = openH * 60 + openM;

  return staff.filter((s) => {
    const closingEnd = closingByStaff.get(s.id);
    if (!closingEnd) return true;

    const closingEndMinutes =
      closingEnd.getHours() * 60 + closingEnd.getMinutes();
    const minutesRemainingInDay = 24 * 60 - closingEndMinutes;
    const gapMinutes = minutesRemainingInDay + openingMinutes;
    const gapHours = gapMinutes / 60;

    return gapHours >= thresholdHours;
  });
}

/**
 * Determine the duration of a proposed shift in hours from HH:MM time strings.
 *
 * @param startTime - Start time in HH:MM format
 * @param endTime - End time in HH:MM format
 * @returns Duration in hours
 */
function getSlotDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return (endMinutes - startMinutes) / 60;
}

// ============================================================
// CandidateService - Public API
// ============================================================

/**
 * CandidateService - Service layer for candidate filtering (Hard Filter Layer).
 *
 * Implements the "Hard Filter" step of the hybrid AI scheduling approach.
 * Filters staff to ONLY those who are VALID for a given slot:
 * - Available (recurring weekly availability covers the slot)
 * - No approved time-off on the shift date
 * - Has the required skill/station
 * - Not already scheduled for an overlapping shift
 *
 * Returns CandidateDTO objects with relevant context for the AI layer.
 *
 * This service is PURE TypeScript -- no OpenAI calls.
 * Per ARCHITECTURE.md, it lives in the Service Layer and calls other services
 * (never imports Mongoose models directly).
 */
export const CandidateService = {
  /**
   * Get valid candidates for a specific time slot.
   * This is the core "Hard Filter" -- removes anyone who CAN'T work the slot.
   *
   * Filter pipeline:
   * 1. Get all active staff for the location
   * 2. Filter by availability (recurring weekly pattern covers the slot)
   * 3. Filter by time-off (no approved time off on the date)
   * 4. Filter by skills (has a skill for the required station)
   * 5. Filter by existing shifts (no overlapping shifts)
   * 6. Calculate week hours and overtime warning flag
   *
   * @param orgId - Organization ID (multi-tenancy scoping)
   * @param locationId - Location ID (multi-tenancy scoping)
   * @param date - The target date for the slot
   * @param startTime - Slot start time in HH:MM format
   * @param endTime - Slot end time in HH:MM format
   * @param station - Required station for the slot
   * @param existingShifts - Pre-fetched shifts for the week (avoids redundant DB queries)
   * @returns Array of CandidateDTO sorted by preference (preferred first) then proficiency (highest first)
   */
  async getCandidatesForSlot(
    orgId: string,
    locationId: string,
    date: Date,
    startTime: string,
    endTime: string,
    station: string,
    existingShifts: ShiftDTO[]
  ): Promise<CandidateDTO[]> {
    const dayOfWeek = getDayOfWeek(date);
    const proposedStart = combineDateTime(date, startTime);
    const proposedEnd = combineDateTime(date, endTime);
    const slotDuration = getSlotDurationHours(startTime, endTime);
    const weekStart = getWeekStart(date);
    const weekEnd = getWeekEnd(date);

    // Step 1: Fetch all active staff and availability data in parallel
    const [allStaff, availableStaff] = await Promise.all([
      StaffService.list(orgId, locationId),
      StaffAvailabilityService.getAvailableStaff(
        orgId,
        locationId,
        dayOfWeek,
        startTime,
        endTime
      ),
    ]);

    // Only consider active staff
    const activeStaff = allStaff.filter((s) => s.isActive);

    // Step 2: Filter by availability
    const { staff: availableFiltered, preferenceMap } = filterByAvailability(
      activeStaff,
      availableStaff
    );

    // Step 3: Filter by time-off (single batch query instead of per-staff)
    const staffIdsWithTimeOff =
      await TimeOffRequestService.getStaffIdsWithApprovedTimeOff(
        orgId,
        locationId,
        date
      );
    const afterTimeOff = filterByTimeOff(availableFiltered, staffIdsWithTimeOff);

    // Step 4: Filter by skills
    const afterSkills = filterBySkills(afterTimeOff, station);

    // Step 5: Filter by existing shifts (no overlapping shifts)
    const afterShifts = filterByExistingShifts(
      afterSkills,
      existingShifts,
      proposedStart,
      proposedEnd
    );

    // Step 6: Calculate week hours and build CandidateDTOs
    const candidateStaffIds = new Set(afterShifts.map((s) => s.id));
    const weekHoursMap = calculateWeekHours(
      candidateStaffIds,
      existingShifts,
      weekStart,
      weekEnd
    );

    const allCandidates: CandidateDTO[] = afterShifts.map((s) => {
      const currentWeekHours = weekHoursMap.get(s.id) ?? 0;
      const overtimeWarning =
        currentWeekHours + slotDuration > s.maxHoursPerWeek;
      const preference = preferenceMap.get(s.id) ?? "available";

      return {
        staffId: s.id,
        staffName: s.name,
        skills: s.skills.map((sk) => ({
          station: sk.station,
          proficiency: sk.proficiency,
        })),
        preference,
        currentWeekHours,
        maxHoursPerWeek: s.maxHoursPerWeek,
        minHoursPerWeek: s.minHoursPerWeek,
        overtimeWarning,
        preferredStations: s.preferredStations,
      };
    });

    // Hard-filter: exclude candidates who would exceed max hours.
    // The validator rejects these 100% of the time as "max_hours_exceeded",
    // so including them only wastes prompt tokens and causes unfixable errors.
    const candidates = allCandidates.filter((c) => !c.overtimeWarning);

    // Sort: preferred first, then by proficiency for the target station (highest first)
    candidates.sort((a, b) => {
      // 1. Preference: "preferred" before "available"
      if (a.preference !== b.preference) {
        return a.preference === "preferred" ? -1 : 1;
      }

      // 2. Proficiency for the target station (highest first)
      const aProficiency =
        a.skills.find((sk) => sk.station === station)?.proficiency ?? 0;
      const bProficiency =
        b.skills.find((sk) => sk.station === station)?.proficiency ?? 0;
      if (bProficiency !== aProficiency) {
        return bProficiency - aProficiency;
      }

      // 3. Alphabetical by name as tiebreaker
      return a.staffName.localeCompare(b.staffName);
    });

    return candidates;
  },

  /**
   * Get candidates for all open slots in a day.
   * Used for day-by-day generation (chunking strategy).
   *
   * Optimization: Fetches all data ONCE (staff, availability, time-off, shifts)
   * then runs pure filter functions per slot to avoid N+1 query patterns.
   *
   * @param orgId - Organization ID (multi-tenancy scoping)
   * @param locationId - Location ID (multi-tenancy scoping)
   * @param date - The target date
   * @param laborRequirements - Labor requirements for this day (from LaborRequirementService)
   * @param existingShifts - Pre-fetched shifts for the week
   * @param precomputedWeekHours - Optional pre-computed week hours map (avoids recalculation)
   * @param previousDayClosingShifts - Closing shifts from previous day for clopening hard filter
   * @param clopeningSettings - Optional clopening policy from schedule generation settings
   * @returns Array of SlotCandidates, one per labor requirement
   */
  async getCandidatesForDay(
    orgId: string,
    locationId: string,
    date: Date,
    laborRequirements: LaborRequirementDTO[],
    existingShifts: ShiftDTO[],
    precomputedWeekHours?: Map<string, number>,
    previousDayClosingShifts: ShiftDTO[] = [],
    clopeningSettings?: { allowClopening: boolean; minHoursBetweenShifts: number; clopeningWarningThresholdHours: number },
  ): Promise<SlotCandidates[]> {
    if (laborRequirements.length === 0) {
      return [];
    }

    const dayOfWeek = getDayOfWeek(date);
    const weekStart = getWeekStart(date);
    const weekEnd = getWeekEnd(date);

    // Batch fetch: all staff + all availability for this day of week
    const [allStaff, dayAvailability] = await Promise.all([
      StaffService.list(orgId, locationId),
      StaffAvailabilityService.getByDayOfWeek(orgId, locationId, dayOfWeek),
    ]);

    const activeStaff = allStaff.filter((s) => s.isActive);

    // Single batch query: fetch all staff IDs with approved time-off on this date
    const staffIdsWithTimeOff =
      await TimeOffRequestService.getStaffIdsWithApprovedTimeOff(
        orgId,
        locationId,
        date
      );

    // Use pre-computed week hours if provided, otherwise calculate from shifts
    const allStaffIds = new Set(activeStaff.map((s) => s.id));
    const weekHoursMap = precomputedWeekHours ?? calculateWeekHours(
      allStaffIds,
      existingShifts,
      weekStart,
      weekEnd
    );

    // Process each labor requirement slot
    const results: SlotCandidates[] = laborRequirements.map((req) => {
      const proposedStart = combineDateTime(date, req.startTime);
      const proposedEnd = combineDateTime(date, req.endTime);
      const slotDuration = getSlotDurationHours(req.startTime, req.endTime);

      // Filter 1: Availability -- find staff whose single daily availability window covers this slot
      // Each staff member has at most one availability record per day with a continuous time range
      const slotAvailability = dayAvailability.filter(
        (avail) =>
          avail.preference !== "unavailable" &&
          avail.availableFrom !== null &&
          avail.availableTo !== null &&
          avail.availableFrom <= req.startTime &&
          avail.availableTo >= req.endTime
      );

      const { staff: availableFiltered, preferenceMap } =
        filterByAvailability(activeStaff, slotAvailability);

      // Filter 2: Time-off
      const afterTimeOff = filterByTimeOff(
        availableFiltered,
        staffIdsWithTimeOff
      );

      // Filter 3: Skills
      const afterSkills = filterBySkills(afterTimeOff, req.station);

      // Filter 4: Existing shifts overlap
      const afterShifts = filterByExistingShifts(
        afterSkills,
        existingShifts,
        proposedStart,
        proposedEnd
      );

      // Filter 5: Clopening -- remove staff who closed previous day with insufficient gap
      const afterClopening = filterByClopening(
        afterShifts,
        previousDayClosingShifts,
        req.startTime,
        clopeningSettings,
      );

      // Build CandidateDTOs
      const allCandidates: CandidateDTO[] = afterClopening.map((s) => {
        const currentWeekHours = weekHoursMap.get(s.id) ?? 0;
        const overtimeWarning =
          currentWeekHours + slotDuration > s.maxHoursPerWeek;
        const preference = preferenceMap.get(s.id) ?? "available";

        return {
          staffId: s.id,
          staffName: s.name,
          skills: s.skills.map((sk) => ({
            station: sk.station,
            proficiency: sk.proficiency,
          })),
          preference,
          currentWeekHours,
          maxHoursPerWeek: s.maxHoursPerWeek,
          minHoursPerWeek: s.minHoursPerWeek,
          overtimeWarning,
          preferredStations: s.preferredStations,
        };
      });

      // Hard-filter: exclude candidates who would exceed max hours.
      // The validator rejects these 100% of the time as "max_hours_exceeded",
      // so including them only wastes prompt tokens and causes unfixable errors.
      const candidates = allCandidates.filter((c) => !c.overtimeWarning);

      // Sort: preferred first, then proficiency for station
      candidates.sort((a, b) => {
        if (a.preference !== b.preference) {
          return a.preference === "preferred" ? -1 : 1;
        }
        const aProficiency =
          a.skills.find((sk) => sk.station === req.station)?.proficiency ?? 0;
        const bProficiency =
          b.skills.find((sk) => sk.station === req.station)?.proficiency ?? 0;
        if (bProficiency !== aProficiency) {
          return bProficiency - aProficiency;
        }
        return a.staffName.localeCompare(b.staffName);
      });

      return {
        slot: {
          station: req.station,
          startTime: req.startTime,
          endTime: req.endTime,
          minStaff: req.minStaff,
          preferredStaff: req.preferredStaff,
          priority: req.priority,
        },
        candidates,
        hasSufficientCandidates: candidates.length >= req.minStaff,
      };
    });

    return results;
  },

  /**
   * Check if assigning a shift would cause overtime for a staff member.
   * Compares current week hours + proposed shift duration against the max hours limit.
   *
   * @param staffId - Staff member ID
   * @param proposedShift - The proposed shift details
   * @param proposedShift.date - Date of the proposed shift
   * @param proposedShift.startTime - Start time in HH:MM format
   * @param proposedShift.endTime - End time in HH:MM format
   * @param existingShifts - All existing shifts for the relevant period
   * @param maxHours - Maximum allowed hours per week for this staff member
   * @returns True if the proposed shift would push the staff member over maxHours
   */
  wouldCauseOvertime(
    staffId: string,
    proposedShift: { date: Date; startTime: string; endTime: string },
    existingShifts: ShiftDTO[],
    maxHours: number
  ): boolean {
    const weekStart = getWeekStart(proposedShift.date);
    const weekEnd = getWeekEnd(proposedShift.date);

    // Calculate current week hours for this staff member
    const hoursMap = calculateWeekHours(
      new Set([staffId]),
      existingShifts,
      weekStart,
      weekEnd
    );

    const currentHours = hoursMap.get(staffId) ?? 0;
    const proposedDuration = getSlotDurationHours(
      proposedShift.startTime,
      proposedShift.endTime
    );

    return currentHours + proposedDuration > maxHours;
  },
};
