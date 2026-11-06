import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, startOfWeek } from "date-fns";
import { dayOfWeekToIndex, type DayOfWeek } from "@sous/types";

function localFieldsToIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** The `YYYY-MM-DD` calendar date an instant falls on in the given timezone. */
export function isoDateInTz(date: Date, timezone: string): string {
  return localFieldsToIsoDate(toZonedTime(date, timezone));
}

/** Midnight, in the given timezone, of the calendar day the instant falls on. */
export function startOfDayInTz(date: Date, timezone: string): Date {
  return weekStartInLocationTz(isoDateInTz(date, timezone), timezone);
}

/**
 * Wall-clock `HH:mm` on calendar date `YYYY-MM-DD` in the given timezone,
 * as a UTC instant. Unlike `combineDateTime(parseDateString(...))`, the
 * result does not depend on the server's timezone.
 */
export function zonedDateTime(isoDate: string, time: string, timezone: string): Date {
  return fromZonedTime(`${isoDate}T${time}:00.000`, timezone);
}

/**
 * Week-start instant (location-tz midnight) for the week containing the
 * calendar date `YYYY-MM-DD`. Pure calendar math, so it is the same on a
 * UTC server and a developer laptop.
 */
export function weekStartForIsoDateInTz(
  isoDate: string,
  weekStartsOn: DayOfWeek,
  timezone: string,
): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const anchor = startOfWeek(new Date(year, month - 1, day), {
    weekStartsOn: dayOfWeekToIndex(weekStartsOn),
  });
  return weekStartInLocationTz(localFieldsToIsoDate(anchor), timezone);
}

/**
 * Week-start instant for an AI- or client-supplied week reference: either a
 * `YYYY-MM-DD` calendar date or a full ISO timestamp. Returns null when the
 * value does not parse.
 */
export function weekStartFromInputInTz(
  value: string,
  weekStartsOn: DayOfWeek,
  timezone: string,
): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return weekStartForIsoDateInTz(value, weekStartsOn, timezone);
  }
  const instant = new Date(value);
  if (isNaN(instant.getTime())) return null;
  return weekStartForIsoDateInTz(isoDateInTz(instant, timezone), weekStartsOn, timezone);
}

/**
 * Move a week-start instant by `weeks` on the location's calendar and
 * re-anchor to `weekStartsOn`. Stepping by calendar days (not 7 * 24h)
 * keeps the anchor on local midnight across DST changes, and stays
 * correct when the browser's timezone differs from the location's.
 */
export function addWeeksInTz(
  weekStart: Date,
  weeks: number,
  weekStartsOn: DayOfWeek,
  timezone: string,
): Date {
  const zoned = toZonedTime(weekStart, timezone);
  return weekStartForIsoDateInTz(
    localFieldsToIsoDate(addDays(zoned, weeks * 7)),
    weekStartsOn,
    timezone,
  );
}

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
  // Read today's date on the location's calendar, not the server's.
  return weekStartForIsoDateInTz(isoDateInTz(now, timezone), weekStartsOn, timezone);
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
