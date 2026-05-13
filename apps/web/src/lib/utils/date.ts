import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  eachDayOfInterval,
  getDay,
} from "date-fns";
import { dayOfWeekToIndex, type DayOfWeek } from "@sous/types";

/**
 * Get the start of the week for a given date, anchored to the location's
 * configured `weekStartsOn`. Callers must always pass the value resolved
 * from `KitchenConfig` (see `KitchenConfigService.getWeekStartsOn`) — the
 * helper takes no default so we can't accidentally regress to a hardcoded
 * Monday assumption.
 *
 * @param date - Any date
 * @param weekStartsOn - The location's configured first day of the week
 * @returns Anchor day at 00:00:00 of that week
 */
export function getWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  return startOfWeek(date, { weekStartsOn: dayOfWeekToIndex(weekStartsOn) });
}

/**
 * Get the end of the week (one ms before the next anchor day) for a given date.
 * @param date - Any date
 * @param weekStartsOn - The location's configured first day of the week
 * @returns 23:59:59.999 on the day before the next anchor
 */
export function getWeekEnd(date: Date, weekStartsOn: DayOfWeek): Date {
  return endOfWeek(date, { weekStartsOn: dayOfWeekToIndex(weekStartsOn) });
}

/**
 * Get an array of all 7 days in a week starting from the location's anchor.
 * @param weekStart - The week-start date (already aligned to `weekStartsOn`)
 * @param weekStartsOn - The location's configured first day of the week
 * @returns Array of 7 Date objects in chronological order from the anchor
 */
export function getWeekDays(weekStart: Date, weekStartsOn: DayOfWeek): Date[] {
  return eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: dayOfWeekToIndex(weekStartsOn) }),
  });
}

/**
 * Format a week start date as a human-readable label.
 * @param weekStart - The week-start date
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
 * Get the next week's anchor date for the location.
 * @param date - Any date
 * @param weekStartsOn - The location's configured first day of the week
 * @returns Anchor day of the next week
 */
export function getNextWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  return addWeeks(getWeekStart(date, weekStartsOn), 1);
}

/**
 * Get the previous week's anchor date for the location.
 * @param date - Any date
 * @param weekStartsOn - The location's configured first day of the week
 * @returns Anchor day of the previous week
 */
export function getPrevWeekStart(date: Date, weekStartsOn: DayOfWeek): Date {
  return subWeeks(getWeekStart(date, weekStartsOn), 1);
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
 * Parse a "YYYY-MM-DD" date string as local midnight.
 * Unlike `new Date("YYYY-MM-DD")` which parses as UTC midnight,
 * this uses the `Date(year, month, day)` constructor so the
 * result is always midnight in the local (server/browser) timezone.
 * @param dateStr - Date in "YYYY-MM-DD" format
 * @returns Date at local midnight
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
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

/**
 * Generate an array of time slots between start and end times.
 * @param startTime - Start time in "HH:mm" format
 * @param endTime - End time in "HH:mm" format
 * @param intervalMinutes - Interval between slots (default: 30)
 * @returns Array of time strings in "HH:mm" format
 */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number = 30,
): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    );
    currentMinutes += intervalMinutes;
  }

  return slots;
}

/**
 * Get the earliest opening and latest closing times from kitchen config.
 * Adds 2 hours padding before opening and after closing to accommodate
 * opening/closing shifts (prep before open, cleanup after close).
 *
 * @param operatingHours - Weekly operating hours from KitchenConfig
 * @returns Object with earliest open time and latest close time (with 2hr padding)
 */
