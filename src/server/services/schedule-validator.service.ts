import { generateJSON } from "@/lib/ai/openai-client";
import {
  AILimitExceededError,
  AIServiceUnavailableError,
} from "@/lib/ai/openai-client";
import { timeRangesOverlap } from "@/lib/utils/time-overlap";
import {
  buildOptimizerSystemPrompt,
  buildOptimizerCorrectionPrompt,
} from "@/server/services/ai/prompts/schedule-generation";
import type { OptimizerRejectionReason } from "@/server/services/ai/prompts/schedule-generation";
import { normalizeAIOutput } from "@/server/services/ai/scheduling-agent.service";
import type { StaffDTO } from "@/types/staff";
import type { ShiftDTO } from "@/types/shift";
import type { SlotCandidates, CandidateDTO } from "@/types/candidate";
import type { TokenUsage } from "@/types/ai-usage";
import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  AIRawDayOutput,
  UnfilledSlot,
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from "@/types/ai-scheduling";

// ============================================================
// ScheduleValidatorService -- Hybrid Architecture Validator
// ============================================================
// Deterministic validation of schedules against hard constraints,
// quality scoring for comparing base vs optimized schedules, and
// a retry loop that sends correction prompts to the AI optimizer.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models directly
// - Operates on DTOs only (GeneratedDaySchedule, StaffDTO, etc.)
// - Pure validation logic -- no database calls
// - Multi-tenancy context passed via DaySchedulingContext
// ============================================================

/** Maximum number of self-correction retry attempts */
const MAX_RETRY_ATTEMPTS = 1;

/** Quality score breakdown for debugging and comparison logging */
export interface QualityScoreBreakdown {
  total: number;
  preferredStationMatches: number;
  preferredStationCount: number;
  timePreferenceMatches: number;
  timePreferenceCount: number;
  hourBalancePenalty: number;
  unfilledPenalty: number;
  unfilledCount: number;
}

/** Threshold for overtime risk warning (percentage of maxHoursPerWeek) */
const OVERTIME_RISK_THRESHOLD = 0.8;

/** Minimum hours between closing and opening shifts to avoid clopening */
const CLOPENING_THRESHOLD_HOURS = 10;

// ────────────────────────────────────────────────────────────
// Internal: Tracking options for AI retry calls
// ────────────────────────────────────────────────────────────

interface ValidatorTrackingOptions {
  orgId: string;
  locationId: string;
  clerkUserId: string;
  action: "schedule_generation";
}

// ────────────────────────────────────────────────────────────
// Internal: Helper to calculate shift duration in hours
// ────────────────────────────────────────────────────────────

/**
 * Calculate duration in hours from HH:MM time strings.
 */
function getShiftDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

/**
 * Calculate total hours from existing ShiftDTOs (Date-based).
 */
function calculateExistingShiftHoursForStaff(
  staffId: string,
  existingShifts: ShiftDTO[]
): number {
  let totalHours = 0;
  for (const shift of existingShifts) {
    if (shift.staffId === staffId) {
      const durationMs =
        new Date(shift.end).getTime() - new Date(shift.start).getTime();
      totalHours += durationMs / (1000 * 60 * 60);
    }
  }
  return totalHours;
}

/**
 * Calculate total hours from proposed assignments (HH:MM-based).
 */
function calculateProposedHoursForStaff(
  staffId: string,
  assignments: GeneratedShiftAssignment[]
): number {
  let totalHours = 0;
  for (const assignment of assignments) {
    if (assignment.staffId === staffId) {
      totalHours += getShiftDurationHours(
        assignment.startTime,
        assignment.endTime
      );
    }
  }
  return totalHours;
}

// ────────────────────────────────────────────────────────────
// Internal: Build staff lookup map from context
// ────────────────────────────────────────────────────────────

/**
 * Build a Map of staffId -> StaffDTO from the slot candidates.
 * Since CandidateService already filtered, we extract staff info
 * from the candidate entries.
 */
function buildStaffMap(
  slots: SlotCandidates[]
): Map<string, { staffName: string; skills: Array<{ station: string; proficiency: number }>; maxHoursPerWeek: number; preferredStations: string[] }> {
  const map = new Map<
    string,
    {
      staffName: string;
      skills: Array<{ station: string; proficiency: number }>;
      maxHoursPerWeek: number;
      preferredStations: string[];
    }
  >();

  for (const { candidates } of slots) {
    for (const candidate of candidates) {
      if (!map.has(candidate.staffId)) {
        map.set(candidate.staffId, {
          staffName: candidate.staffName,
          skills: candidate.skills,
          maxHoursPerWeek: candidate.maxHoursPerWeek,
          preferredStations: candidate.preferredStations,
        });
      }
    }
  }

  return map;
}

