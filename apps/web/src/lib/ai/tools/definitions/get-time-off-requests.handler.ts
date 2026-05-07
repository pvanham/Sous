import type {
  GetTimeOffRequestsParams,
  TimeOffRequestEntry,
  TimeOffRequestsResult,
} from "./get-time-off-requests.schema";
import type { ToolExecutionContext } from "../tool-registry.types";
import { paginate } from "../pagination";
import { sanitizeUserText } from "../sanitize";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import { StaffService } from "@/server/services/staff.service";

function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export async function executeGetTimeOffRequests(
  params: GetTimeOffRequestsParams,
  context: ToolExecutionContext
): Promise<TimeOffRequestsResult> {
  const startDate = parseISODate(params.startDate);
  const endDate = parseISODate(params.endDate);

  if (!startDate || !endDate) {
    throw new Error(
      "Invalid date format for startDate/endDate. Expected ISO date string (e.g., '2026-03-17')."
    );
  }

  const [requests, staff] = await Promise.all([
    TimeOffRequestService.getByDateRange(
      context.orgId,
      context.locationId,
      startDate,
      endDate
    ),
    StaffService.list(context.orgId, context.locationId),
  ]);

  const staffById = new Map(staff.map((s) => [s.id, s]));

  let filtered = requests;

  if (params.status) {
    filtered = filtered.filter((r) => r.status === params.status);
  }

  if (params.staffId) {
    filtered = filtered.filter((r) => r.staffId === params.staffId);
  }

  const summary = {
    totalPending: filtered.filter((r) => r.status === "pending").length,
    totalApproved: filtered.filter((r) => r.status === "approved").length,
    totalDenied: filtered.filter((r) => r.status === "denied").length,
  };

  const entries: TimeOffRequestEntry[] = filtered.map((req) => {
    const member = staffById.get(req.staffId);
    return {
      requestId: req.id,
      staffName: member?.name ?? "Unknown Staff",
      staffId: req.staffId,
      startDate: req.startDate.toISOString(),
      endDate: req.endDate.toISOString(),
      status: req.status,
      reason: sanitizeUserText(req.reason),
      notes: sanitizeUserText(req.notes),
      reviewedAt: req.reviewedAt?.toISOString() ?? null,
    };
  });

  const paginated = paginate(entries, {
    page: params.page,
    pageSize: params.pageSize,
  });

  return {
    requests: paginated.items,
    pagination: paginated.pagination,
    summary,
  };
}
