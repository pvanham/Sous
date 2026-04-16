import { z } from "zod";

export const getScheduleHealthParamsSchema = z.object({
  scheduleId: z.string().min(1).optional(),
});

export type GetScheduleHealthParams = z.infer<
  typeof getScheduleHealthParamsSchema
>;

export interface ScheduleHealthSummary {
  scheduleId: string;
  weekStartDate: string;
  status: string;
  totalShifts: number;
  totalStaffScheduled: number;
  totalHoursScheduled: number;
  averageHoursPerStaff: number;
  overtimeRisks: { staffName: string; totalHours: number; threshold: number }[];
  managerCoverageGaps: {
    day: string;
    gaps: { start: string; end: string }[];
  }[];
  unscheduledStaffCount: number;
}
