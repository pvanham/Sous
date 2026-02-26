import type { KitchenConfigDTO } from "@/types/kitchen-config";
import type { StaffDTO } from "@/types/staff";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { ShiftDTO } from "@/types/shift";
import type { ScheduleDTO } from "@/types/schedule";
import type { SlotCandidates } from "@/types/candidate";
import type { TokenUsage } from "@/types/ai-usage";

// ============================================================
// AI Scheduling Types -- Sprint 3.7: Selector Layer
//                     + Sprint 3.8: Validator Layer
// ============================================================
// Pure output types used by the SchedulingAgentService and
// ScheduleValidatorService. No Mongoose model or toDTO()
// converter needed -- these are built in-memory by the service
// and prompt builder layers.
// ============================================================

// ────────────────────────────────────────────────────────────
// Scheduling Context (Full Week)
// ────────────────────────────────────────────────────────────

/**
 * Aggregated context for a full week of schedule generation.
 * Built by `SchedulingAgentService.buildSchedulingContext()`.
 * Contains everything needed to generate an entire week's schedule.
 */
export interface SchedulingContext {
  /** Organization ID (multi-tenancy scoping) */
  orgId: string;
  /** Location ID (multi-tenancy scoping) */
  locationId: string;
  /** Clerk user ID who triggered generation (for AI usage tracking) */
  clerkUserId: string;
  /** Monday 00:00 of the target week */
  weekStart: Date;
  /** Kitchen configuration (operating hours, stations, roles, AI settings) */
  config: KitchenConfigDTO;
  /** All active staff for the location */
  staff: StaffDTO[];
  /** All labor requirements for the location (all days) */
  laborRequirements: LaborRequirementDTO[];
  /** Already-assigned shifts for the week (before generation starts) */
  existingShifts: ShiftDTO[];
  /** The schedule record for the target week */
  schedule: ScheduleDTO;
}

// ────────────────────────────────────────────────────────────
// Day Scheduling Context (Single Day)
// ────────────────────────────────────────────────────────────

/**
 * Context for generating a single day's schedule.
 * Passed to `SchedulingAgentService.generateDaySchedule()` and
 * to the prompt builder for AI context serialization.
 *
 * Includes pre-filtered candidates from CandidateService,
 * existing shifts (including AI-generated shifts from prior days),
 * and previous day's closing shifts for clopening avoidance.
 */
export interface DaySchedulingContext {
  /** The target date for this day's generation */
  date: Date;
  /** Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday) */
  dayOfWeek: number;
  /** Human-readable day name (e.g., "Monday") */
  dayName: string;
  /** Pre-filtered candidates per slot (from CandidateService.getCandidatesForDay()) */
  slots: SlotCandidates[];
  /** All existing + previously-generated shifts visible for this day */
  existingShifts: ShiftDTO[];
  /** Previous day's closing shifts (for clopening avoidance) */
  previousDayClosingShifts: ShiftDTO[];
  /** Kitchen context relevant to this day */
  kitchenContext: {
    /** Operating hours for this specific day, or null if closed */
    operatingHours: { open: string; close: string } | null;
    /** Total number of active staff in the location */
    totalStaffCount: number;
  };
}

// ────────────────────────────────────────────────────────────
// Week-Level Solver Input
// ────────────────────────────────────────────────────────────

/**
 * Pre-fetched candidate data for a single day, used as input to
 * `CPSolverService.solveWeek()`. Contains the same
 * `SlotCandidates` as `DaySchedulingContext.slots` but without
 * cross-day dependencies (shifts accumulate inside the solver).
 */
export interface WeekDayCandidates {
  /** Index into the weekDays array (0 = Monday ... 6 = Sunday) */
  dayIndex: number;
  /** The calendar date for this day */
  date: Date;
  /** ISO date string (YYYY-MM-DD) */
  dateStr: string;
  /** Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday) */
  dayOfWeek: number;
  /** Human-readable day name (e.g., "Monday") */
  dayName: string;
  /** Pre-filtered candidates per slot (from CandidateService) */
  slots: SlotCandidates[];
}

/**
 * Input to `CPSolverService.solveWeek()`.
 * Aggregates all 7 days' candidate pools plus staff hour limits,
 * allowing the solver to distribute assignments optimally across
 * the entire week and avoid late-week candidate starvation.
 */
export interface WeekSolverInput {
  /** Candidate pools for each day of the week */
  days: WeekDayCandidates[];
  /** staffId -> maxHoursPerWeek (from StaffDTO) */
  maxHoursLookup: Map<string, number>;
  /** staffId -> minHoursPerWeek (from StaffDTO) */
  minHoursLookup: Map<string, number>;
  /** staffId -> hours already committed from existing DB shifts */
  existingWeekHours: Map<string, number>;
  /** Optional schedule generation settings (clopening policy) */
  scheduleGenerationSettings?: {
    allowClopening: boolean;
    minHoursBetweenShifts: number;
    clopeningWarningThresholdHours: number;
  };
}

// ────────────────────────────────────────────────────────────
// AI Raw Output (what the LLM returns -- before normalization)
// ────────────────────────────────────────────────────────────

