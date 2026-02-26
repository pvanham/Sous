import { z } from "zod";

/** Time string format: "HH:MM" */
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format");

/** Date string format: "YYYY-MM-DD" */
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

// ────────────────────────────────────────────────────────────
// Generate Schedule Input
// ────────────────────────────────────────────────────────────

const solverEngineSchema = z.enum(["legacy", "cp"]).optional().default("legacy");

/**
 * Schema for the generateSchedule action input.
 */
export const generateScheduleSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
  solverEngine: solverEngineSchema,
});

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;

// ────────────────────────────────────────────────────────────
// Accept Generated Schedule Input
// ────────────────────────────────────────────────────────────

/**
 * Schema for a single accepted shift from the generation preview.
 */
export const acceptedShiftSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  station: z.string().min(1, "Station is required"),
  date: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
});

/**
 * Schema for the acceptGeneratedSchedule action input.
 */
export const acceptGeneratedScheduleSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
  shifts: z
    .array(acceptedShiftSchema)
    .min(1, "At least one shift is required"),
});

export type AcceptGeneratedScheduleInput = z.infer<
  typeof acceptGeneratedScheduleSchema
>;

// ────────────────────────────────────────────────────────────
// Readiness Check Input
// ────────────────────────────────────────────────────────────

/**
 * Schema for the checkGenerationReadiness action input.
 */
export const checkReadinessSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
});

export type CheckReadinessInput = z.infer<typeof checkReadinessSchema>;