/**
 * Build a Map of staffId -> Set of stations they are a valid candidate for.
 * This is per-slot, so we know which candidates are valid for which specific slots.
 */
function buildSlotCandidateMap(
  slots: SlotCandidates[]
): Map<string, Map<string, Set<string>>> {
  // slotKey -> Set of valid staffIds
  // slotKey = "station|startTime|endTime"
  const slotMap = new Map<string, Set<string>>();

  for (const { slot, candidates } of slots) {
    const slotKey = `${slot.station}|${slot.startTime}|${slot.endTime}`;
    const staffIds = new Set<string>();
    for (const candidate of candidates) {
      staffIds.add(candidate.staffId);
    }
    slotMap.set(slotKey, staffIds);
  }

  // Invert: staffId -> slotKey -> Set<station>
  // Actually, simpler: we return slotKey -> Set<staffIds>
  // But for the validator, we need: for a given assignment (station, startTime, endTime),
  // was the staffId a valid candidate for that specific slot?
  // Let's keep it as slotKey -> Set<staffIds>

  // Return as a nested structure: station -> timeKey -> Set<staffIds>
  const result = new Map<string, Map<string, Set<string>>>();
  for (const { slot, candidates } of slots) {
    const timeKey = `${slot.startTime}|${slot.endTime}`;
    if (!result.has(slot.station)) {
      result.set(slot.station, new Map());
    }
    const stationMap = result.get(slot.station)!;
    const staffIds = new Set<string>();
    for (const candidate of candidates) {
      staffIds.add(candidate.staffId);
    }
    stationMap.set(timeKey, staffIds);
  }

  return result;
}

// ============================================================
// ScheduleValidatorService -- Public API
// ============================================================