/**
 * Raw JSON structure expected from the LLM for a single day.
 * This is what `generateJSON<AIRawDayOutput>()` parses.
 * The SchedulingAgentService maps this to `GeneratedDaySchedule`.
 */
export interface AIRawDayOutput {
  assignments: Array<{
    staffId: string;
    staffName: string;
    station: string;
    startTime: string;
    endTime: string;
    reasoning: string;
  }>;
  unfilledSlots: Array<{
    station: string;
    startTime: string;
    endTime: string;
    needed: number;
    assigned: number;
    reason: string;
  }>;
  notes: string;
}

// ────────────────────────────────────────────────────────────
// AI Swap Output (what the LLM returns in swap-based mode)
// ────────────────────────────────────────────────────────────

/**
 * Raw JSON structure expected from the LLM in swap-based mode.
 * Instead of regenerating the full schedule, the AI suggests
 * specific swaps to improve the CP solver base.
 */
export interface AISwapOutput {
  swaps: Array<{
    /** Slot identifier: "Station HH:MM-HH:MM" */
    slot: string;
    /** Alias of the staff member to remove from this slot */
    removeStaffId: string;
    /** Alias of the staff member to assign to this slot */
    assignStaffId: string;
    /** Brief reasoning for the swap */
    reasoning: string;
  }>;
  /** Summary of changes */
  notes: string;
}

// ────────────────────────────────────────────────────────────
// Generated Shift Assignment
// ────────────────────────────────────────────────────────────

/**
 * A single AI-produced shift assignment.
 * Represents the AI's decision to assign a specific staff member to a slot.
 */
export interface GeneratedShiftAssignment {
  /** Staff member ID (must be from the candidate list) */
  staffId: string;
  /** Staff member display name */
  staffName: string;
  /** Station for this shift */
  station: string;
  /** Shift start time in HH:MM format */
  startTime: string;
  /** Shift end time in HH:MM format */
  endTime: string;
  /** AI reasoning for this assignment (1-2 sentences) */
  reasoning: string;
}

// ────────────────────────────────────────────────────────────
// Unfilled Slot
// ────────────────────────────────────────────────────────────

/**
 * A slot that could not be fully staffed.
 * Occurs when there are fewer valid candidates than the required staff count.
 */
export interface UnfilledSlot {
  /** Station name */
  station: string;
  /** Slot start time in HH:MM format */
  startTime: string;
  /** Slot end time in HH:MM format */
  endTime: string;
  /** Number of staff needed for this slot */
  needed: number;
  /** Number of staff actually assigned */
  assigned: number;
  /** Explanation of why the slot is unfilled */
  reason: string;
}

// ────────────────────────────────────────────────────────────
// Generated Day Schedule
// ────────────────────────────────────────────────────────────

/**
 * AI output for a single day's schedule.
 * Contains all shift assignments and any unfilled slots.
 */
export interface GeneratedDaySchedule {
  /** Date in ISO format (YYYY-MM-DD) */
  date: string;
  /** Day name (e.g., "Monday") */
  dayOfWeek: string;
  /** All shift assignments for this day */
  assignments: GeneratedShiftAssignment[];
  /** Slots that could not be fully staffed */
  unfilledSlots: UnfilledSlot[];
  /** AI summary of decisions made for this day */
  notes: string;
}

// ────────────────────────────────────────────────────────────
// Generated Schedule Metadata
// ────────────────────────────────────────────────────────────

/**
 * Metadata about the generation process.
 */
export interface GenerationMetadata {
  /** Total number of shift assignments created across all days */
  totalShiftsCreated: number;
  /** Total number of unfilled slots across all days */
  totalUnfilledSlots: number;
  /** Whether the AI was genuinely unavailable (API error, rate limit) */
  usedFallback: boolean;
  /** Number of days where AI optimizer improved the base schedule */
  aiImprovedDays: number;
  /** Total number of days the optimizer ran on */
  totalOptimizerDays: number;
  /** Total generation time in milliseconds */
  generationTimeMs: number;
  /** Aggregated token usage across all AI calls */
  tokenUsage: TokenUsage;
  /** Aggregate quality score across all days of the week */
  weekScore: number;
  /** Number of assignments placed on a staff member's preferred station */
  preferredStationMatches: number;
  /** Number of assignments where staff had at least one preferred station set */
  totalAssignmentsWithPreference: number;
  /** Whether the schedule has been through the AI swap optimizer */
  aiOptimized: boolean;
}

// ────────────────────────────────────────────────────────────
// Generated Schedule (Full Week)
// ────────────────────────────────────────────────────────────

/**
 * Full week schedule output from the AI Scheduling Agent.
 * Aggregates day-by-day results with overall metadata.
 */
export interface GeneratedSchedule {
  /** Per-day schedule results */
  days: GeneratedDaySchedule[];
  /** AI-generated summary of the full week's schedule */
  summary: string;
  /** Generation process metadata */
  metadata: GenerationMetadata;
  /** Validation warnings aggregated across all days (Sprint 3.8) */
  warnings: ValidationWarning[];
}

