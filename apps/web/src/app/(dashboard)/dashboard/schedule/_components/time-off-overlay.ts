import {
  toCalendarDateString,
  toLocalCalendarDateString,
} from "@sous/types/utils/calendar-date";

import type { TimeOffRequestDTO } from "@/types/time-off-request";

/**
 * The two sides of this comparison are different kinds of Date, so they
 * are keyed differently. A grid `day` is an instant anchored to the
 * location's week start, and the manager reads it off the column header
 * in local time. A request boundary is a canonical calendar date stored
 * at UTC midnight. Both reduce to "YYYY-MM-DD", which compares
 * lexicographically.
 */

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
  const dayKey = toLocalCalendarDateString(day);
  let approved: TimeOffRequestDTO | undefined;
  let pending: TimeOffRequestDTO | undefined;

  for (const request of timeOff) {
    if (request.staffId !== staffId) continue;
    const start = toCalendarDateString(request.startDate);
    const end = toCalendarDateString(request.endDate);
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
