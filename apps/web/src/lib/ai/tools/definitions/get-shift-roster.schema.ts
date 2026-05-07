import { z } from "zod";
import { paginationParamsSchema } from "../pagination";
import type { PaginationMeta } from "../pagination";

export const getShiftRosterParamsSchema = z
  .object({
    scheduleId: z.string().min(1).optional(),
    staffId: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
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
