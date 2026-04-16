/**
 * Time overlap and shift-duration helpers for labor requirements and scheduling.
 */

/**
 * Compute shift duration in hours from HH:MM time strings.
 * Returns null if either time is empty/invalid or if end is not after start.
 */
export function computeShiftDurationHours(
  startTime: string,
  endTime: string
): number | null {
  if (!startTime || !endTime) return null;
  const startMatch = startTime.match(/^(\d{2}):(\d{2})$/);
  const endMatch = endTime.match(/^(\d{2}):(\d{2})$/);
  if (!startMatch || !endMatch) return null;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes <= startMinutes) return null;
  return (endMinutes - startMinutes) / 60;
}

/**
 * Check if two HH:MM time ranges overlap.
 * Adjacent times (e.g., ending at 16:00, starting at 16:00) do NOT overlap.
 *
 * @param startA - Start time of first range (HH:MM format)
 * @param endA - End time of first range (HH:MM format)
 * @param startB - Start time of second range (HH:MM format)
 * @param endB - End time of second range (HH:MM format)
 * @returns true if the ranges overlap, false otherwise
 */
export function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  // HH:MM strings compare correctly lexicographically
  return startA < endB && startB < endA;
}

/**
 * Find the first overlapping requirement from a list.
 *
 * @param newStart - Start time of the new/updated requirement
 * @param newEnd - End time of the new/updated requirement
 * @param existing - Array of existing requirements to check against
 * @param excludeId - Optional ID to exclude (for updates, exclude the requirement being updated)
 * @returns The first overlapping requirement found, or null if none overlap
 */
export function findOverlappingRequirement<
  T extends { id?: string; startTime: string; endTime: string }
>(
  newStart: string,
  newEnd: string,
  existing: T[],
  excludeId?: string
): T | null {
  for (const req of existing) {
    // Skip if this is the same requirement being updated
    if (excludeId && req.id === excludeId) {
      continue;
    }
    if (timeRangesOverlap(newStart, newEnd, req.startTime, req.endTime)) {
      return req;
    }
  }
  return null;
}
