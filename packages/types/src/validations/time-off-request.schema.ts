import { z } from "zod";
import {
  toCalendarDateString,
  toCalendarDateUTC,
  todayCalendarDateString,
} from "../utils/calendar-date";

/**
 * Allowed values for `TimeOffRequest.type`. Mirrors the
 * `TimeOffRequestType` union in `@sous/types`. Keep both in sync.
 */
export const timeOffRequestTypeSchema = z.enum(["pto", "sick", "unpaid"]);

/**
 * A calendar date with no meaningful time component, normalized to UTC
 * midnight so web (`<input type="date">`) and mobile (native picker)
 * land on the same instant for the same day.
 *
 * Accepts a "YYYY-MM-DD" string or a `Date`; anything unparseable —
 * including the empty string an untouched date input submits — fails
 * with a readable message rather than Zod's raw type error.
 */
function calendarDate(label: string) {
  return z
    .union([z.string(), z.date()], { error: `Enter a valid ${label}` })
    .transform(toCalendarDateUTC)
    .refine((date) => !Number.isNaN(date.getTime()), {
      message: `Enter a valid ${label}`,
    });
}

/** True when `startDate` falls on or after the caller's own current day. */
function isNotInThePast(data: { startDate: Date }): boolean {
  return toCalendarDateString(data.startDate) >= todayCalendarDateString();
}

/**
 * Create time-off request schema.
 * Used when a manager submits a time-off request for a staff member.
 * Validates that startDate is not in the past and endDate >= startDate.
 * Note: The configurable minTimeOffAdvanceDays check is in the action layer
 * since Zod schemas cannot access DB-stored settings at parse time.
 */
export const createTimeOffRequestSchema = z
  .object({
    staffId: z.string().min(1, "Staff ID is required"),
    startDate: calendarDate("start date"),
    endDate: calendarDate("end date"),
    type: timeOffRequestTypeSchema.optional(),
    reason: z
      .string()
      .max(500, "Reason must be 500 characters or less")
      .optional(),
  })
  .refine(isNotInThePast, {
    message: "Start date cannot be in the past",
    path: ["startDate"],
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

/**
 * Submit time-off request schema — used by the mobile staff app.
 *
 * Differs from `createTimeOffRequestSchema` (manager flow) in two ways:
 *
 * - Omits `staffId`. The mobile API resolves the calling user's Staff
 *   record server-side from their Clerk JWT. Trusting a `staffId` from
 *   a phone client would let any staff member submit time off on
 *   another person's behalf.
 * - Promotes `type` to required, since the mobile request modal makes
 *   the user pick one explicitly (PTO / Sick / Unpaid). The manager
 *   flow remains backwards-compatible with `type` optional.
 *
 * The `minTimeOffAdvanceDays` rule still lives in the route handler
 * because it depends on the location's `KitchenConfig`.
 */
export const submitTimeOffRequestSchema = z
  .object({
    startDate: calendarDate("start date"),
    endDate: calendarDate("end date"),
    type: timeOffRequestTypeSchema,
    reason: z
      .string()
      .max(500, "Reason must be 500 characters or less")
      .optional(),
  })
  .refine(isNotInThePast, {
    message: "Start date cannot be in the past",
    path: ["startDate"],
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

/**
 * Update time-off request status schema.
 * Used when a manager approves or denies a request.
 * Only allows 'approved' or 'denied' (not 'pending').
 */
export const updateTimeOffStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  status: z.enum(["approved", "denied"]),
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or less")
    .optional(),
});

/**
 * Reset time-off request status schema.
 * Used when a manager walks back a mistaken approval or denial. Separate
 * from `updateTimeOffStatusSchema` because returning a request to the
 * queue takes no reviewer decision and no note.
 */
export const resetTimeOffStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
});

/**
 * Schema for querying time-off requests by staff ID.
 */
export const timeOffByStaffSchema = z.object({
  staffId: z.string().min(1, "Staff ID is required"),
});

/**
 * Schema for querying time-off requests by date range.
 * Returns all requests overlapping the given range (any status).
 */
export const timeOffByDateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

/**
 * Schema for querying approved time off for a staff member in a date range.
 * Used by CandidateService (Sprint 3.5) to exclude staff from shift assignments.
 */
export const approvedTimeOffQuerySchema = z
  .object({
    staffId: z.string().min(1, "Staff ID is required"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

// Types inferred from schemas.
//
// The two create inputs sit on opposite sides of the calendar-date
// transform: the web service consumes already-parsed data (`Date`), while
// the mobile client builds the payload before it is parsed and sends
// "YYYY-MM-DD" strings over the wire.
export type CreateTimeOffRequestInput = z.infer<
  typeof createTimeOffRequestSchema
>;
export type SubmitTimeOffRequestInput = z.input<
  typeof submitTimeOffRequestSchema
>;
export type UpdateTimeOffStatusInput = z.infer<
  typeof updateTimeOffStatusSchema
>;
export type ResetTimeOffStatusInput = z.infer<typeof resetTimeOffStatusSchema>;
export type TimeOffByStaffQuery = z.infer<typeof timeOffByStaffSchema>;
export type TimeOffByDateRangeQuery = z.infer<typeof timeOffByDateRangeSchema>;
export type ApprovedTimeOffQuery = z.infer<typeof approvedTimeOffQuerySchema>;
