import { z } from "zod";

export const proposeScheduleGenerationParamsSchema = z.object({
  /** The Monday date (ISO string) for the week to generate */
  weekStartDate: z.string().min(1, "weekStartDate is required"),
  /** Optional: a prior schedule to use as a template */
  templateScheduleId: z.string().optional(),
  /** Optional: specific instructions/constraints in natural language (sanitized on return) */
  additionalInstructions: z.string().max(500).optional(),
});

export type ProposeScheduleGenerationParams = z.infer<
  typeof proposeScheduleGenerationParamsSchema
>;

export interface ScheduleGenerationPayload {
  weekStartDate: string;
  templateScheduleId: string | null;
  additionalInstructions: string;
  staffCount: number;
  configSnapshot: {
    overtimeThresholdHours: number;
    overtimePolicy: string;
    allowClopening: boolean;
  };
  /** Raw timestamps captured at proposal time for per-entity OCC filters */
  _occTimestamps: {
    scheduleUpdatedAt: string | null;
    configUpdatedAt: string | null;
    latestStaffUpdatedAt: string | null;
  };
}