// ────────────────────────────────────────────────────────────
// Validation Types (Sprint 3.8: Validator Layer)
// ────────────────────────────────────────────────────────────

/** All possible hard constraint violation types */
export type ValidationErrorType =
  | "double_booking"
  | "multiple_shifts_same_day"
  | "unavailable_staff"
  | "max_hours_exceeded"
  | "skill_mismatch"
  | "invalid_staff_id"
  | "invalid_swap"
  | "overlap";

/**
 * A hard constraint violation found during schedule validation.
 * Each error includes a correction hint that can be fed back to
 * the AI in the self-correction loop.
 */
export interface ValidationError {
  /** Type of constraint violation */
  type: ValidationErrorType;
  /** Staff member involved in the violation */
  staffId: string;
  /** Staff member display name (for human-readable messages) */
  staffName: string;
  /** Index of the shift assignment in the day's assignments array */
  shiftIndex: number;
  /** Human-readable description of the violation */
  message: string;
  /** Actionable hint for the AI to fix the issue */
  correctionHint: string;
}

/** All possible soft warning types */
export type ValidationWarningType =
  | "overtime_risk"
  | "clopening_risk"
  | "under_scheduled";

/**
 * A soft issue found during schedule validation.
 * Warnings do NOT block the schedule but are surfaced to the user.
 */
export interface ValidationWarning {
  /** Type of soft issue */
  type: ValidationWarningType;
  /** Staff member involved */
  staffId: string;
  /** Staff member display name */
  staffName: string;
  /** Index of the shift assignment in the day's assignments array */
  shiftIndex: number;
  /** Human-readable description of the warning */
  message: string;
}

/**
 * Result of validating a GeneratedDaySchedule against constraints.
 * Returned by `ScheduleValidatorService.validate()`.
 */
export interface ValidationResult {
  /** True if no hard constraint violations were found */
  valid: boolean;
  /** Hard constraint violations (block schedule acceptance) */
  errors: ValidationError[];
  /** Soft issues (surfaced to user but don't block) */
  warnings: ValidationWarning[];
  /** Assignments placed on a staff member's preferred station */
  preferredStationMatches: number;
  /** Assignments where staff had at least one preferred station set */
  totalAssignmentsWithPreference: number;
}

/**
 * Result of partitioning a day's assignments into locked (valid) and
 * failed (invalid) groups during the correction loop.
 * Used to send only failed slots back to the AI while preserving valid ones.
 */
export interface PartitionedAssignments {
  /** Assignments that passed validation -- preserved as-is during retries */
  lockedAssignments: GeneratedShiftAssignment[];
  /** Assignments that failed validation -- sent back to the AI for correction */
  failedAssignments: GeneratedShiftAssignment[];
  /** Compound keys ("station|startTime|endTime") identifying the failed slots */
  failedSlotKeys: Set<string>;
}

// ────────────────────────────────────────────────────────────
// Schedule Generation Action Types (Sprint 3.9)
// ────────────────────────────────────────────────────────────

/** Severity of a readiness issue */
export type ReadinessIssueSeverity = "blocker" | "warning";

/** Category of a readiness issue */
export type ReadinessIssueCategory =
  | "usage_limit"
  | "missing_hourly_rate"
  | "low_availability"
  | "missing_requirements"
  | "requirements_outside_hours"
  | "no_qualified_candidates"
  | "no_active_staff"
  | "no_kitchen_config";

/**
 * A single readiness issue found during pre-generation checks.
 * Blockers prevent generation; warnings allow proceeding with confirmation.
 */
export interface ReadinessIssue {
  /** Whether this blocks generation or is just a warning */
  severity: ReadinessIssueSeverity;
  /** Category of the issue for grouping */
  category: ReadinessIssueCategory;
  /** Human-readable message displayed in the UI */
  message: string;
  /** Count of affected items (e.g., number of staff missing hourly rate) */
  count?: number;
  /** Specific item names for display (e.g., staff names, station names) */
  details?: string[];
}

/**
 * Result of the pre-generation readiness check.
 * Returned by `checkGenerationReadiness()` action.
 */
export interface ReadinessCheckResult {
  /** Whether generation can proceed (no blockers) */
  canProceed: boolean;
  /** All issues found during readiness checks */
  issues: ReadinessIssue[];
  /** AI usage remaining this month */
  usageRemaining: number;
  /** AI usage limit for this month */
  usageLimit: number;
  /** Total active staff count */
  activeStaffCount: number;
  /** Availability completeness as a percentage (0-100) */
  availabilityCompleteness: number;
  /** Total shift slots defined */
  totalRequirements: number;
}

/**
 * A single shift accepted by the user from the generated preview.
 * Used as input to `acceptGeneratedSchedule()` action.
 */
export interface AcceptedShift {
  /** Staff member ID */
  staffId: string;
  /** Station for this shift */
  station: string;
  /** Date in ISO format (YYYY-MM-DD) */
  date: string;
  /** Shift start time in HH:MM format */
  startTime: string;
  /** Shift end time in HH:MM format */
  endTime: string;
}
