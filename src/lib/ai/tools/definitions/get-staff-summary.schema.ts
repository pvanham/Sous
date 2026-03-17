import { z } from "zod";

export const getStaffSummaryParamsSchema = z.object({
  /** Optional: filter to only active staff (default: true) */
  activeOnly: z.boolean().default(true),
});

export type GetStaffSummaryParams = z.infer<typeof getStaffSummaryParamsSchema>;

export interface StaffSummary {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  /** Distribution of staff across roles */
  roleDistribution: { role: string; count: number }[];
  /** Distribution of staff skill proficiency by station */
  stationCoverage: {
    station: string;
    staffCount: number;
    avgProficiency: number;
  }[];
  /** Aggregate hour constraints */
  hoursSummary: {
    avgMaxHoursPerWeek: number;
    avgMinHoursPerWeek: number;
    totalAvailableHours: number;
  };
}
