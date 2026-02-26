import type { LaborPriority } from "@/types/labor-requirement";
import type { AvailabilityPreference } from "@/types/staff-availability";

// ============================================================
// Candidate Types for Sprint 3.5: Hard Filter Layer
// ============================================================
// These are pure output types -- no Mongoose model or toDTO() needed.
// Built from existing DTOs (StaffDTO, StaffAvailabilityDTO, ShiftDTO, etc.)
// by the CandidateService's filter pipeline.
// ============================================================

/**
 * Represents a single valid candidate for a schedule slot.
 * Only staff who pass ALL hard filters appear as CandidateDTOs.
 *
 * Hard filters applied:
 * 1. Availability (recurring weekly pattern covers the slot)
 * 2. Time-off (no approved time-off on the shift date)
 * 3. Skills (has a skill entry matching the required station)
 * 4. Existing shifts (no overlapping shifts already assigned)
 *
 * Soft signals (for AI to weigh, not filter):
 * - preference: preferred vs. available
 * - overtimeWarning: would this shift push them over maxHoursPerWeek?
 * - proficiency level for the station
 * - preferredStations alignment
 */
export interface CandidateDTO {
  /** Staff document ID */
  staffId: string;
  /** Staff member's display name */
  staffName: string;
  /** All skills the staff member has (station + proficiency 1-5) */
  skills: Array<{ station: string; proficiency: number }>;
  /** Availability preference for this specific slot (from StaffAvailability) */
  preference: Exclude<AvailabilityPreference, "unavailable">;
  /** Total hours already scheduled for the staff member in the current week */
  currentWeekHours: number;
  /** Staff member's configured maximum hours per week */
  maxHoursPerWeek: number;
  /** Staff member's configured minimum hours per week */
  minHoursPerWeek: number;
  /** True if assigning this shift would push the staff member over their maxHoursPerWeek */
  overtimeWarning: boolean;
  /** Stations the staff member prefers to work at */
  preferredStations: string[];
  /** Expected hourly cost of staff member */
  hourlyRate?: number;
  /** Role titles held by the staff member */
  roles: string[];
  /** Optional notes (e.g., availability notes) */
  notes?: string;
}

/**
 * Slot definition extracted from a LaborRequirementDTO.
 * Describes what a single schedule slot needs.
 */
export interface SlotDefinition {
  /** Station name (must match KitchenConfig.stations) */
  station: string;
  /** Slot start time in HH:MM format */
  startTime: string;
  /** Slot end time in HH:MM format */
  endTime: string;
  /** Minimum staff required for this slot */
  minStaff: number;
  /** Ideal/preferred staff count for this slot */
  preferredStaff: number;
  /** Priority level of this slot */
  priority: LaborPriority;
}

/**
 * Groups valid candidates for a specific labor requirement slot.
 * Used by getCandidatesForDay to return per-slot candidate lists.
 */
export interface SlotCandidates {
  /** The slot definition (station, times, staffing requirements, priority) */
  slot: SlotDefinition;
  /** Only VALID candidates who passed all hard filters */
  candidates: CandidateDTO[];
  /** True if candidates.length >= slot.minStaff (enough people to fill the slot) */
  hasSufficientCandidates: boolean;
}