export function getOperatingHoursRange(operatingHours: {
  monday: { isOpen: boolean; open?: string; close?: string };
  tuesday: { isOpen: boolean; open?: string; close?: string };
  wednesday: { isOpen: boolean; open?: string; close?: string };
  thursday: { isOpen: boolean; open?: string; close?: string };
  friday: { isOpen: boolean; open?: string; close?: string };
  saturday: { isOpen: boolean; open?: string; close?: string };
  sunday: { isOpen: boolean; open?: string; close?: string };
}): { earliest: string; latest: string } {
  const days = [
    operatingHours.monday,
    operatingHours.tuesday,
    operatingHours.wednesday,
    operatingHours.thursday,
    operatingHours.friday,
    operatingHours.saturday,
    operatingHours.sunday,
  ];

  let earliestMinutes = 24 * 60; // Start with end of day
  let latestMinutes = 0; // Start with beginning of day

  for (const day of days) {
    if (day.isOpen && day.open && day.close) {
      const [openHour, openMin] = day.open.split(":").map(Number);
      const [closeHour, closeMin] = day.close.split(":").map(Number);

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (openMinutes < earliestMinutes) {
        earliestMinutes = openMinutes;
      }
      if (closeMinutes > latestMinutes) {
        latestMinutes = closeMinutes;
      }
    }
  }

  // Default to 6am - 11pm if no hours are set
  if (earliestMinutes === 24 * 60) earliestMinutes = 6 * 60;
  if (latestMinutes === 0) latestMinutes = 23 * 60;

  // Add 2 hours padding before and after for opening/closing shifts
  // Clamp to valid range (0:00 - 24:00)
  earliestMinutes = Math.max(0, earliestMinutes - 120);
  latestMinutes = Math.min(24 * 60, latestMinutes + 120);

  const earliestHours = Math.floor(earliestMinutes / 60);
  const earliestMins = earliestMinutes % 60;
  const latestHours = Math.floor(latestMinutes / 60);
  const latestMins = latestMinutes % 60;

  return {
    earliest: `${String(earliestHours).padStart(2, "0")}:${String(earliestMins).padStart(2, "0")}`,
    latest: `${String(latestHours).padStart(2, "0")}:${String(latestMins).padStart(2, "0")}`,
  };
}

/**
 * Day key type for operating hours lookup.
 */
export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Get the day key from a Date object.
 * @param date - Any date
 * @returns Day key for operating hours lookup
 */