export const ScheduleValidatorService = {
  /**
   * Validate an AI-generated day schedule against all hard constraints.
   *
   * Checks performed (hard errors):
   * 1. invalid_staff_id: staffId not in any slot's candidate list
   * 2. double_booking: same staffId assigned to overlapping shifts same day
   * 3. unavailable_staff: staffId not in the SPECIFIC slot's candidate list
   * 4. max_hours_exceeded: weekly hours (existing + all proposed) exceed max
   * 5. skill_mismatch: staff lacks a skill entry for the assigned station
   * 6. overlap: assignment overlaps with an existing shift in context
   *
   * Warnings (soft issues):
   * - overtime_risk: staff would be above 80% of maxHoursPerWeek
   * - non_preferred_station: assigned to a non-preferred station
   * - clopening_risk: staff closed previous day and opens early (gap < 10h)
   *
   * @param generated - The AI-generated day schedule to validate
   * @param context - The day's scheduling context with candidates and existing shifts
   * @param allStaff - All active staff DTOs (for skill/hour lookups beyond candidates)
   * @returns ValidationResult with errors and warnings
   */
  validate(
    generated: GeneratedDaySchedule,
    context: DaySchedulingContext,
    allStaff: StaffDTO[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const { assignments } = generated;
    const { slots, existingShifts, previousDayClosingShifts } = context;

    // Build lookup structures
    const staffMap = buildStaffMap(slots);
    const slotCandidateMap = buildSlotCandidateMap(slots);

    // Also build a full staff map from allStaff for skill/hour lookups
    const fullStaffMap = new Map<string, StaffDTO>();
    for (const staff of allStaff) {
      fullStaffMap.set(staff.id, staff);
    }

    // All valid staff IDs across all slots
    const allValidStaffIds = new Set<string>();
    for (const { candidates } of slots) {
      for (const c of candidates) {
        allValidStaffIds.add(c.staffId);
      }
    }

    // ── Check 1: Invalid Staff ID ──────────────────────────
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      if (!allValidStaffIds.has(assignment.staffId)) {
        errors.push({
          type: "invalid_staff_id",
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          shiftIndex: i,
          message: `Staff "${assignment.staffName}" (${assignment.staffId}) is not a valid candidate for any slot on this day.`,
          correctionHint: `Remove ${assignment.staffName} from the schedule. They are not in any slot's candidate list. Choose a different staff member from the provided candidates.`,
        });
      }
    }

    // ── Check 2: Double Booking ────────────────────────────
    // Group assignments by staffId, then check for time overlaps
    const assignmentsByStaff = new Map<string, Array<{ index: number; assignment: GeneratedShiftAssignment }>>();
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const existing = assignmentsByStaff.get(assignment.staffId) ?? [];
      existing.push({ index: i, assignment });
      assignmentsByStaff.set(assignment.staffId, existing);
    }

    for (const [staffId, staffAssignments] of assignmentsByStaff) {
      for (let i = 0; i < staffAssignments.length; i++) {
        for (let j = i + 1; j < staffAssignments.length; j++) {
          const a = staffAssignments[i];
          const b = staffAssignments[j];
          if (
            timeRangesOverlap(
              a.assignment.startTime,
              a.assignment.endTime,
              b.assignment.startTime,
              b.assignment.endTime
            )
          ) {
            errors.push({
              type: "double_booking",
              staffId,
              staffName: a.assignment.staffName,
              shiftIndex: b.index,
              message: `Staff "${a.assignment.staffName}" is double-booked: ${a.assignment.station} ${a.assignment.startTime}-${a.assignment.endTime} overlaps with ${b.assignment.station} ${b.assignment.startTime}-${b.assignment.endTime}.`,
              correctionHint: `${a.assignment.staffName} is already assigned to ${a.assignment.station} ${a.assignment.startTime}-${a.assignment.endTime}. Remove or reassign the ${b.assignment.station} ${b.assignment.startTime}-${b.assignment.endTime} shift to a different staff member.`,
            });
          }
        }
      }
    }

    // ── Check 2b: Multiple Shifts Same Day ────────────────
    // A staff member must only have ONE shift per day.
    // This is stricter than double_booking (which only checks time overlap).
    for (const [staffId, staffAssignments] of assignmentsByStaff) {
      if (staffAssignments.length > 1) {
        // Keep the first assignment, flag the rest
        for (let k = 1; k < staffAssignments.length; k++) {
          const first = staffAssignments[0];
          const extra = staffAssignments[k];
          errors.push({
            type: "multiple_shifts_same_day",
            staffId,
            staffName: extra.assignment.staffName,
            shiftIndex: extra.index,
            message: `Staff "${extra.assignment.staffName}" is assigned ${staffAssignments.length} shifts on this day (only 1 allowed). Shifts: ${staffAssignments.map((a) => `${a.assignment.station} ${a.assignment.startTime}-${a.assignment.endTime}`).join(", ")}.`,
            correctionHint: `Keep ${first.assignment.staffName} on ${first.assignment.station} ${first.assignment.startTime}-${first.assignment.endTime} and assign a different staff member to ${extra.assignment.station} ${extra.assignment.startTime}-${extra.assignment.endTime}.`,
          });
        }
      }
    }

    // ── Check 3: Unavailable Staff (per-slot candidate check) ──
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      // Skip if already flagged as globally invalid
      if (!allValidStaffIds.has(assignment.staffId)) continue;

      const stationMap = slotCandidateMap.get(assignment.station);
      if (stationMap) {
        const timeKey = `${assignment.startTime}|${assignment.endTime}`;
        const validCandidates = stationMap.get(timeKey);
        if (validCandidates && !validCandidates.has(assignment.staffId)) {
          errors.push({
            type: "unavailable_staff",
            staffId: assignment.staffId,
            staffName: assignment.staffName,
            shiftIndex: i,
            message: `Staff "${assignment.staffName}" is not a valid candidate for ${assignment.station} ${assignment.startTime}-${assignment.endTime}.`,
            correctionHint: `${assignment.staffName} is not in the candidate list for ${assignment.station} ${assignment.startTime}-${assignment.endTime}. Choose a candidate from the provided list for this slot.`,
          });
        }
      }
    }

    // ── Check 4: Max Hours Exceeded ────────────────────────
    // Calculate existing + all proposed hours per staff member
    for (const [staffId, staffAssignments] of assignmentsByStaff) {
      const staffInfo = staffMap.get(staffId) ?? fullStaffMap.get(staffId);
      if (!staffInfo) continue;

      const maxHours =
        "maxHoursPerWeek" in staffInfo
          ? staffInfo.maxHoursPerWeek
          : 40;

      const existingHours = calculateExistingShiftHoursForStaff(
        staffId,
        existingShifts
      );
      const proposedHours = calculateProposedHoursForStaff(
        staffId,
        assignments
      );
      const totalHours = existingHours + proposedHours;

      if (totalHours > maxHours) {
        // Flag on the last assignment that pushed them over
        const lastAssignment = staffAssignments[staffAssignments.length - 1];
        const staffName = lastAssignment.assignment.staffName;
        errors.push({
          type: "max_hours_exceeded",
          staffId,
          staffName,
          shiftIndex: lastAssignment.index,
          message: `Staff "${staffName}" would work ${totalHours.toFixed(1)} hours this week (max: ${maxHours}). Existing: ${existingHours.toFixed(1)}h, proposed: ${proposedHours.toFixed(1)}h.`,
          correctionHint: `${staffName} has ${(maxHours - existingHours).toFixed(1)} hours remaining this week but is being assigned ${proposedHours.toFixed(1)} hours. Remove or shorten one of their assignments.`,
        });
      }
    }

    // ── Check 5: Skill Mismatch ────────────────────────────
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      // Skip if already flagged as globally invalid
      if (!allValidStaffIds.has(assignment.staffId)) continue;

      const staffInfo = staffMap.get(assignment.staffId);
      const fullStaff = fullStaffMap.get(assignment.staffId);
      const skills = staffInfo?.skills ?? fullStaff?.skills ?? [];

      const hasSkill = skills.some(
        (s) => s.station === assignment.station
      );
      if (!hasSkill) {
        errors.push({
          type: "skill_mismatch",
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          shiftIndex: i,
          message: `Staff "${assignment.staffName}" does not have a skill entry for station "${assignment.station}".`,
          correctionHint: `${assignment.staffName} is not trained for ${assignment.station}. Assign them to a station they have skills for, or choose a different staff member for ${assignment.station}.`,
        });
      }
    }

    // ── Check 6: Overlap with Existing Shifts ──────────────
    const dateStr = generated.date;
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];

      // Find existing shifts for this staff member on this day
      const staffExistingShifts = existingShifts.filter((s) => {
        if (s.staffId !== assignment.staffId) return false;
        const shiftDate = new Date(s.start).toISOString().split("T")[0];
        return shiftDate === dateStr;
      });

      for (const existing of staffExistingShifts) {
        const existStart = new Date(existing.start);
        const existEnd = new Date(existing.end);
        const existStartTime = `${String(existStart.getHours()).padStart(2, "0")}:${String(existStart.getMinutes()).padStart(2, "0")}`;
        const existEndTime = `${String(existEnd.getHours()).padStart(2, "0")}:${String(existEnd.getMinutes()).padStart(2, "0")}`;

        if (
          timeRangesOverlap(
            assignment.startTime,
            assignment.endTime,
            existStartTime,
            existEndTime
          )
        ) {
          errors.push({
            type: "overlap",
            staffId: assignment.staffId,
            staffName: assignment.staffName,
            shiftIndex: i,
            message: `Staff "${assignment.staffName}" has an existing shift ${existStartTime}-${existEndTime} on ${existing.station} that overlaps with proposed ${assignment.station} ${assignment.startTime}-${assignment.endTime}.`,
            correctionHint: `${assignment.staffName} is already scheduled ${existStartTime}-${existEndTime} on ${existing.station}. Choose a different time or a different staff member for ${assignment.station} ${assignment.startTime}-${assignment.endTime}.`,
          });
        }
      }
    }

    // ── Warnings ───────────────────────────────────────────

    // Warning: Overtime risk (above 80% of maxHoursPerWeek)
    for (const [staffId, staffAssignments] of assignmentsByStaff) {
      const staffInfo = staffMap.get(staffId) ?? fullStaffMap.get(staffId);
      if (!staffInfo) continue;

      const maxHours =
        "maxHoursPerWeek" in staffInfo
          ? staffInfo.maxHoursPerWeek
          : 40;

      const existingHours = calculateExistingShiftHoursForStaff(
        staffId,
        existingShifts
      );
      const proposedHours = calculateProposedHoursForStaff(
        staffId,
        assignments
      );
      const totalHours = existingHours + proposedHours;

      // Only warn if NOT already an error (i.e., they're under max but above threshold)
      if (totalHours <= maxHours && totalHours > maxHours * OVERTIME_RISK_THRESHOLD) {
        const lastAssignment = staffAssignments[staffAssignments.length - 1];
        warnings.push({
          type: "overtime_risk",
          staffId,
          staffName: lastAssignment.assignment.staffName,
          shiftIndex: lastAssignment.index,
          message: `Staff "${lastAssignment.assignment.staffName}" will be at ${totalHours.toFixed(1)}/${maxHours} hours (${Math.round((totalHours / maxHours) * 100)}%) after this day's assignments.`,
        });
      }
    }

    // Warning: Non-preferred station
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const staffInfo = staffMap.get(assignment.staffId);
      const fullStaff = fullStaffMap.get(assignment.staffId);
      const preferredStations =
        staffInfo?.preferredStations ?? fullStaff?.preferredStations ?? [];

      if (
        preferredStations.length > 0 &&
        !preferredStations.includes(assignment.station)
      ) {
        warnings.push({
          type: "non_preferred_station",
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          shiftIndex: i,
          message: `Staff "${assignment.staffName}" is assigned to "${assignment.station}" but prefers: ${preferredStations.join(", ")}.`,
        });
      }
    }

    // Warning: Clopening risk
    if (previousDayClosingShifts.length > 0) {
      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];

        // Find if this staff member had a closing shift the previous day
        const closingShift = previousDayClosingShifts.find(
          (s) => s.staffId === assignment.staffId
        );
        if (!closingShift) continue;

        // Calculate gap between closing shift end and this assignment start
        const closingEnd = new Date(closingShift.end);
        const closingEndMinutes =
          closingEnd.getHours() * 60 + closingEnd.getMinutes();

        const [openH, openM] = assignment.startTime.split(":").map(Number);
        const openingStartMinutes = openH * 60 + openM;

        // Gap calculation: hours remaining in the closing day + hours into the opening day
        const minutesRemainingInDay = 24 * 60 - closingEndMinutes;
        const gapMinutes = minutesRemainingInDay + openingStartMinutes;
        const gapHours = gapMinutes / 60;

        if (gapHours < CLOPENING_THRESHOLD_HOURS) {
          warnings.push({
            type: "clopening_risk",
            staffId: assignment.staffId,
            staffName: assignment.staffName,
            shiftIndex: i,
            message: `Staff "${assignment.staffName}" closed yesterday and opens today with only ${gapHours.toFixed(1)} hours gap (recommended minimum: ${CLOPENING_THRESHOLD_HOURS}h).`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  /**
   * Score a valid schedule's quality for comparison purposes.
   * Higher score = better schedule. Used by the optimizer loop
   * to decide whether the AI's output beats the deterministic base.
   *
   * @param generated - A valid day schedule to score
   * @param context - The day's scheduling context (for candidate lookups)
   * @returns Numeric quality score
   */
  scoreQuality(
    generated: GeneratedDaySchedule,
    context: DaySchedulingContext,
    weekHoursOverride?: Map<string, number>,
  ): number {
    let score = 0;

    const candidateMap = new Map<string, CandidateDTO>();
    for (const { candidates } of context.slots) {
      for (const c of candidates) {
        if (!candidateMap.has(c.staffId)) {
          candidateMap.set(c.staffId, c);
        }
      }
    }

    for (const a of generated.assignments) {
      const candidate = candidateMap.get(a.staffId);
      if (!candidate) continue;

      if (candidate.preferredStations.includes(a.station)) {
        score += 3;
      }

      if (candidate.preference === "preferred") {
        score += 2;
      }
    }

    // Hour balance: penalise variance in remaining hours across assigned staff
    const remainingHours: number[] = [];
    for (const a of generated.assignments) {
      const candidate = candidateMap.get(a.staffId);
      if (candidate) {
        const slotDur = getShiftDurationHours(a.startTime, a.endTime);
        const actualWeekHours = weekHoursOverride?.get(a.staffId) ?? candidate.currentWeekHours;
        remainingHours.push(
          candidate.maxHoursPerWeek - actualWeekHours - slotDur,
        );
      }
    }
    if (remainingHours.length > 1) {
      const mean =
        remainingHours.reduce((s, v) => s + v, 0) / remainingHours.length;
      const variance =
        remainingHours.reduce((s, v) => s + (v - mean) ** 2, 0) /
        remainingHours.length;
      score -= variance * 0.1;
    }

    score -= generated.unfilledSlots.length * 10;

    return Math.round(score * 100) / 100;
  },

  /**
   * Quality score breakdown for debugging and comparison logging.
   * Same math as scoreQuality() but returns structured components.
   */
  scoreQualityDetailed(
    generated: GeneratedDaySchedule,
    context: DaySchedulingContext,
    weekHoursOverride?: Map<string, number>,
  ): QualityScoreBreakdown {
    const candidateMap = new Map<string, CandidateDTO>();
    for (const { candidates } of context.slots) {
      for (const c of candidates) {
        if (!candidateMap.has(c.staffId)) {
          candidateMap.set(c.staffId, c);
        }
      }
    }

    let preferredStationMatches = 0;
    let preferredStationCount = 0;
    let timePreferenceMatches = 0;
    let timePreferenceCount = 0;

    for (const a of generated.assignments) {
      const candidate = candidateMap.get(a.staffId);
      if (!candidate) continue;

      if (candidate.preferredStations.includes(a.station)) {
        preferredStationMatches += 3;
        preferredStationCount++;
      }

      if (candidate.preference === "preferred") {
        timePreferenceMatches += 2;
        timePreferenceCount++;
      }
    }

    let hourBalancePenalty = 0;
    const remainingHours: number[] = [];
    for (const a of generated.assignments) {
      const candidate = candidateMap.get(a.staffId);
      if (candidate) {
        const slotDur = getShiftDurationHours(a.startTime, a.endTime);
        const actualWeekHours = weekHoursOverride?.get(a.staffId) ?? candidate.currentWeekHours;
        remainingHours.push(
          candidate.maxHoursPerWeek - actualWeekHours - slotDur,
        );
      }
    }
    if (remainingHours.length > 1) {
      const mean =
        remainingHours.reduce((s, v) => s + v, 0) / remainingHours.length;
      const variance =
        remainingHours.reduce((s, v) => s + (v - mean) ** 2, 0) /
        remainingHours.length;
      hourBalancePenalty = variance * 0.1;
    }

    const unfilledCount = generated.unfilledSlots.length;
    const unfilledPenalty = unfilledCount * 10;

    const total =
      preferredStationMatches +
      timePreferenceMatches -
      hourBalancePenalty -
      unfilledPenalty;

    return {
      total: Math.round(total * 100) / 100,
      preferredStationMatches,
      preferredStationCount,
      timePreferenceMatches,
      timePreferenceCount,
      hourBalancePenalty: Math.round(hourBalancePenalty * 100) / 100,
      unfilledPenalty,
      unfilledCount,
    };
  },

  /**
   * Aggregate quality score across all days of the week.
   * Sums per-day scoreQuality() results into a single metric.
   *
   * @param days - Array of generated day schedules
   * @param contexts - Matching array of day scheduling contexts
   * @param weekHoursOverride - Live week-hours accumulator for accurate balance calc
   * @returns Aggregate week quality score
   */
  scoreWeek(
    days: GeneratedDaySchedule[],
    contexts: DaySchedulingContext[],
    weekHoursOverride?: Map<string, number>,
  ): number {
    let total = 0;
    for (let i = 0; i < days.length; i++) {
      total += this.scoreQuality(days[i], contexts[i], weekHoursOverride);
    }
    return Math.round(total * 100) / 100;
  },

  /**
   * Recalculate unfilled slots by comparing assignments against
   * the original slot requirements. Fixes the bug where stripped
   * assignments leave stale unfilled slot data.
   *
   * @param generated - Day schedule with current assignments
   * @param context - Day scheduling context with original slot requirements
   * @returns Updated GeneratedDaySchedule with accurate unfilledSlots
   */
  recalculateUnfilledSlots(
    generated: GeneratedDaySchedule,
    context: DaySchedulingContext,
  ): GeneratedDaySchedule {
    const assignmentCounts = new Map<string, number>();
    for (const a of generated.assignments) {
      const key = `${a.station}|${a.startTime}|${a.endTime}`;
      assignmentCounts.set(key, (assignmentCounts.get(key) ?? 0) + 1);
    }

    const unfilledSlots: UnfilledSlot[] = [];
    for (const { slot, candidates } of context.slots) {
      const key = `${slot.station}|${slot.startTime}|${slot.endTime}`;
      const assigned = assignmentCounts.get(key) ?? 0;
      if (assigned < slot.preferredStaff) {
        unfilledSlots.push({
          station: slot.station,
          startTime: slot.startTime,
          endTime: slot.endTime,
          needed: slot.preferredStaff,
          assigned,
          reason:
            candidates.length === 0
              ? "No valid candidates available"
              : assigned === 0
                ? "No assignment could be made for this slot"
                : `Only ${assigned} of ${slot.preferredStaff} positions filled`,
        });
      }
    }

    return {
      ...generated,
      unfilledSlots,
    };
  },

  /**
   * Retry optimization with a correction prompt.
   * Used when the AI's previous optimizer output was invalid or scored
   * lower than the deterministic base.
   *
   * @param baseSchedule - The deterministic base (always-valid reference)
   * @param previousOutput - The AI's rejected output
   * @param rejectionReason - Why the previous output was rejected
   * @param context - Day scheduling context
   * @param tracking - Usage tracking options for the AI call
   * @param attempt - Current retry attempt number (for logging)
   * @param idToAlias - Map of real staffId -> alias
   * @param aliasToId - Map of alias -> real staffId
   * @returns Corrected GeneratedDaySchedule and token usage
   */
  async retryOptimization(
    baseSchedule: GeneratedDaySchedule,
    previousOutput: GeneratedDaySchedule,
    rejectionReason: OptimizerRejectionReason,
    context: DaySchedulingContext,
    tracking: ValidatorTrackingOptions,
    attempt: number,
    idToAlias: Map<string, string>,
    aliasToId: Map<string, string>,
  ): Promise<{ daySchedule: GeneratedDaySchedule; tokenUsage: TokenUsage }> {
    const reasonStr =
      rejectionReason.type === "invalid"
        ? `${rejectionReason.errors.length} validation error(s)`
        : `lower quality (${rejectionReason.aiScore} vs base ${rejectionReason.baseScore})`;

    const systemPrompt = buildOptimizerSystemPrompt();
    const correctionPrompt = buildOptimizerCorrectionPrompt(
      baseSchedule,
      previousOutput,
      rejectionReason,
      context,
      idToAlias,
    );

    const promptLen = correctionPrompt.length;
    console.log(
      `[ScheduleValidator] Optimizer retry ${attempt}/${MAX_RETRY_ATTEMPTS}: ${reasonStr} — correction prompt ${promptLen.toLocaleString()} chars`,
    );

    try {
      const { data: rawOutput, usage } = await generateJSON<AIRawDayOutput>(
        systemPrompt,
        correctionPrompt,
        {
          model: "gpt-4o",
          temperature: 0.2,
          maxTokens: 4000,
          tracking: {
            orgId: tracking.orgId,
            locationId: tracking.locationId,
            clerkUserId: tracking.clerkUserId,
            action: tracking.action,
          },
        },
      );

      const daySchedule = normalizeAIOutput(
        rawOutput,
        context.slots,
        baseSchedule.date,
        baseSchedule.dayOfWeek,
        aliasToId,
      );

      return { daySchedule, tokenUsage: usage };
    } catch (error) {
      if (
        error instanceof AILimitExceededError ||
        error instanceof AIServiceUnavailableError
      ) {
        throw error;
      }
      throw error;
    }
  },

  /**
   * Strip invalid assignments from a day schedule and recalculate
   * unfilled slots to reflect reality.
   *
   * @param generated - The day schedule with potential violations
   * @param validationErrors - The errors identifying which assignments to remove
   * @param context - Day scheduling context for unfilled slot recalculation
   * @returns Cleaned schedule with accurate unfilled slots
   */
  stripInvalidAssignments(
    generated: GeneratedDaySchedule,
    validationErrors: ValidationError[],
    context?: DaySchedulingContext,
  ): GeneratedDaySchedule {
    const errorIndices = new Set<number>();
    for (const error of validationErrors) {
      errorIndices.add(error.shiftIndex);
    }

    const cleanAssignments = generated.assignments.filter(
      (_, i) => !errorIndices.has(i),
    );

    const removedCount = generated.assignments.length - cleanAssignments.length;
    const updatedNotes =
      removedCount > 0
        ? `${generated.notes} (${removedCount} invalid assignment(s) removed after failed validation retries)`
        : generated.notes;

    let result: GeneratedDaySchedule = {
      ...generated,
      assignments: cleanAssignments,
      notes: updatedNotes,
    };

    if (context) {
      result = this.recalculateUnfilledSlots(result, context);
    }

    return result;
  },

  /** Maximum optimizer retry attempts */
  MAX_RETRY_ATTEMPTS,
};
