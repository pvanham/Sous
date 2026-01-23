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
  intervalMinutes: number = 30
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
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    );
    currentMinutes += intervalMinutes;
  }

  return slots;
}

/**
 * Get the earliest opening and latest closing times from kitchen config.
 * @param operatingHours - Weekly operating hours from KitchenConfig
 * @returns Object with earliest open time and latest close time
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
 * Calculate the vertical position percentage for a time within a range.
 * @param time - Time in "HH:mm" format
 * @param rangeStart - Range start time in "HH:mm" format
 * @param rangeEnd - Range end time in "HH:mm" format
 * @returns Position as a percentage (0-100)
 */
export function getTimePositionPercent(
  time: string,
  rangeStart: string,
  rangeEnd: string
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
  rangeEnd: string
): number {
  const [startHour, startMin] = rangeStart.split(":").map(Number);
  const [endHour, endMin] = rangeEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const totalRange = endMinutes - startMinutes;
  if (totalRange <= 0) return 0;

  return (durationMinutes / totalRange) * 100;
}
