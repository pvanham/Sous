import { z } from "zod";

/**
 * Time string validation schema.
 * Accepts HH:MM format (24-hour).
 */
const timeStringSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):([0-5]\d)$/,
    "Time must be in HH:MM format (e.g., 09:00, 17:30)"
  );

/**
 * Priority levels for labor requirements.
 * - critical: Must be filled, business cannot operate without
 * - high: Very important, should prioritize filling
 * - normal: Standard requirement
 * - low: Nice to have, can operate without
 */
const prioritySchema = z.enum(["critical", "high", "normal", "low"]);

/**
 * Main labor requirement schema - used for creating/updating requirements.
 */
export const laborRequirementSchema = z
  .object({
    dayOfWeek: z
      .number()
      .int("Day of week must be an integer")
      .min(0, "Day of week must be 0-6 (0=Sunday)")
      .max(6, "Day of week must be 0-6 (6=Saturday)"),
    station: z.string().min(1, "Station is required"),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    minStaff: z
      .number()
      .int("Minimum staff must be an integer")
      .min(0, "Minimum staff must be at least 0"),
    preferredStaff: z
      .number()
      .int("Preferred staff must be an integer")
      .min(0, "Preferred staff must be at least 0"),
    priority: prioritySchema,
  })
  .refine(
    (data) => {
      // Compare times as strings (HH:MM format compares correctly lexicographically)
      return data.endTime > data.startTime;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      return data.preferredStaff >= data.minStaff;
    },
    {
      message: "Preferred staff must be greater than or equal to minimum staff",
      path: ["preferredStaff"],
    }
  );

/**
 * Partial labor requirement schema for updates.
 * Note: We use a custom partial that still validates refinements when both fields are present.
 */
export const laborRequirementUpdateSchema = z
  .object({
    dayOfWeek: z
      .number()
      .int("Day of week must be an integer")
      .min(0, "Day of week must be 0-6 (0=Sunday)")
      .max(6, "Day of week must be 0-6 (6=Saturday)")
      .optional(),
    station: z.string().min(1, "Station is required").optional(),
    startTime: timeStringSchema.optional(),
    endTime: timeStringSchema.optional(),
    minStaff: z
      .number()
      .int("Minimum staff must be an integer")
      .min(0, "Minimum staff must be at least 0")
      .optional(),
    preferredStaff: z
      .number()
      .int("Preferred staff must be an integer")
      .min(0, "Preferred staff must be at least 0")
      .optional(),
    priority: prioritySchema.optional(),
  })
  .refine(
    (data) => {
      // Only validate if both times are provided
      if (data.startTime && data.endTime) {
        return data.endTime > data.startTime;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      // Only validate if both staff counts are provided
      if (data.minStaff !== undefined && data.preferredStaff !== undefined) {
        return data.preferredStaff >= data.minStaff;
      }
      return true;
    },
    {
      message: "Preferred staff must be greater than or equal to minimum staff",
      path: ["preferredStaff"],
    }
  );

/**
 * Schema for querying by day of week.
 */
export const dayOfWeekSchema = z
  .number()
  .int("Day of week must be an integer")
  .min(0, "Day of week must be 0-6 (0=Sunday)")
  .max(6, "Day of week must be 0-6 (6=Saturday)");

// Types inferred from schemas
export type LaborRequirementInput = z.infer<typeof laborRequirementSchema>;
export type LaborRequirementUpdateInput = z.infer<
  typeof laborRequirementUpdateSchema
>;

// Default values for new labor requirement form
export const defaultLaborRequirementValues: LaborRequirementInput = {
  dayOfWeek: 1, // Monday
  station: "",
  startTime: "09:00",
  endTime: "17:00",
  minStaff: 1,
  preferredStaff: 1,
  priority: "normal",
};

// Helper to get day name from number
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "Unknown";
}

// ============================================================
// Bulk Operations Schemas
// ============================================================

/**
 * Schema for a single cell in bulk operations.
 * Represents a station + day combination.
 */
export const bulkCellSchema = z.object({
  station: z.string().min(1, "Station is required"),
  dayOfWeek: dayOfWeekSchema,
});

/**
 * Schema for bulk create operation.
 * Creates a requirement with the same settings across multiple station/day cells.
 */
export const bulkCreateSchema = z
  .object({
    cells: z.array(bulkCellSchema).min(1, "Select at least one cell"),
    requirement: z.object({
      startTime: timeStringSchema,
      endTime: timeStringSchema,
      minStaff: z
        .number()
        .int("Minimum staff must be an integer")
        .min(0, "Minimum staff must be at least 0"),
      preferredStaff: z
        .number()
        .int("Preferred staff must be an integer")
        .min(0, "Preferred staff must be at least 0"),
      priority: prioritySchema,
    }),
  })
  .refine(
    (data) => data.requirement.endTime > data.requirement.startTime,
    {
      message: "End time must be after start time",
      path: ["requirement", "endTime"],
    }
  )
  .refine(
    (data) => data.requirement.preferredStaff >= data.requirement.minStaff,
    {
      message: "Preferred staff must be >= minimum staff",
      path: ["requirement", "preferredStaff"],
    }
  );

export type BulkCellInput = z.infer<typeof bulkCellSchema>;
export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;

/**
 * Schema for bulk delete operation.
 * Deletes all requirements in the selected cells.
 */
export const bulkDeleteSchema = z.object({
  cells: z.array(bulkCellSchema).min(1, "Select at least one cell"),
});

export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
