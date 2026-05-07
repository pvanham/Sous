import { z } from "zod";

// Maximum shift duration in milliseconds (12 hours)
const MAX_SHIFT_DURATION_MS = 12 * 60 * 60 * 1000;

// Schema for creating a shift
export const createShiftSchema = z
  .object({
    scheduleId: z.string().min(1, "Schedule ID is required"),
    staffId: z.string().min(1, "Staff ID is required"),
    start: z.coerce.date(),
    end: z.coerce.date(),
    station: z.string().min(1, "Station is required"),
    notes: z.string().max(500, "Notes cannot exceed 500 characters").optional().default(""),
  })
  .refine((data) => data.start < data.end, {
    message: "End time must be after start time",
    path: ["end"],
  })
  .refine(
    (data) => {
      const duration = data.end.getTime() - data.start.getTime();
      return duration <= MAX_SHIFT_DURATION_MS;
    },
    {
      message: "Shift duration cannot exceed 12 hours",
      path: ["end"],
    }
  );

// Schema for updating a shift
export const updateShiftSchema = z
  .object({
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
    station: z.string().min(1, "Station is required").optional(),
    notes: z.string().max(500, "Notes cannot exceed 500 characters").optional(),
  })
  .refine(
    (data) => {
      // If both start and end are provided, validate order
      if (data.start && data.end) {
        return data.start < data.end;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["end"],
    }
  )
  .refine(
    (data) => {
      // If both start and end are provided, validate duration
      if (data.start && data.end) {
        const duration = data.end.getTime() - data.start.getTime();
        return duration <= MAX_SHIFT_DURATION_MS;
      }
      return true;
    },
    {
      message: "Shift duration cannot exceed 12 hours",
      path: ["end"],
    }
  );

// Schema for listing shifts by schedule
export const listShiftsByScheduleSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
});

// Schema for deleting a shift
export const deleteShiftSchema = z.object({
  shiftId: z.string().min(1, "Shift ID is required"),
});

// Types inferred from schemas
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsByScheduleInput = z.infer<typeof listShiftsByScheduleSchema>;
export type DeleteShiftInput = z.infer<typeof deleteShiftSchema>;
