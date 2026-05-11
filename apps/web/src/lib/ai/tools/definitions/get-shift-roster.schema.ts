import { z } from "zod";
import { paginationParamsSchema } from "../pagination";
import type { PaginationMeta } from "../pagination";

export const getShiftRosterParamsSchema = z
  .object({
    scheduleId: z.string().min(1).optional(),
    staffId: z.string().optional(),
    dayOfWeek: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe(
        "Day of the week as an offset from the location's configured first day (0 = first day, 6 = last day; with the default Monday week start, 0 = Monday and 6 = Sunday).",
      ),
  })
  .merge(paginationParamsSchema);

export type GetShiftRosterParams = z.infer<typeof getShiftRosterParamsSchema>;

export interface ShiftRosterEntry {
  shiftId: string;
  staffName: string;
  staffId: string;
  day: string;
  start: string;
  end: string;
  hours: number;
  station: string;
  notes: string;
}

export interface ShiftRosterResult {
  scheduleId: string;
  shifts: ShiftRosterEntry[];
  pagination: PaginationMeta;
}
