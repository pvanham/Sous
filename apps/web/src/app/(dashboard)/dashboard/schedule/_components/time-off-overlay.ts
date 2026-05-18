import type { TimeOffRequestDTO } from "@/types/time-off-request";

/**
 * Local-day comparison used by the grid overlays: a time-off request
 * applies to a given day when the day falls between the request's
 * start and end (inclusive) using the browser's local calendar. We
 * deliberately compare on calendar fields rather than UTC instants so a
 * request seeded as midnight-UTC (the legacy normalization) still
 * matches the day a manager sees on the grid.
 */
function calendarDayKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Return the most relevant time-off overlay for a (staff, day) cell:
 * an approved request outranks a pending one. Returns `undefined` when
 * no request applies, so the cell renderer can `&&` the result.
 *
 * Approved status wins because it represents a definitive "won't be
 * available"; pending is only a hint that a manager should consider
 * before scheduling. If two requests share the highest status, the
 * earliest-starting one wins (matches the service sort).
 */
export function findTimeOffOverlay(
  timeOff: TimeOffRequestDTO[] | undefined,
  staffId: string,
  day: Date,
): TimeOffRequestDTO | undefined {
  if (!timeOff || timeOff.length === 0) return undefined;
  const dayKey = calendarDayKey(day);
  let approved: TimeOffRequestDTO | undefined;
  let pending: TimeOffRequestDTO | undefined;

  for (const request of timeOff) {
    if (request.staffId !== staffId) continue;
    const start = calendarDayKey(new Date(request.startDate));
    const end = calendarDayKey(new Date(request.endDate));
    if (dayKey < start || dayKey > end) continue;

    if (request.status === "approved") {
      if (!approved || new Date(request.startDate) < new Date(approved.startDate)) {
        approved = request;
      }
    } else if (request.status === "pending") {
      if (!pending || new Date(request.startDate) < new Date(pending.startDate)) {
        pending = request;
      }
    }
  }

  return approved ?? pending;
}
