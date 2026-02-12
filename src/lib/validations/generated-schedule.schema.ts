import { z } from "zod";

// ============================================================
// Generated Schedule Zod Schemas -- Sprint 3.8: Validator Layer
// ============================================================
// Structural validation schemas for AI-generated schedule output.
// Used to verify the SHAPE of what the LLM returns before the
// business-logic validator (ScheduleValidatorService) runs.
//
// Follows the Zod-first validation pattern per .cursorrules and
// ARCHITECTURE.md -- shared schemas usable on both FE and BE.
// ============================================================

/**
 * HH:MM time string validation (reused pattern from labor-requirement.schema.ts).
 */
const timeStringSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):([0-5]\d)$/,
    "Time must be in HH:MM format (e.g., 09:00, 17:30)"
  );

/**
 * ISO date string validation (YYYY-MM-DD).
 */
const dateISOStringSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date must be in YYYY-MM-DD format"
  );

// ────────────────────────────────────────────────────────────
// Generated Shift Assignment Schema
// ────────────────────────────────────────────────────────────

/**
 * Validates the structure of a single AI-generated shift assignment.
 * Ensures all required fields are present and have valid formats.
 */
export const generatedShiftAssignmentSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  staffName: z.string().min(1, "Staff name is required"),
  station: z.string().min(1, "Station is required"),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  reasoning: z.string().min(1, "Reasoning is required"),
});

export type GeneratedShiftAssignmentInput = z.infer<
  typeof generatedShiftAssignmentSchema
>;

// ────────────────────────────────────────────────────────────
// Unfilled Slot Schema
// ────────────────────────────────────────────────────────────

/**
 * Validates the structure of an unfilled slot report from the AI.
 */
export const unfilledSlotSchema = z.object({
  station: z.string().min(1, "Station is required"),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  needed: z.number().int().min(0, "Needed must be a non-negative integer"),
  assigned: z.number().int().min(0, "Assigned must be a non-negative integer"),
  reason: z.string().min(1, "Reason is required"),
});

export type UnfilledSlotInput = z.infer<typeof unfilledSlotSchema>;

// ────────────────────────────────────────────────────────────
// Generated Day Schedule Schema
// ────────────────────────────────────────────────────────────

/**
 * Validates the complete AI output for a single day's schedule.
 * Wraps assignment and unfilled slot arrays with day metadata.
 */
export const generatedDayScheduleSchema = z.object({
  date: dateISOStringSchema,
  dayOfWeek: z.string().min(1, "Day of week is required"),
  assignments: z.array(generatedShiftAssignmentSchema),
  unfilledSlots: z.array(unfilledSlotSchema),
  notes: z.string(),
});

export type GeneratedDayScheduleInput = z.infer<
  typeof generatedDayScheduleSchema
>;
