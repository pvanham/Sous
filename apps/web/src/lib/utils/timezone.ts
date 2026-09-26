import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfWeek } from "date-fns";
import { dayOfWeekToIndex, type DayOfWeek } from "@sous/types";

/**
 * Convert a YYYY-MM-DD calendar date to the UTC instant of midnight in
 * the given IANA timezone. Manager and staff query boundaries flow
 * through this helper so a California restaurant's "Monday May 11" maps
 * to 07:00 UTC, not 00:00 UTC — otherwise a Sat 23:00 PDT shift falls
 * into the wrong wall-clock week.
 */
export function weekStartInLocationTz(isoDate: string, timezone: string): Date {
  return fromZonedTime(`${isoDate}T00:00:00.000`, timezone);
}

/**
 * Resolve the current week's start anchor as the UTC instant of midnight
 * in the location's IANA timezone.
 *
 * This is the timezone-correct analog of `date.ts#getWeekStart`, which
 * anchors to the *server's* local timezone. On a deployment whose
 * timezone differs from the location (e.g. a UTC host serving an
 * `America/New_York` kitchen), `getWeekStart` produces the wrong instant
 * and `assertWeekStartAligned` then rejects it — leaving manager reads
 * with an empty week. Schedules persist `weekStartDate` as location-tz
 * midnight and `assertWeekStartAligned` validates the weekday in the
 * location tz, so the "current week" anchor must be derived in that tz
 * too, regardless of where the server runs.
 */
export function currentWeekStartInLocationTz(
  weekStartsOn: DayOfWeek,
  timezone: string,
  now: Date = new Date(),
): Date {
  // Project the instant onto the location's wall clock so date-fns'
  // local-field math walks back to the configured first day of the week
  // in the location's calendar, not the server's.
  const zonedNow = toZonedTime(now, timezone);
  const zonedWeekStart = startOfWeek(zonedNow, {
    weekStartsOn: dayOfWeekToIndex(weekStartsOn),
  });
  const isoDate = `${zonedWeekStart.getFullYear()}-${String(
    zonedWeekStart.getMonth() + 1,
  ).padStart(2, "0")}-${String(zonedWeekStart.getDate()).padStart(2, "0")}`;
  return weekStartInLocationTz(isoDate, timezone);
}

/**
 * Return the calendar weekday (0=Sun..6=Sat) of a UTC instant as it
 * appears in the given timezone. Used by `assertWeekStartAligned` so a
 * `weekStartDate` of 07:00 UTC still validates as Monday when the
 * location is `America/Los_Angeles`, regardless of the server's TZ.
 */
export function getDayOfWeekInTz(date: Date, timezone: string): number {
  return toZonedTime(date, timezone).getDay();
}
