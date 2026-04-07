import { z } from "zod";

export const proposeShiftSwapParamsSchema = z.object({
  /** The shift to be reassigned */
  shiftId: z.string().min(1, "shiftId is required"),
  /** The staff member ID to assign the shift to (takes precedence over targetStaffName) */
  targetStaffId: z.string().min(1).optional(),
  /** The staff member name to assign the shift to (used when targetStaffId is not provided) */
  targetStaffName: z.string().min(1).optional(),
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
