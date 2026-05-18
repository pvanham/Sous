import { z } from "zod";
import type { ScheduleStatus } from "../index";

// Schedule status enum
export const scheduleStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

/**
 * The configured `weekStartsOn` is per-location, so the day-of-week
 * check moved to the service layer (`ScheduleService.getOrCreateForWeek`)
 * where we can read the live `KitchenConfig`. Here we only assert that
 * the supplied date is normalized to local midnight — a safety net
 * that prevents callers from accidentally storing mid-day timestamps
 * as a week boundary.
 */
const weekStartDateSchema = z.coerce.date().refine(
  (date) =>
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0,
  { message: "Week start date must be at midnight (00:00:00.000)" },
);

// Schema for creating/getting a schedule for a week
export const scheduleWeekSchema = z.object({
  weekStartDate: weekStartDateSchema,
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

// Schema for copying shifts from one week to another. Both anchors are
// week-start dates rather than Schedule ids so the copy survives a
// per-location `weekStartsOn` flip: pre-flip shifts that still live on
// a legacy Schedule doc still show up in the source window, and the
// destination Schedule is created on demand by the action layer.
export const copyWeekSchema = z.object({
  sourceWeekStart: weekStartDateSchema,
  targetWeekStart: weekStartDateSchema,
});

// Full schedule schema (for internal use)
export const scheduleSchema = z.object({
  weekStartDate: weekStartDateSchema,
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
