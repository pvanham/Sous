/**
 * Time overlap utility functions for labor requirements.
 * Used to validate that labor requirements don't have overlapping time ranges
 * for the same station/day combination.
 */

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
