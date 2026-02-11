import { z } from "zod";

/**
 * Create time-off request schema.
 * Used when a manager submits a time-off request for a staff member.
 * Validates that endDate >= startDate.
 */
export const createTimeOffRequestSchema = z
  .object({
    staffId: z.string().min(1, "Staff ID is required"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z
      .string()
      .max(500, "Reason must be 500 characters or less")
      .optional(),
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

// Types inferred from schemas
export type CreateTimeOffRequestInput = z.infer<
  typeof createTimeOffRequestSchema
>;
export type UpdateTimeOffStatusInput = z.infer<
  typeof updateTimeOffStatusSchema
>;
export type TimeOffByStaffQuery = z.infer<typeof timeOffByStaffSchema>;
export type TimeOffByDateRangeQuery = z.infer<typeof timeOffByDateRangeSchema>;
export type ApprovedTimeOffQuery = z.infer<typeof approvedTimeOffQuerySchema>;
