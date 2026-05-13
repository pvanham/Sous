import { dayOfWeekToIndex, type DayOfWeek } from "@sous/types";

// ─────────────────────────────────────────────────────────────
// Mobile date helpers — week-boundary math anchored to the
// location's configured `weekStartsOn`. Mirrors the web helpers
// at `apps/web/src/lib/utils/date.ts` so the two apps agree on
// week boundaries without duplicating the day-name → index map.
//
// These functions intentionally take `weekStartsOn` as an
// explicit argument rather than reading it from a store: pure
// functions are easier to test, and the screens already pull
// the value from `useWeekStartsOn()` on the auth store.
// ─────────────────────────────────────────────────────────────

/**
 * Return the most recent occurrence of the location's configured
 * first day of the week, at local midnight. The result is the same
 * day or earlier than `date`.
 */
export function getWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  const startIndex = dayOfWeekToIndex(weekStartsOn);
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const offset = (result.getDay() - startIndex + 7) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

/**
 * Return the week-start exactly 7 calendar days after the input date's
 * week. Uses `setDate` rather than a millisecond offset because DST
 * transitions inside a week make the UTC instant +/-1h shorter or
 * longer than 168h, which would land the next anchor at 01:00 or 23:00
 * local instead of midnight.
 */
export function getNextWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  const ws = getWeekStart(date, weekStartsOn);
  ws.setDate(ws.getDate() + 7);
  return ws;
}

/**
 * Return the week-start exactly 7 calendar days before the input date's
 * week. See `getNextWeekStart` for the DST rationale on `setDate`.
 */
export function getPrevWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  const ws = getWeekStart(date, weekStartsOn);
  ws.setDate(ws.getDate() - 7);
  return ws;
}

/**
 * Serialise a `Date` as a `YYYY-MM-DD` calendar string for `weekStart`
 * query parameters. Matches the convention `/api/shifts` enforces — the
 * route reconstructs the UTC instant via `weekStartInLocationTz`, so
 * the device-local TZ doesn't affect what the server sees.
 */
export function toIsoCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Return the seven Date objects (at local midnight) that make up the
 * week starting at `weekStart`. Caller must pass an already-aligned
 * anchor date (typically the result of `getWeekStart`).
 */
export function getWeekDays(weekStart: Date, _weekStartsOn: DayOfWeek): Date[] {
  // weekStartsOn is accepted for API symmetry with the web helper but
  // isn't needed once the anchor is supplied — the days are simply 0..6
  // calendar days from the anchor.
  void _weekStartsOn;
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
