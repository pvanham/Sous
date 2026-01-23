import { z } from "zod";
import type { ScheduleStatus } from "@/types/schedule";

// Schedule status enum
export const scheduleStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

// Schema for creating/getting a schedule for a week
export const scheduleWeekSchema = z.object({
  weekStartDate: z.coerce.date().refine(
    (date) => date.getDay() === 1, // 1 = Monday
    { message: "Week start date must be a Monday" }
  ),
});

// Schema for updating schedule status
export const scheduleStatusUpdateSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
  status: scheduleStatusSchema,
});

// Schema for updating schedule notes
export const scheduleNotesUpdateSchema = z.object({
  scheduleId: z.string().min(1, "Schedule ID is required"),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").optional(),
});

// Schema for copying shifts from one week to another
export const copyWeekSchema = z.object({
  sourceScheduleId: z.string().min(1, "Source schedule ID is required"),
  targetWeekStart: z.coerce.date().refine(
    (date) => date.getDay() === 1, // 1 = Monday
    { message: "Target week start date must be a Monday" }
  ),
});

// Full schedule schema (for internal use)
export const scheduleSchema = z.object({
  weekStartDate: z.coerce.date().refine(
    (date) => date.getDay() === 1,
    { message: "Week start date must be a Monday" }
  ),
  status: scheduleStatusSchema.default("DRAFT"),
  notes: z.string().max(500).optional().default(""),
});

// Types inferred from schemas
export type ScheduleWeekInput = z.infer<typeof scheduleWeekSchema>;
export type ScheduleStatusUpdateInput = z.infer<typeof scheduleStatusUpdateSchema>;
export type ScheduleNotesUpdateInput = z.infer<typeof scheduleNotesUpdateSchema>;
export type CopyWeekInput = z.infer<typeof copyWeekSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;

// Re-export status type for convenience
export type { ScheduleStatus };
