import { z } from "zod";

export const proposeScheduleGenerationParamsSchema = z.object({
  /** The Monday date (ISO string) for the week to generate. REQUIRED. */
  weekStartDate: z.string().min(1, "weekStartDate is required")
    .describe("The Monday date (ISO string, e.g. '2026-04-06') for the week to generate. This is the only required parameter."),
  /** Optional: a prior schedule to use as a template. Omit unless the user explicitly provides one. */
  templateScheduleId: z.string().optional()
    .describe("Optional. A prior schedule ID to use as a template. Omit this unless the user explicitly provides a template. Do NOT ask the user for this."),
  /** Optional: specific instructions/constraints in natural language (sanitized on return) */
  additionalInstructions: z.string().max(500).optional()
    .describe("Optional. Additional instructions or constraints in natural language. Omit unless the user explicitly provides special instructions."),
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
