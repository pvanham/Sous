import crypto from "crypto";
import type {
  ProposeShiftSwapParams,
  ShiftSwapPayload,
} from "./propose-shift-swap.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import type { ToolProposal } from "../tool-proposal.types";
import { sanitizeUserText } from "../sanitize";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

export async function executeProposeShiftSwap(
  params: ProposeShiftSwapParams,
  context: ToolExecutionContext
): Promise<ToolProposal<ShiftSwapPayload> | null> {
  const shift = await ShiftService.getById(
    context.orgId,
    context.locationId,
    params.shiftId
  );
  if (!shift) return null;

  const [currentStaff, targetStaff] = await Promise.all([
    StaffService.getById(context.orgId, context.locationId, shift.staffId),
    StaffService.getById(
      context.orgId,
      context.locationId,
      params.targetStaffId
    ),
  ]);

  if (!targetStaff) return null;

  const currentStaffName = currentStaff?.name ?? "Unknown Staff";
  const targetStaffName = targetStaff.name;

  const startDate = new Date(shift.start);
  const endDate = new Date(shift.end);

  const day = dayFormatter.format(startDate);
  const start = timeFormatter.format(startDate);
  const end = timeFormatter.format(endDate);

  const dataVersion = crypto
    .createHash("md5")
    .update(shift.updatedAt.toISOString())
    .digest("hex");

  const description = `Reassign '${day} ${start} - ${end} (${shift.station})' from ${currentStaffName} to ${targetStaffName}`;

  const payload: ShiftSwapPayload = {
    shiftId: shift.id,
    currentStaffId: shift.staffId,
    currentStaffName,
    targetStaffId: targetStaff.id,
    targetStaffName,
    reason: sanitizeUserText(params.reason),
    shiftDetails: { day, start, end, station: shift.station },
  };

  return {
    proposalId: crypto.randomUUID(),
    toolName: "propose_shift_swap",
    description,
    payload,
    dataVersion,
    type: "write",
  };
}
