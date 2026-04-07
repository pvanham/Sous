import { z } from "zod";
import { paginationParamsSchema } from "../pagination";
import type { PaginationMeta } from "../pagination";

export const getTimeOffRequestsParamsSchema = z
  .object({
    /** Start of date range (ISO string) */
    startDate: z.string().min(1, "startDate is required"),
    /** End of date range (ISO string) */
    endDate: z.string().min(1, "endDate is required"),
    /** Optional: filter by status */
    status: z.enum(["pending", "approved", "denied"]).optional(),
    /** Optional: filter by staff member */
    staffId: z.string().optional(),
  })
  .merge(paginationParamsSchema);

export type GetTimeOffRequestsParams = z.infer<
  typeof getTimeOffRequestsParamsSchema
>;

export interface TimeOffRequestEntry {
  requestId: string;
  staffName: string;
  staffId: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string;
  notes: string;
  reviewedAt: string | null;
}

export interface TimeOffRequestsResult {
  requests: TimeOffRequestEntry[];
  pagination: PaginationMeta;
  /** Quick aggregate for the LLM */
  summary: {
    totalPending: number;
    totalApproved: number;
    totalDenied: number;
  };
}
