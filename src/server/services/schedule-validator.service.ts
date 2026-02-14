import { generateJSON } from "@/lib/ai/openai-client";
import {
  AILimitExceededError,
  AIServiceUnavailableError,
} from "@/lib/ai/openai-client";
import { timeRangesOverlap } from "@/lib/utils/time-overlap";
import {
  buildSystemPrompt,
  buildCorrectionPrompt,
} from "@/server/services/ai/prompts/schedule-generation";
import { normalizeAIOutput } from "@/server/services/ai/scheduling-agent.service";
import type { StaffDTO } from "@/types/staff";
import type { ShiftDTO } from "@/types/shift";
import type { SlotCandidates } from "@/types/candidate";
import type { TokenUsage } from "@/types/ai-usage";
import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  AIRawDayOutput,
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from "@/types/ai-scheduling";

// ============================================================
// ScheduleValidatorService -- Sprint 3.8: Validator Layer
// ============================================================
// Deterministic validation of AI-generated schedules against
// hard constraints, plus a self-correction retry loop that
// feeds specific errors back to the AI.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models directly
// - Operates on DTOs only (GeneratedDaySchedule, StaffDTO, etc.)
// - Pure validation logic -- no database calls
// - Multi-tenancy context passed via DaySchedulingContext
// ============================================================

/** Maximum number of self-correction retry attempts */
const MAX_RETRY_ATTEMPTS = 2;

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
   * Retry schedule generation with correction hints fed back to the AI.
   *
   * Uses the existing `buildCorrectionPrompt()` from Sprint 3.7 to
   * format validation errors as a correction prompt, then calls
   * `generateJSON<AIRawDayOutput>()` to get a corrected output.
   *
   * The corrected output is run through `normalizeAIOutput()` to
   * strip any remaining invalid staffIds before returning.
   *
   * @param original - The previous (invalid) day schedule
   * @param validationErrors - Hard constraint violations to correct
   * @param context - Day scheduling context (for candidate validation)
   * @param tracking - Usage tracking options for the AI call
   * @param attempt - Current retry attempt number (for logging)
   * @returns Corrected GeneratedDaySchedule and token usage
   */
  async retryWithCorrections(
    original: GeneratedDaySchedule,
    validationErrors: ValidationError[],
    context: DaySchedulingContext,
    tracking: ValidatorTrackingOptions,
    attempt: number,
    idToAlias: Map<string, string> = new Map(),
    aliasToId: Map<string, string> = new Map()
  ): Promise<{ daySchedule: GeneratedDaySchedule; tokenUsage: TokenUsage }> {
    console.log(
      `[ScheduleValidator] Retry attempt ${attempt}/${MAX_RETRY_ATTEMPTS} with ${validationErrors.length} error(s)`
    );

    // Build error messages with correction hints for the AI
    const errorMessages = validationErrors.map(
      (e) => `${e.message} HINT: ${e.correctionHint}`
    );

    const systemPrompt = buildSystemPrompt();
    const correctionPrompt = buildCorrectionPrompt(
      original,
      errorMessages,
      context,
      idToAlias
    );

    try {
      const { data: rawOutput, usage } = await generateJSON<AIRawDayOutput>(
        systemPrompt,
        correctionPrompt,
        {
          model: "gpt-4o-mini",
          temperature: 0.2, // Lower temperature for corrections (more deterministic)
          maxTokens: 4000,
          tracking: {
            orgId: tracking.orgId,
            locationId: tracking.locationId,
            clerkUserId: tracking.clerkUserId,
            action: tracking.action,
          },
        }
      );

      // Normalize through the same pipeline as initial generation
      // (resolves aliases back to real IDs)
      const daySchedule = normalizeAIOutput(
        rawOutput,
        context.slots,
        original.date,
        original.dayOfWeek,
        aliasToId
      );

      return { daySchedule, tokenUsage: usage };
    } catch (error) {
      // If AI is unavailable during retry, re-throw
      // The caller (scheduling-agent) will handle fallback
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
   * Strip invalid assignments from a day schedule.
   * Used as a last resort when max retries are exhausted --
   * a partial schedule is better than no schedule.
   *
   * @param generated - The day schedule with potential violations
   * @param validationErrors - The errors identifying which assignments to remove
   * @returns Cleaned schedule with invalid assignments removed
   */
  stripInvalidAssignments(
    generated: GeneratedDaySchedule,
    validationErrors: ValidationError[]
  ): GeneratedDaySchedule {
    // Collect indices of assignments that have errors
    const errorIndices = new Set<number>();
    for (const error of validationErrors) {
      errorIndices.add(error.shiftIndex);
    }

    // Keep only valid assignments
    const cleanAssignments = generated.assignments.filter(
      (_, i) => !errorIndices.has(i)
    );

    const removedCount = generated.assignments.length - cleanAssignments.length;
    const updatedNotes = removedCount > 0
      ? `${generated.notes} (${removedCount} invalid assignment(s) removed after failed validation retries)`
      : generated.notes;

    return {
      ...generated,
      assignments: cleanAssignments,
      notes: updatedNotes,
    };
  },

  /** Expose the max retry attempts constant for external use */
  MAX_RETRY_ATTEMPTS,
};