export function getDayKey(date: Date): DayKey {
  const dayIndex = getDay(date); // 0 = Sunday, 1 = Monday, etc.
  const dayKeys: DayKey[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return dayKeys[dayIndex];
}

/**
 * Get the store hours for a specific day (WITHOUT buffer).
 * Returns the actual open/close times from operating hours config.
 *
 * @param operatingHours - Weekly operating hours from KitchenConfig
 * @param day - The day to get store hours for
 * @returns Object with open and close times, or null if closed
 */
export function getStoreHoursForDay(
  operatingHours: {
    monday: { isOpen: boolean; open?: string; close?: string };
    tuesday: { isOpen: boolean; open?: string; close?: string };
    wednesday: { isOpen: boolean; open?: string; close?: string };
    thursday: { isOpen: boolean; open?: string; close?: string };
    friday: { isOpen: boolean; open?: string; close?: string };
    saturday: { isOpen: boolean; open?: string; close?: string };
    sunday: { isOpen: boolean; open?: string; close?: string };
  },
  day: Date,
): { open: string; close: string } | null {
  const dayKey = getDayKey(day);
  const dayHours = operatingHours[dayKey];

  if (!dayHours.isOpen || !dayHours.open || !dayHours.close) {
    return null;
  }

  return {
    open: dayHours.open,
    close: dayHours.close,
  };
}

/**
 * Format a time string (HH:mm) for display.
 * @param timeString - Time in "HH:mm" format
 * @returns String like "9:00am" or "5:30pm"
 */
export function formatTimeString(timeString: string): string {
  const [hours, minutes] = timeString.split(":").map(Number);
  const period = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")}${period}`;
}

/**
 * Get the display time range for the schedule grid.
 * Defaults to actual store hours and only expands when shifts fall outside.
 * This eliminates empty space at the top/bottom of the grid when no shifts exist there.
 *
 * @param operatingHours - Weekly operating hours from KitchenConfig
 * @param shifts - Array of shifts to consider for range expansion
 * @returns Object with earliest and latest times for grid display
 */
export function getDisplayTimeRange(
  operatingHours: {
    monday: { isOpen: boolean; open?: string; close?: string };
    tuesday: { isOpen: boolean; open?: string; close?: string };
    wednesday: { isOpen: boolean; open?: string; close?: string };
    thursday: { isOpen: boolean; open?: string; close?: string };
    friday: { isOpen: boolean; open?: string; close?: string };
    saturday: { isOpen: boolean; open?: string; close?: string };
    sunday: { isOpen: boolean; open?: string; close?: string };
  },
  shifts: Array<{ start: Date | string; end: Date | string }>,
): { earliest: string; latest: string } {
  const days = [
    operatingHours.monday,
    operatingHours.tuesday,
    operatingHours.wednesday,
    operatingHours.thursday,
    operatingHours.friday,
    operatingHours.saturday,
    operatingHours.sunday,
  ];

  // Get store hours range (without buffer)
  let earliestMinutes = 24 * 60;
  let latestMinutes = 0;

  for (const day of days) {
    if (day.isOpen && day.open && day.close) {
      const [openHour, openMin] = day.open.split(":").map(Number);
      const [closeHour, closeMin] = day.close.split(":").map(Number);

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (openMinutes < earliestMinutes) {
        earliestMinutes = openMinutes;
      }
      if (closeMinutes > latestMinutes) {
        latestMinutes = closeMinutes;
      }
    }
  }

  // Default to 9am - 9pm if no hours are set
  if (earliestMinutes === 24 * 60) earliestMinutes = 9 * 60;
  if (latestMinutes === 0) latestMinutes = 21 * 60;

  // Expand range if shifts fall outside store hours
  for (const shift of shifts) {
    const startDate = new Date(shift.start);
    const endDate = new Date(shift.end);

    const shiftStartMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const shiftEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();

    // If shift starts before store hours, expand earliest (with 30 min buffer)
    if (shiftStartMinutes < earliestMinutes) {
      earliestMinutes = Math.max(0, shiftStartMinutes - 30);
    }

    // If shift ends after store hours, expand latest (with 30 min buffer)
    if (shiftEndMinutes > latestMinutes) {
      latestMinutes = Math.min(24 * 60, shiftEndMinutes + 30);
    }
  }

  const earliestHours = Math.floor(earliestMinutes / 60);
  const earliestMins = earliestMinutes % 60;
  const latestHours = Math.floor(latestMinutes / 60);
  const latestMins = latestMinutes % 60;

  return {
    earliest: `${String(earliestHours).padStart(2, "0")}:${String(earliestMins).padStart(2, "0")}`,
    latest: `${String(latestHours).padStart(2, "0")}:${String(latestMins).padStart(2, "0")}`,
  };
}

/**
 * Calculate the vertical position percentage for a time within a range.
 * @param time - Time in "HH:mm" format
 * @param rangeStart - Range start time in "HH:mm" format
 * @param rangeEnd - Range end time in "HH:mm" format
 * @returns Position as a percentage (0-100)
 */
export function getTimePositionPercent(
  time: string,
  rangeStart: string,
  rangeEnd: string,
): number {
  const [timeHour, timeMin] = time.split(":").map(Number);
  const [startHour, startMin] = rangeStart.split(":").map(Number);
  const [endHour, endMin] = rangeEnd.split(":").map(Number);

  const timeMinutes = timeHour * 60 + timeMin;
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const totalRange = endMinutes - startMinutes;
  if (totalRange <= 0) return 0;

  return ((timeMinutes - startMinutes) / totalRange) * 100;
}

/**
 * Calculate the height percentage for a duration within a range.
 * @param durationMinutes - Duration in minutes
 * @param rangeStart - Range start time in "HH:mm" format
 * @param rangeEnd - Range end time in "HH:mm" format
 * @returns Height as a percentage (0-100)
 */
export function getDurationHeightPercent(
  durationMinutes: number,
  rangeStart: string,
  rangeEnd: string,
): number {
  const [startHour, startMin] = rangeStart.split(":").map(Number);
  const [endHour, endMin] = rangeEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const totalRange = endMinutes - startMinutes;
  if (totalRange <= 0) return 0;

  return (durationMinutes / totalRange) * 100;
}

/**
 * Calculate time from Y-position percentage within a time range.
 * Inverse of getTimePositionPercent.
 *
 * @param yPercent - Y position as percentage (0-100)
 * @param rangeStart - Range start time in "HH:mm" format
 * @param rangeEnd - Range end time in "HH:mm" format
 * @param snapToInterval - Snap result to nearest interval in minutes (default: 30)
 * @returns Time in "HH:mm" format
 *
 * @example
 * // Click at 50% of 9am-5pm range → returns "13:00" (1pm)
 * getTimeFromPositionPercent(50, "09:00", "17:00") // "13:00"
 *
 * // Click at 25% with 30-min snapping → snaps to nearest 30 min
 * getTimeFromPositionPercent(25, "09:00", "17:00", 30) // "11:00"
 */
export function getTimeFromPositionPercent(
  yPercent: number,
  rangeStart: string,
  rangeEnd: string,
  snapToInterval: number = 30,
): string {
  const [startHour, startMin] = rangeStart.split(":").map(Number);
  const [endHour, endMin] = rangeEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const totalRange = endMinutes - startMinutes;

  if (totalRange <= 0) return rangeStart;

  // Calculate raw minutes from percentage
  const offsetMinutes = (yPercent / 100) * totalRange;
  let targetMinutes = startMinutes + offsetMinutes;

  // Snap to nearest interval
  targetMinutes = Math.round(targetMinutes / snapToInterval) * snapToInterval;

  // Clamp to range
  targetMinutes = Math.max(startMinutes, Math.min(targetMinutes, endMinutes));

  const hours = Math.floor(targetMinutes / 60);
  const minutes = targetMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
