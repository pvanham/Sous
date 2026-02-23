import { z } from "zod";

/**
 * Time string schema that accepts HH:MM format or null.
 * Used for availability windows.
 */
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format")
  .nullable();

/**
 * Availability preference schema.
 * - preferred: Staff prefers to work this time
 * - available: Staff can work this time
 * - unavailable: Staff cannot work this time
 */
const preferenceSchema = z.enum(["preferred", "available", "unavailable"]);

/**
 * Base staff availability object schema (without refinements).
 * Used for .omit() which doesn't work on refined schemas.
 */
const staffAvailabilityBaseSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be 0-6")
    .max(6, "Day of week must be 0-6"),
  availableFrom: timeStringSchema,
  availableTo: timeStringSchema,
  preference: preferenceSchema,
  notes: z.string().max(500, "Notes must be 500 characters or less").optional(),
});

/**
 * Single staff availability entry schema with cross-field validation.
 * Represents availability for one day of the week.
 */
export const staffAvailabilitySchema = staffAvailabilityBaseSchema.refine(
  (data) => {
    // If unavailable, times can be null - valid
    if (data.preference === "unavailable") {
      return true;
    }

    // If available or preferred, both times should be present
    if (!data.availableFrom || !data.availableTo) {
      return false;
    }

    // End time must be after start time
    return data.availableTo > data.availableFrom;
  },
  {
    message:
      "Available times are required and end time must be after start time",
    path: ["availableTo"],
  }
);

/**
 * Update schema - same as create but without staffId requirement.
 * Used when updating existing availability entries.
 * Uses base schema without refinements since .omit() doesn't work on refined schemas.
 */
export const staffAvailabilityUpdateSchema = staffAvailabilityBaseSchema.omit({
  staffId: true,
});

/**
 * Single day availability input (for bulk operations).
 * Excludes staffId since it's provided at the parent level.
 */
export const dayAvailabilitySchema = z
  .object({
    dayOfWeek: z
      .number()
      .int()
      .min(0, "Day of week must be 0-6")
      .max(6, "Day of week must be 0-6"),
    availableFrom: timeStringSchema,
    availableTo: timeStringSchema,
    preference: preferenceSchema,
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.preference === "unavailable") {
        return true;
      }
      if (!data.availableFrom || !data.availableTo) {
        return false;
      }
      return data.availableTo > data.availableFrom;
    },
    {
      message:
        "Available times are required and end time must be after start time",
      path: ["availableTo"],
    }
  );

/**
 * Bulk availability schema for setting a staff member's weekly availability.
 * One availability window per day (continuous time range).
 * Empty array = staff is unavailable for all days.
 * Max 7 entries = one per day of the week.
 */
export const bulkAvailabilitySchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
  availabilities: z
    .array(dayAvailabilitySchema)
    .max(7, "Cannot have more than 7 entries (one per day)"),
});

/**
 * Schema for querying availability by day.
 */
export const availabilityByDaySchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be 0-6")
    .max(6, "Day of week must be 0-6"),
});

/**
 * Schema for querying availability by staff ID.
 */
export const availabilityByStaffSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
});

/**
 * Schema for querying available staff for a time slot.
 * Used by CandidateService in Sprint 3.5.
 */
export const availableStaffQuerySchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be 0-6")
    .max(6, "Day of week must be 0-6"),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Start time must be in HH:MM format"),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "End time must be in HH:MM format"),
});

// Types inferred from schemas
export type StaffAvailabilityInput = z.infer<typeof staffAvailabilitySchema>;
export type StaffAvailabilityUpdateInput = z.infer<
  typeof staffAvailabilityUpdateSchema
>;
export type DayAvailabilityInput = z.infer<typeof dayAvailabilitySchema>;
export type BulkAvailabilityInput = z.infer<typeof bulkAvailabilitySchema>;
export type AvailableStaffQuery = z.infer<typeof availableStaffQuerySchema>;
