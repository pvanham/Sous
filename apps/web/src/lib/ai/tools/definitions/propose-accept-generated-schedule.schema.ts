import { z } from "zod";
import { acceptedShiftSchema } from "@/lib/validations/schedule-generation.schema";

export const proposeAcceptGeneratedScheduleParamsSchema = z.object({
  /** The async task ID that produced the schedule */
  taskId: z.string().min(1, "taskId is required"),
});

export type ProposeAcceptGeneratedScheduleParams = z.infer<
  typeof proposeAcceptGeneratedScheduleParamsSchema
>;

/** Shifts persisted on approve — matches acceptGeneratedSchedule action input */
export const acceptScheduleShiftsSchema = z.array(acceptedShiftSchema).min(1);

/**
 * Payload stored on the proposal and executed by execute-proposal
 * (propose_accept_generated_schedule).
 */
export interface AcceptSchedulePayload {
  scheduleId: string;
  shifts: z.infer<typeof acceptScheduleShiftsSchema>;
  /** Original propose_schedule_generation proposal — for cascade UI */
  originatingProposalId: string;
  /** Async task that produced generatedDays */
  originatingTaskId: string;
  totalShiftsGenerated: number;
  totalCostCents: number;
}
