import type { KitchenConfigDTO } from "@/types/kitchen-config";
import type { StaffDTO } from "@/types/staff";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { ShiftDTO } from "@/types/shift";
import type { ScheduleDTO } from "@/types/schedule";
import type { SlotCandidates } from "@/types/candidate";
import type { TokenUsage } from "@/types/ai-usage";

// ============================================================
// AI Scheduling Types -- Sprint 3.7: Selector Layer
// ============================================================
// Pure output types used by the SchedulingAgentService.
// No Mongoose model or toDTO() converter needed -- these are
// built in-memory by the service and prompt builder layers.
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
  /** Whether the algorithmic fallback was used (AI unavailable) */
  usedFallback: boolean;
  /** Total generation time in milliseconds */
  generationTimeMs: number;
  /** Aggregated token usage across all AI calls */
  tokenUsage: TokenUsage;
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
}
