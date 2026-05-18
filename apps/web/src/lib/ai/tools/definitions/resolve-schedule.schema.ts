import { z } from "zod";

export const resolveScheduleParamsSchema = z.object({
  weekDate: z
    .string()
    .min(1)
    .describe(
      "Any date (ISO format, e.g. '2026-03-30') that falls within the target week. " +
        "The handler normalizes it to the location's configured first day of the week (default Monday).",
    ),
});

export type ResolveScheduleParams = z.infer<typeof resolveScheduleParamsSchema>;

export interface ResolveScheduleResult {
  found: boolean;
  scheduleId: string | null;
  /** ISO date string of the configured week-start (default Monday) for this week */
  weekStartDate: string;
  /** Human-readable label, e.g. "March 30, 2026" */
  weekLabel: string;
  /** "DRAFT" | "PUBLISHED" | null */
  status: string | null;
  /** Number of shifts in this schedule (0 if empty or not found) */
  shiftCount: number;
}
