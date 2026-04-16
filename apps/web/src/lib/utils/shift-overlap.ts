import type { ShiftDTO } from "@/types/shift";

/**
 * Represents a shift with its assigned lane position for rendering.
 */
export interface LaneAssignment {
  shift: ShiftDTO;
  /** The lane index (0-based) this shift is assigned to */
  lane: number;
  /** Total number of lanes needed for this overlapping group */
  totalLanes: number;
}

/**
 * Check if two shifts overlap in time.
 * Two shifts overlap if one starts before the other ends.
 */
export function shiftsOverlap(a: ShiftDTO, b: ShiftDTO): boolean {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();

  // Shifts overlap if one starts before the other ends
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Assigns lane positions to shifts for side-by-side rendering.
 * 
 * Algorithm:
 * 1. Sort shifts by start time
 * 2. For each shift, find the first available lane
 * 3. A lane is available if no shift currently in that lane overlaps
 * 4. Track the maximum lanes needed for each overlapping cluster
 * 
 * @param shifts - Array of shifts to assign lanes to
 * @returns Array of lane assignments with lane index and total lanes per cluster
 */
export function assignLanes(shifts: ShiftDTO[]): LaneAssignment[] {
  if (shifts.length === 0) return [];
  if (shifts.length === 1) {
    return [{ shift: shifts[0], lane: 0, totalLanes: 1 }];
  }

  // Sort shifts by start time, then by end time for consistent ordering
  const sortedShifts = [...shifts].sort((a, b) => {
    const startDiff = new Date(a.start).getTime() - new Date(b.start).getTime();
    if (startDiff !== 0) return startDiff;
    return new Date(a.end).getTime() - new Date(b.end).getTime();
  });

  // Track which lane each shift is assigned to
  const laneAssignments: Map<string, number> = new Map();
  
  // Track which shifts are in each lane (by their end times for quick overlap check)
  const lanes: ShiftDTO[][] = [];

  for (const shift of sortedShifts) {
    // Find the first lane where this shift doesn't overlap with any existing shift
    let assignedLane = -1;
    
    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const laneShifts = lanes[laneIdx];
      const hasOverlap = laneShifts.some((existing) => shiftsOverlap(existing, shift));
      
      if (!hasOverlap) {
        assignedLane = laneIdx;
        break;
      }
    }

    // If no existing lane works, create a new one
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push([]);
    }

    // Add shift to the assigned lane
    lanes[assignedLane].push(shift);
    laneAssignments.set(shift.id, assignedLane);
  }

  // Now we need to calculate totalLanes for each overlapping cluster
  // A cluster is a group of shifts where each shift overlaps with at least one other in the cluster
  const clusters = findOverlappingClusters(sortedShifts);
  
  // Map each shift to its cluster's lane count
  const shiftToTotalLanes: Map<string, number> = new Map();
  
  for (const cluster of clusters) {
    // Find the max lane used in this cluster
    let maxLane = 0;
    for (const shift of cluster) {
      const lane = laneAssignments.get(shift.id) ?? 0;
      maxLane = Math.max(maxLane, lane);
    }
    const totalLanes = maxLane + 1;
    
    // Assign this totalLanes to all shifts in the cluster
    for (const shift of cluster) {
      shiftToTotalLanes.set(shift.id, totalLanes);
    }
  }

  // Build final result
  return sortedShifts.map((shift) => ({
    shift,
    lane: laneAssignments.get(shift.id) ?? 0,
    totalLanes: shiftToTotalLanes.get(shift.id) ?? 1,
  }));
}

/**
 * Find clusters of overlapping shifts.
 * Each cluster contains shifts that are connected through overlaps.
 */
function findOverlappingClusters(shifts: ShiftDTO[]): ShiftDTO[][] {
  if (shifts.length === 0) return [];
  
  const visited = new Set<string>();
  const clusters: ShiftDTO[][] = [];

  for (const shift of shifts) {
    if (visited.has(shift.id)) continue;

    // BFS to find all shifts in this cluster
    const cluster: ShiftDTO[] = [];
    const queue: ShiftDTO[] = [shift];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      
      visited.add(current.id);
      cluster.push(current);

      // Find all shifts that overlap with current
      for (const other of shifts) {
        if (!visited.has(other.id) && shiftsOverlap(current, other)) {
          queue.push(other);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}
