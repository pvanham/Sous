/**
 * Helpers for "calendar date" values — dates whose time component carries
 * no meaning, such as a time-off request's start and end day.
 *
 * The canonical storage form is UTC midnight, so a given calendar day is
 * the same instant no matter which client submitted it. Rendering must
 * therefore pin the timezone to UTC: formatting these values in local
 * time shifts them a day backwards anywhere west of Greenwich.
 *
 * Deliberately free of `date-fns` so the mobile app can share it.
 */

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const YEAR_MONTH_DAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const MONTH_DAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  });
  formatterCache.set(key, formatter);
  return formatter;
}

function snapToUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function coerce(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/**
 * Normalize a calendar date to UTC midnight.
 *
 * A "YYYY-MM-DD" string is read as the calendar day it names. Anything
 * else is snapped using its UTC parts, which is correct for values that
 * are already canonical and best-effort for anything that isn't.
 * Unparseable input yields an Invalid Date so callers can reject it.
 */
export function toCalendarDateUTC(value: string | Date): Date {
  if (typeof value === "string") {
    const match = CALENDAR_DATE_PATTERN.exec(value.trim());
    if (match) {
      return new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      );
    }
  }
  const date = coerce(value);
  return Number.isNaN(date.getTime()) ? date : snapToUtcMidnight(date);
}

/** Render a calendar date as "YYYY-MM-DD" using its UTC parts. */
export function toCalendarDateString(value: string | Date): string {
  const date = coerce(value);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Render a date as "YYYY-MM-DD" using its *local* parts.
 *
 * For values that are genuine instants rather than canonical calendar
 * dates — the current time, or a schedule grid's day column — the local
 * calendar is the one the user is looking at. Comparing the result
 * against `toCalendarDateString` puts both on the same footing.
 */
export function toLocalCalendarDateString(value: string | Date): string {
  const date = coerce(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's calendar day according to the caller's own clock. */
export function todayCalendarDateString(now: Date = new Date()): string {
  return toLocalCalendarDateString(now);
}

/** Format a calendar date for display, e.g. "Sep 20, 2026". */
export function formatCalendarDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = YEAR_MONTH_DAY
): string {
  const date = coerce(value);
  if (Number.isNaN(date.getTime())) return "";
  return getFormatter(options).format(date);
}

/**
 * Format a calendar date span, collapsing where the two ends agree:
 * "Sep 20", "Sep 20–24", or "Sep 20 – Oct 2".
 */
export function formatCalendarRange(
  start: string | Date,
  end: string | Date
): string {
  const startDate = coerce(start);
  const endDate = coerce(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "";
  }

  const startKey = toCalendarDateString(startDate);
  const endKey = toCalendarDateString(endDate);
  if (startKey === endKey) {
    return formatCalendarDate(startDate, MONTH_DAY);
  }

  if (startKey.slice(0, 7) === endKey.slice(0, 7)) {
    return `${formatCalendarDate(startDate, MONTH_DAY)}\u2013${endDate.getUTCDate()}`;
  }

  return `${formatCalendarDate(startDate, MONTH_DAY)} \u2013 ${formatCalendarDate(endDate, MONTH_DAY)}`;
}
