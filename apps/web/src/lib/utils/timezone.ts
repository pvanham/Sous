import { fromZonedTime, toZonedTime } from "date-fns-tz";

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
 * Return the calendar weekday (0=Sun..6=Sat) of a UTC instant as it
 * appears in the given timezone. Used by `assertWeekStartAligned` so a
 * `weekStartDate` of 07:00 UTC still validates as Monday when the
 * location is `America/Los_Angeles`, regardless of the server's TZ.
 */
export function getDayOfWeekInTz(date: Date, timezone: string): number {
  return toZonedTime(date, timezone).getDay();
}
