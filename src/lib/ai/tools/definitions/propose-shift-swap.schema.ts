import { z } from "zod";

export const proposeShiftSwapParamsSchema = z.object({
  /** The shift to be reassigned */
  shiftId: z.string().min(1, "shiftId is required"),
  /** The staff member to assign the shift to */
  targetStaffId: z.string().min(1, "targetStaffId is required"),
  /** Optional reason for the swap */
  reason: z.string().max(200).optional(),
});

export type ProposeShiftSwapParams = z.infer<
  typeof proposeShiftSwapParamsSchema
>;

export interface ShiftSwapPayload {
  shiftId: string;
  currentStaffId: string;
  currentStaffName: string;
  targetStaffId: string;
  targetStaffName: string;
  reason: string;
  shiftDetails: {
    day: string;
    start: string;
    end: string;
    station: string;
  };
}
