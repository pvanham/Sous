import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  eachDayOfInterval,
  isMonday,
  getDay,
} from "date-fns";

/**
 * Get the start of the week (Monday) for a given date.
 * @param date - Any date
 * @returns Monday 00:00:00 of that week
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
}

/**
 * Get the end of the week (Sunday) for a given date.
 * @param date - Any date
 * @returns Sunday 23:59:59.999 of that week
 */
export function getWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 });
}

/**
 * Get an array of all 7 days in a week starting from Monday.
 * @param weekStart - The Monday of the week
 * @returns Array of 7 Date objects (Mon-Sun)
 */
export function getWeekDays(weekStart: Date): Date[] {
  return eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 1 }),
  });
}

/**
 * Format a week start date as a human-readable label.
 * @param weekStart - The Monday of the week
 * @returns String like "Week of January 20, 2026"
 */
export function formatWeekLabel(weekStart: Date): string {
  return `Week of ${format(weekStart, "MMMM d, yyyy")}`;
}

/**
 * Format a date as a short day label.
 * @param date - Any date
 * @returns String like "Mon 20"
 */
export function formatDayLabel(date: Date): string {
  return format(date, "EEE d");
}

/**
 * Format a date as a full day label.
 * @param date - Any date
 * @returns String like "Monday, January 20"
 */
export function formatFullDayLabel(date: Date): string {
  return format(date, "EEEE, MMMM d");
}

/**
 * Format a time for display.
 * @param date - Any date
 * @returns String like "9:00am" or "5:30pm"
 */
export function formatTime(date: Date): string {
  return format(date, "h:mma").toLowerCase();
}

/**
 * Format a time range for display.
 * @param start - Start time
 * @param end - End time
 * @returns String like "9:00am - 5:00pm"
 */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Get the next week's Monday.
 * @param date - Any date
 * @returns Monday of the next week
 */
export function getNextWeekStart(date: Date): Date {
  return addWeeks(getWeekStart(date), 1);
}

/**
 * Get the previous week's Monday.
 * @param date - Any date
 * @returns Monday of the previous week
 */
export function getPrevWeekStart(date: Date): Date {
  return subWeeks(getWeekStart(date), 1);
}

/**
 * Check if a date is a Monday.
 * @param date - Any date
 * @returns true if the date is a Monday
 */
export function checkIsMonday(date: Date): boolean {
  return isMonday(date);
}

/**
 * Get the day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 * @param date - Any date
 * @returns Day of week number
 */
export function getDayOfWeek(date: Date): number {
  return getDay(date);
}

/**
 * Calculate shift duration in hours.
 * @param start - Shift start time
 * @param end - Shift end time
 * @returns Duration in hours (e.g., 8.5)
 */
export function calculateShiftDuration(start: Date, end: Date): number {
  const durationMs = end.getTime() - start.getTime();
  return durationMs / (1000 * 60 * 60);
}

/**
 * Format shift duration for display.
 * @param start - Shift start time
 * @param end - Shift end time
 * @returns String like "8h" or "8.5h"
 */
export function formatShiftDuration(start: Date, end: Date): string {
  const hours = calculateShiftDuration(start, end);
  // Round to one decimal place, but show as integer if whole number
  const rounded = Math.round(hours * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded}h`;
}

/**
 * Normalize a date to the start of the day (00:00:00.000).
 * @param date - Any date
 * @returns Date at 00:00:00.000
 */
export function normalizeToStartOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Combine a date and a time string into a Date object.
 * @param date - The date portion
 * @param timeString - Time in "HH:mm" format
 * @returns Combined Date object
 */
export function combineDateTime(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

/**
 * Extract time string from a Date object.
 * @param date - Any date
 * @returns Time in "HH:mm" format
 */
export function extractTimeString(date: Date): string {
  return format(date, "HH:mm");
}
