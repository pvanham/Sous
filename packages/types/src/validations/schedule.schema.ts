import { z } from "zod";
import type { ScheduleStatus } from "../index";

// Schedule status enum
export const scheduleStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

/**
 * The configured `weekStartsOn` AND the location's IANA timezone are
 * per-location, so both the day-of-week and the exact-midnight checks
 * live in the service layer (`assertWeekStartAligned`) where we can read
 * the live `KitchenConfig` and `Location`. A week anchor is the UTC
 * instant of midnight *in the location's timezone* (e.g. an
 * `America/New_York` Monday is `04:00`/`05:00Z`, not `00:00Z`), so this
 * schema must NOT assume the server's local midnight — doing so rejected
 * every valid anchor whenever the server timezone differed from the
 * location (e.g. a UTC host).
 *
 * Here we only keep a timezone-agnostic sanity net: the value must be a
 * real instant landing on a minute boundary that a real IANA offset can
 * produce (offsets are whole multiples of 15 minutes), which still
 * blocks an accidental mid-day timestamp like `14:23:11` from being
 * stored as a week boundary.
 */
const weekStartDateSchema = z.coerce.date().refine(
  (date) =>
    !Number.isNaN(date.getTime()) &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0 &&
    date.getUTCMinutes() % 15 === 0,
  { message: "Week start date must fall on a timezone midnight boundary" },
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
