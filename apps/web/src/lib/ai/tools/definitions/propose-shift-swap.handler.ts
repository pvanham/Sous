import type {
  ProposeShiftSwapParams,
  ShiftSwapPayload,
} from "./propose-shift-swap.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import type { ToolProposal } from "../tool-proposal.types";
import { sanitizeUserText } from "../sanitize";
import { computeDataVersion } from "@/lib/ai/orchestrator/occ";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";

function createFormatters(tz: string) {
  return {
    day: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }),
  };
}

export async function executeProposeShiftSwap(
  params: ProposeShiftSwapParams,
  context: ToolExecutionContext
): Promise<ToolProposal<ShiftSwapPayload> | null> {
  if (!params.targetStaffId && !params.targetStaffName) return null;

  const shift = await ShiftService.getById(
    context.orgId,
    context.locationId,
    params.shiftId
  );
  if (!shift) return null;

  const currentStaffPromise = StaffService.getById(
    context.orgId,
    context.locationId,
    shift.staffId
  );
  const targetStaffPromise = params.targetStaffId
    ? StaffService.getById(
        context.orgId,
        context.locationId,
        params.targetStaffId
      )
    : (async () => {
        const targetName = params.targetStaffName?.trim().toLowerCase();
        if (!targetName) return null;

        const staff = await StaffService.list(context.orgId, context.locationId);
        const matches = staff.filter(
          (member) => member.name.trim().toLowerCase() === targetName
        );
        if (matches.length !== 1) return null;
        return matches[0];
      })();

  const [currentStaff, targetStaff] = await Promise.all([
    currentStaffPromise,
    targetStaffPromise,
  ]);

  if (!targetStaff) return null;

  const currentStaffName = currentStaff?.name ?? "Unknown Staff";
  const targetStaffName = targetStaff.name;

  const tz = context.timezone || "UTC";
  const fmt = createFormatters(tz);

  const startDate = new Date(shift.start);
  const endDate = new Date(shift.end);

  const day = fmt.day.format(startDate);
  const start = fmt.time.format(startDate);
  const end = fmt.time.format(endDate);

  const dataVersion = computeDataVersion(shift.updatedAt);

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
