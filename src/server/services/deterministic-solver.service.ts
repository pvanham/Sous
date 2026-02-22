import type { CandidateDTO, SlotCandidates } from "@/types/candidate";
import type { LaborPriority } from "@/types/labor-requirement";
import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  UnfilledSlot,
  WeekSolverInput,
} from "@/types/ai-scheduling";

// ============================================================
// DeterministicSolverService -- Hybrid Architecture Phase 1
// ============================================================
// Pure TypeScript constraint-satisfaction solver that produces a
// guaranteed-valid base schedule in milliseconds. Uses a weighted
// greedy algorithm: slots sorted by constraint tightness, then
// candidates scored on preference, hours balance, and proficiency.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models
// - No DB access, no AI calls -- pure functions only
// - Input/output use the same types as the AI scheduling pipeline
// - Multi-tenancy context comes pre-embedded in DaySchedulingContext
// ============================================================

const PRIORITY_ORDER: Record<LaborPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const MAX_HILL_CLIMB_PASSES = 50;

// ────────────────────────────────────────────────────────────
// Scoring Weights
// ────────────────────────────────────────────────────────────

const WEIGHT_PREFERRED_STATION = 6;
const WEIGHT_PREFERRED_TIME = 4;
const WEIGHT_HOURS_BALANCE = 8;
const WEIGHT_PROFICIENCY = 0.5;

/**
 * Score a candidate for a specific slot. Higher = better fit.
 *
 * Weights are aligned to match the 3:2 station:time ratio used by the
 * evaluation scoring in ScheduleValidatorService.scoreQuality().
 *
 * Factors:
 * - Preferred station match (+6)
 * - Availability preference "preferred" (+4)
 * - Hours balance: remaining capacity ratio (+0 to +8)
 * - Proficiency for the target station (+0.5 per level, tiebreaker)
 *
 * @param actualWeekHours - When provided (week-level solve), overrides
 *   candidate.currentWeekHours so the capacity ratio reflects the
 *   solver's running total instead of the stale pre-fetch value.
 */
function scoreCandidate(
  candidate: CandidateDTO,
  station: string,
  actualWeekHours?: number,
): number {
  let score = 0;

  if (candidate.preferredStations.includes(station)) {
    score += WEIGHT_PREFERRED_STATION;
  }

  if (candidate.preference === "preferred") {
    score += WEIGHT_PREFERRED_TIME;
  }

  const weekHours = actualWeekHours ?? candidate.currentWeekHours;
  const remaining = candidate.maxHoursPerWeek - weekHours;
  const capacityRatio =
    candidate.maxHoursPerWeek > 0
      ? remaining / candidate.maxHoursPerWeek
      : 0;
  score += WEIGHT_HOURS_BALANCE * capacityRatio;

  const proficiency =
    candidate.skills.find((s) => s.station === station)?.proficiency ?? 0;
  score += WEIGHT_PROFICIENCY * proficiency;

  return score;
}

/**
 * Build a short human-readable reasoning string from candidate scores.
 */
function buildReasoning(
  candidate: CandidateDTO,
  station: string,
): string {
  const parts: string[] = [];

  if (candidate.preferredStations.includes(station)) {
    parts.push("preferred station");
  }

  const remaining = candidate.maxHoursPerWeek - candidate.currentWeekHours;
  parts.push(`${remaining.toFixed(1)}h remaining`);

  const proficiency =
    candidate.skills.find((s) => s.station === station)?.proficiency ?? 0;
  parts.push(`proficiency ${proficiency}/5`);

  return `Deterministic: ${parts.join(", ")}`;
}

/**
 * Sort slots by constraint tightness so hardest-to-fill slots
 * get first pick of the candidate pool.
 *
 * Primary: fewest candidates first (most constrained)
 * Secondary: highest priority first
 * Tertiary: fewest preferredStaff first (smaller slots first)
 */
function sortSlotsByTightness(
  slots: SlotCandidates[],
): SlotCandidates[] {
  return [...slots].sort((a, b) => {
    const aCandidates = a.candidates.length;
    const bCandidates = b.candidates.length;
    if (aCandidates !== bCandidates) return aCandidates - bCandidates;

    const aPri = PRIORITY_ORDER[a.slot.priority] ?? 2;
    const bPri = PRIORITY_ORDER[b.slot.priority] ?? 2;
    if (aPri !== bPri) return bPri - aPri;

    return a.slot.preferredStaff - b.slot.preferredStaff;
  });
}

// ────────────────────────────────────────────────────────────
// Hill-Climbing Local Search
// ────────────────────────────────────────────────────────────

/**
 * Score a set of assignments using the same formula as ScheduleValidatorService.scoreQuality().
 * Kept in sync manually to avoid a cross-service dependency.
 *
 * Formula: +3 per preferred station match, +2 per preferred time match,
 * -0.1 * variance(remaining hours), -10 per unfilled slot.
 */
function scoreAssignments(
  assignments: GeneratedShiftAssignment[],
  candidateMap: Map<string, CandidateDTO>,
  unfilledCount: number,
): number {
  let score = 0;
  const remainingHours: number[] = [];

  for (const a of assignments) {
    const c = candidateMap.get(a.staffId);
    if (!c) continue;

    if (c.preferredStations.includes(a.station)) {
      score += 3;
    }
    if (c.preference === "preferred") {
      score += 2;
    }

    const slotDur = getSlotDurationHours(a.startTime, a.endTime);
    remainingHours.push(c.maxHoursPerWeek - c.currentWeekHours - slotDur);
  }

  if (remainingHours.length > 1) {
    const mean =
      remainingHours.reduce((s, v) => s + v, 0) / remainingHours.length;
    const variance =
      remainingHours.reduce((s, v) => s + (v - mean) ** 2, 0) /
      remainingHours.length;
    score -= variance * 0.1;
  }

  score -= unfilledCount * 10;

  return Math.round(score * 100) / 100;
}

/**
 * Hill-climbing optimizer that iteratively improves a greedy assignment
 * by trying pairwise swaps and candidate replacements.
 *
 * Guarantees: every accepted move produces a valid schedule (candidates
 * are checked against per-slot candidate lists, one-shift-per-day is
 * enforced via the assignedStaff set).
 *
 * Converges when no single swap or replacement improves the score,
 * or after MAX_HILL_CLIMB_PASSES iterations (safety bound).
 */
function hillClimbOptimize(
  assignments: GeneratedShiftAssignment[],
  slots: SlotCandidates[],
  unfilledCount: number,
): { assignments: GeneratedShiftAssignment[]; swapCount: number } {
  if (assignments.length < 2) return { assignments, swapCount: 0 };

  const candidateMap = new Map<string, CandidateDTO>();
  const slotValidCandidates = new Map<string, Set<string>>();

  for (const { slot, candidates } of slots) {
    const key = `${slot.station}|${slot.startTime}|${slot.endTime}`;
    const validIds = new Set<string>();
    for (const c of candidates) {
      validIds.add(c.staffId);
      if (!candidateMap.has(c.staffId)) {
        candidateMap.set(c.staffId, c);
      }
    }
    slotValidCandidates.set(key, validIds);
  }

  const working = assignments.map((a) => ({ ...a }));
  const assignedStaff = new Set(working.map((a) => a.staffId));
  let currentScore = scoreAssignments(working, candidateMap, unfilledCount);
  let totalSwaps = 0;

  for (let pass = 0; pass < MAX_HILL_CLIMB_PASSES; pass++) {
    let improved = false;

    // Phase 1: Pairwise swaps between existing assignments
    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const keyI = `${working[i].station}|${working[i].startTime}|${working[i].endTime}`;
        const keyJ = `${working[j].station}|${working[j].startTime}|${working[j].endTime}`;

        const validI = slotValidCandidates.get(keyI);
        const validJ = slotValidCandidates.get(keyJ);
        if (!validI?.has(working[j].staffId) || !validJ?.has(working[i].staffId))
          continue;

        const savedI = { staffId: working[i].staffId, staffName: working[i].staffName };
        const savedJ = { staffId: working[j].staffId, staffName: working[j].staffName };

        working[i].staffId = savedJ.staffId;
        working[i].staffName = savedJ.staffName;
        working[j].staffId = savedI.staffId;
        working[j].staffName = savedI.staffName;

        const newScore = scoreAssignments(working, candidateMap, unfilledCount);
        if (newScore > currentScore) {
          working[i].reasoning = buildReasoning(
            candidateMap.get(working[i].staffId)!,
            working[i].station,
          );
          working[j].reasoning = buildReasoning(
            candidateMap.get(working[j].staffId)!,
            working[j].station,
          );
          currentScore = newScore;
          improved = true;
          totalSwaps++;
        } else {
          working[i].staffId = savedI.staffId;
          working[i].staffName = savedI.staffName;
          working[j].staffId = savedJ.staffId;
          working[j].staffName = savedJ.staffName;
        }
      }
    }

    // Phase 2: Replace assignments with unassigned candidates
    for (let i = 0; i < working.length; i++) {
      const slotKey = `${working[i].station}|${working[i].startTime}|${working[i].endTime}`;
      const validForSlot = slotValidCandidates.get(slotKey);
      if (!validForSlot) continue;

      for (const candidateId of validForSlot) {
        if (assignedStaff.has(candidateId)) continue;

        const candidate = candidateMap.get(candidateId);
        if (!candidate) continue;

        const savedStaffId = working[i].staffId;
        const savedStaffName = working[i].staffName;
        const savedReasoning = working[i].reasoning;

        working[i].staffId = candidateId;
        working[i].staffName = candidate.staffName;

        const newScore = scoreAssignments(working, candidateMap, unfilledCount);
        if (newScore > currentScore) {
          working[i].reasoning = buildReasoning(candidate, working[i].station);
          assignedStaff.delete(savedStaffId);
          assignedStaff.add(candidateId);
          currentScore = newScore;
          improved = true;
          totalSwaps++;
        } else {
          working[i].staffId = savedStaffId;
          working[i].staffName = savedStaffName;
          working[i].reasoning = savedReasoning;
        }
      }
    }

    if (!improved) break;
  }

  return { assignments: working, swapCount: totalSwaps };
}

// ────────────────────────────────────────────────────────────
// Week-Level Types & Helpers
// ────────────────────────────────────────────────────────────

/** A slot tagged with its day for the week-level greedy pass. */
interface WeekTaggedSlot {
  dayIndex: number;
  dateStr: string;
  dayName: string;
  slot: SlotCandidates;
}

/** An assignment tagged with its day for week-level tracking. */
interface WeekTaggedAssignment {
  dayIndex: number;
  assignment: GeneratedShiftAssignment;
}

const CLOPENING_THRESHOLD_HOURS = 10;

/**
 * Parse "HH:MM" into minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check whether assigning a person to a shift on dayIndex would
 * create a clopening violation with their shifts on adjacent days.
 *
 * A clopening occurs when the gap between a closing shift end and
 * the next day's opening shift start is less than CLOPENING_THRESHOLD_HOURS.
 */
function wouldCreateClopening(
  staffId: string,
  dayIndex: number,
  startTime: string,
  endTime: string,
  dayAssignments: Map<number, WeekTaggedAssignment[]>,
): boolean {
  const shiftStartMin = timeToMinutes(startTime);
  const shiftEndMin = timeToMinutes(endTime);

  const prevDayAssignments = dayAssignments.get(dayIndex - 1);
  if (prevDayAssignments) {
    for (const ta of prevDayAssignments) {
      if (ta.assignment.staffId !== staffId) continue;
      const prevEndMin = timeToMinutes(ta.assignment.endTime);
      const gapMinutes = (24 * 60 - prevEndMin) + shiftStartMin;
      if (gapMinutes / 60 < CLOPENING_THRESHOLD_HOURS) return true;
    }
  }

  const nextDayAssignments = dayAssignments.get(dayIndex + 1);
  if (nextDayAssignments) {
    for (const ta of nextDayAssignments) {
      if (ta.assignment.staffId !== staffId) continue;
      const nextStartMin = timeToMinutes(ta.assignment.startTime);
      const gapMinutes = (24 * 60 - shiftEndMin) + nextStartMin;
      if (gapMinutes / 60 < CLOPENING_THRESHOLD_HOURS) return true;
    }
  }

  return false;
}

/**
 * Score all assignments across the week using the same formula as
 * ScheduleValidatorService.scoreQuality(), but applied to the full
 * week as a single unit.
 *
 * Formula: +3 per preferred station, +2 per preferred time,
 * -0.1 * variance(remaining hours across ALL staff), -10 per unfilled.
 */
function scoreWeekAssignments(
  assignments: WeekTaggedAssignment[],
  candidateMap: Map<string, CandidateDTO>,
  totalUnfilledCount: number,
  weekHoursUsed: Map<string, number>,
  maxHoursLookup: Map<string, number>,
): number {
  let score = 0;

  for (const { assignment: a } of assignments) {
    const c = candidateMap.get(`${a.staffId}`);
    if (!c) continue;

    if (c.preferredStations.includes(a.station)) {
      score += 3;
    }
    if (c.preference === "preferred") {
      score += 2;
    }
  }

  const remainingHours: number[] = [];
  for (const [staffId, used] of weekHoursUsed) {
    const max = maxHoursLookup.get(staffId) ?? 40;
    remainingHours.push(max - used);
  }

  if (remainingHours.length > 1) {
    const mean =
      remainingHours.reduce((s, v) => s + v, 0) / remainingHours.length;
    const variance =
      remainingHours.reduce((s, v) => s + (v - mean) ** 2, 0) /
      remainingHours.length;
    score -= variance * 0.1;
  }

  score -= totalUnfilledCount * 10;

  return Math.round(score * 100) / 100;
}

/**
 * Build a combined candidate map keyed by staffId.
 * Since the same candidate can appear in multiple days with different
 * currentWeekHours, we store the first occurrence (the currentWeekHours
 * field isn't used by the week solver -- it tracks hours itself).
 */
function buildWeekCandidateMap(
  input: WeekSolverInput,
): Map<string, CandidateDTO> {
  const map = new Map<string, CandidateDTO>();
  for (const day of input.days) {
    for (const { candidates } of day.slots) {
      for (const c of candidates) {
        if (!map.has(c.staffId)) {
          map.set(c.staffId, c);
        }
      }
    }
  }
  return map;
}

/**
 * Build a map of dayIndex -> slotKey -> Set<staffId> for valid candidates
 * per slot per day. Used by the hill climber to check swap validity.
 */
function buildWeekSlotValidCandidates(
  input: WeekSolverInput,
): Map<number, Map<string, Set<string>>> {
  const result = new Map<number, Map<string, Set<string>>>();
  for (const day of input.days) {
    const dayMap = new Map<string, Set<string>>();
    for (const { slot, candidates } of day.slots) {
      const key = `${slot.station}|${slot.startTime}|${slot.endTime}`;
      const ids = new Set<string>();
      for (const c of candidates) {
        ids.add(c.staffId);
      }
      dayMap.set(key, ids);
    }
    result.set(day.dayIndex, dayMap);
  }
  return result;
}

/**
 * Week-level hill climbing that operates on all assignments across all days.
 *
 * Phase 1: Within-day pairwise swaps (same day only)
 * Phase 2: Within-day candidate replacements (swap assigned with unassigned)
 * Phase 3: Cross-day redistribution (steal candidates from other days to fill unfilled slots)
 */
function weekHillClimbOptimize(
  allAssignments: WeekTaggedAssignment[],
  unfilledSlots: Array<{ dayIndex: number; slot: UnfilledSlot }>,
  input: WeekSolverInput,
  candidateMap: Map<string, CandidateDTO>,
  weekSlotValidCandidates: Map<number, Map<string, Set<string>>>,
  weekHoursUsed: Map<string, number>,
  assignedPerDay: Map<number, Set<string>>,
): {
  assignments: WeekTaggedAssignment[];
  unfilled: Array<{ dayIndex: number; slot: UnfilledSlot }>;
  swapCount: number;
  phase1Swaps: number;
  phase2Swaps: number;
  phase3Swaps: number;
  phase3dSwaps: number;
} {
  if (allAssignments.length < 2 && unfilledSlots.length === 0) {
    return { assignments: allAssignments, unfilled: unfilledSlots, swapCount: 0, phase1Swaps: 0, phase2Swaps: 0, phase3Swaps: 0, phase3dSwaps: 0 };
  }

  const working = allAssignments.map((ta) => ({
    dayIndex: ta.dayIndex,
    assignment: { ...ta.assignment },
  }));
  const workingUnfilled = unfilledSlots.map((u) => ({
    dayIndex: u.dayIndex,
    slot: { ...u.slot },
  }));

  const dayAssignmentIndex = new Map<number, WeekTaggedAssignment[]>();
  for (const ta of working) {
    const arr = dayAssignmentIndex.get(ta.dayIndex) ?? [];
    arr.push(ta);
    dayAssignmentIndex.set(ta.dayIndex, arr);
  }

  const workingAssignedPerDay = new Map<number, Set<string>>();
  for (const [day, ids] of assignedPerDay) {
    workingAssignedPerDay.set(day, new Set(ids));
  }

  const workingWeekHours = new Map(weekHoursUsed);

  let totalUnfilled = workingUnfilled.length;
  let currentScore = scoreWeekAssignments(
    working, candidateMap, totalUnfilled, workingWeekHours, input.maxHoursLookup,
  );
  let totalSwaps = 0;
  let phase1Swaps = 0;
  let phase2Swaps = 0;
  let phase3Swaps = 0;
  let phase3dSwaps = 0;

  for (let pass = 0; pass < MAX_HILL_CLIMB_PASSES; pass++) {
    let improved = false;

    // Phase 1: Within-day pairwise swaps
    const dayIndices = [...dayAssignmentIndex.keys()];
    for (const dayIdx of dayIndices) {
      const dayAssigns = dayAssignmentIndex.get(dayIdx) ?? [];
      const dayValidMap = weekSlotValidCandidates.get(dayIdx);
      if (!dayValidMap || dayAssigns.length < 2) continue;

      for (let i = 0; i < dayAssigns.length; i++) {
        for (let j = i + 1; j < dayAssigns.length; j++) {
          const ai = dayAssigns[i].assignment;
          const aj = dayAssigns[j].assignment;

          const keyI = `${ai.station}|${ai.startTime}|${ai.endTime}`;
          const keyJ = `${aj.station}|${aj.startTime}|${aj.endTime}`;

          const validI = dayValidMap.get(keyI);
          const validJ = dayValidMap.get(keyJ);
          if (!validI?.has(aj.staffId) || !validJ?.has(ai.staffId)) continue;

          if (wouldCreateClopening(aj.staffId, dayIdx, ai.startTime, ai.endTime, dayAssignmentIndex)) continue;
          if (wouldCreateClopening(ai.staffId, dayIdx, aj.startTime, aj.endTime, dayAssignmentIndex)) continue;

          const savedI = { staffId: ai.staffId, staffName: ai.staffName };
          const savedJ = { staffId: aj.staffId, staffName: aj.staffName };

          ai.staffId = savedJ.staffId;
          ai.staffName = savedJ.staffName;
          aj.staffId = savedI.staffId;
          aj.staffName = savedI.staffName;

          const newScore = scoreWeekAssignments(
            working, candidateMap, totalUnfilled, workingWeekHours, input.maxHoursLookup,
          );
          if (newScore > currentScore) {
            ai.reasoning = buildReasoning(candidateMap.get(ai.staffId)!, ai.station);
            aj.reasoning = buildReasoning(candidateMap.get(aj.staffId)!, aj.station);
            currentScore = newScore;
            improved = true;
            totalSwaps++;
            phase1Swaps++;
          } else {
            ai.staffId = savedI.staffId;
            ai.staffName = savedI.staffName;
            aj.staffId = savedJ.staffId;
            aj.staffName = savedJ.staffName;
          }
        }
      }
    }

    // Phase 2: Within-day candidate replacements
    for (const dayIdx of dayIndices) {
      const dayAssigns = dayAssignmentIndex.get(dayIdx) ?? [];
      const dayValidMap = weekSlotValidCandidates.get(dayIdx);
      const dayAssigned = workingAssignedPerDay.get(dayIdx);
      if (!dayValidMap || !dayAssigned) continue;

      for (const ta of dayAssigns) {
        const a = ta.assignment;
        const slotKey = `${a.station}|${a.startTime}|${a.endTime}`;
        const validForSlot = dayValidMap.get(slotKey);
        if (!validForSlot) continue;

        for (const candidateId of validForSlot) {
          if (dayAssigned.has(candidateId)) continue;

          const candidate = candidateMap.get(candidateId);
          if (!candidate) continue;

          const slotDur = getSlotDurationHours(a.startTime, a.endTime);
          const candidateCurrentHours = workingWeekHours.get(candidateId) ?? 0;
          const candidateMax = input.maxHoursLookup.get(candidateId) ?? 40;
          if (candidateCurrentHours + slotDur > candidateMax) continue;

          if (wouldCreateClopening(candidateId, dayIdx, a.startTime, a.endTime, dayAssignmentIndex)) continue;

          const savedStaffId = a.staffId;
          const savedStaffName = a.staffName;
          const savedReasoning = a.reasoning;
          const savedOldHours = workingWeekHours.get(savedStaffId) ?? 0;

          a.staffId = candidateId;
          a.staffName = candidate.staffName;
          workingWeekHours.set(savedStaffId, savedOldHours - slotDur);
          workingWeekHours.set(candidateId, candidateCurrentHours + slotDur);

          const newScore = scoreWeekAssignments(
            working, candidateMap, totalUnfilled, workingWeekHours, input.maxHoursLookup,
          );
          if (newScore > currentScore) {
            a.reasoning = buildReasoning(candidate, a.station);
            dayAssigned.delete(savedStaffId);
            dayAssigned.add(candidateId);
            currentScore = newScore;
            improved = true;
            totalSwaps++;
            phase2Swaps++;
          } else {
            a.staffId = savedStaffId;
            a.staffName = savedStaffName;
            a.reasoning = savedReasoning;
            workingWeekHours.set(savedStaffId, savedOldHours);
            workingWeekHours.set(candidateId, candidateCurrentHours);
          }
        }
      }
    }

    // Phase 3: Fill unfilled slots via three strategies:
    //   3a. Free (globally unassigned) candidates -> assign directly
    //   3b. Same-day reassignment -> move candidate from another slot on the same day,
    //       then fill their old slot with a replacement
    //   3c. Cross-day redistribution -> steal candidate from another day,
    //       replacing them there
    for (let u = workingUnfilled.length - 1; u >= 0; u--) {
      const unfilled = workingUnfilled[u];
      const dayIdx = unfilled.dayIndex;
      const dayValidMap = weekSlotValidCandidates.get(dayIdx);
      if (!dayValidMap) continue;

      const unfilledKey = `${unfilled.slot.station}|${unfilled.slot.startTime}|${unfilled.slot.endTime}`;
      const validForUnfilled = dayValidMap.get(unfilledKey);
      if (!validForUnfilled) continue;

      const dayAssigned = workingAssignedPerDay.get(dayIdx) ?? new Set();
      const slotDur = getSlotDurationHours(unfilled.slot.startTime, unfilled.slot.endTime);

      let filled = false;

      // Strategy 3a: Free (globally unassigned) candidates
      for (const candidateId of validForUnfilled) {
        if (dayAssigned.has(candidateId)) continue;

        const candidateCurrentHours = workingWeekHours.get(candidateId) ?? 0;
        const candidateMax = input.maxHoursLookup.get(candidateId) ?? 40;
        if (candidateCurrentHours + slotDur > candidateMax) continue;

        if (wouldCreateClopening(candidateId, dayIdx, unfilled.slot.startTime, unfilled.slot.endTime, dayAssignmentIndex)) continue;

        const isAssignedAnywhere = [...workingAssignedPerDay.values()]
          .some((ids) => ids.has(candidateId));

        if (!isAssignedAnywhere) {
          const candidate = candidateMap.get(candidateId)!;
          const newAssignment: WeekTaggedAssignment = {
            dayIndex: dayIdx,
            assignment: {
              staffId: candidateId,
              staffName: candidate.staffName,
              station: unfilled.slot.station,
              startTime: unfilled.slot.startTime,
              endTime: unfilled.slot.endTime,
              reasoning: buildReasoning(candidate, unfilled.slot.station),
            },
          };
          working.push(newAssignment);
          const dayArr = dayAssignmentIndex.get(dayIdx) ?? [];
          dayArr.push(newAssignment);
          dayAssignmentIndex.set(dayIdx, dayArr);
          dayAssigned.add(candidateId);
          workingAssignedPerDay.set(dayIdx, dayAssigned);
          workingWeekHours.set(candidateId, candidateCurrentHours + slotDur);

          unfilled.slot.assigned++;
          if (unfilled.slot.assigned >= unfilled.slot.needed) {
            workingUnfilled.splice(u, 1);
            totalUnfilled--;
          }
          filled = true;
          improved = true;
          totalSwaps++;
          phase3Swaps++;
          break;
        }
      }

      if (filled) continue;

      // Strategy 3b: Same-day reassignment -- candidate is assigned to a different
      // slot on this day; move them to the unfilled slot if we can replace them
      for (const candidateId of validForUnfilled) {
        if (!dayAssigned.has(candidateId)) continue;

        const candidateCurrentHours = workingWeekHours.get(candidateId) ?? 0;
        const candidateMax = input.maxHoursLookup.get(candidateId) ?? 40;

        if (wouldCreateClopening(candidateId, dayIdx, unfilled.slot.startTime, unfilled.slot.endTime, dayAssignmentIndex)) continue;

        const dayAssigns = dayAssignmentIndex.get(dayIdx) ?? [];
        const currentAssign = dayAssigns.find((ta) => ta.assignment.staffId === candidateId);
        if (!currentAssign) continue;

        const currentSlotKey = `${currentAssign.assignment.station}|${currentAssign.assignment.startTime}|${currentAssign.assignment.endTime}`;
        const currentSlotValid = dayValidMap.get(currentSlotKey);
        if (!currentSlotValid) continue;

        const currentSlotDur = getSlotDurationHours(currentAssign.assignment.startTime, currentAssign.assignment.endTime);
        const hourDelta = slotDur - currentSlotDur;
        if (candidateCurrentHours + hourDelta > candidateMax) continue;

        for (const replacementId of currentSlotValid) {
          if (dayAssigned.has(replacementId)) continue;

          const replacementCandidate = candidateMap.get(replacementId);
          if (!replacementCandidate) continue;

          const replacementHours = workingWeekHours.get(replacementId) ?? 0;
          const replacementMax = input.maxHoursLookup.get(replacementId) ?? 40;
          if (replacementHours + currentSlotDur > replacementMax) continue;

          if (wouldCreateClopening(replacementId, dayIdx, currentAssign.assignment.startTime, currentAssign.assignment.endTime, dayAssignmentIndex)) continue;

          const scoreBefore = currentScore;
          const candidate = candidateMap.get(candidateId)!;

          const savedStaff = currentAssign.assignment.staffId;
          const savedName = currentAssign.assignment.staffName;
          const savedReasoning = currentAssign.assignment.reasoning;

          currentAssign.assignment.staffId = replacementId;
          currentAssign.assignment.staffName = replacementCandidate.staffName;

          const newAssignment: WeekTaggedAssignment = {
            dayIndex: dayIdx,
            assignment: {
              staffId: candidateId,
              staffName: candidate.staffName,
              station: unfilled.slot.station,
              startTime: unfilled.slot.startTime,
              endTime: unfilled.slot.endTime,
              reasoning: buildReasoning(candidate, unfilled.slot.station),
            },
          };
          working.push(newAssignment);

          const replacementHoursBefore = workingWeekHours.get(replacementId) ?? 0;
          workingWeekHours.set(replacementId, replacementHoursBefore + currentSlotDur);
          workingWeekHours.set(candidateId, candidateCurrentHours + hourDelta);

          const newScore = scoreWeekAssignments(
            working, candidateMap, totalUnfilled - 1, workingWeekHours, input.maxHoursLookup,
          );

          if (newScore > scoreBefore) {
            currentAssign.assignment.reasoning = buildReasoning(replacementCandidate, currentAssign.assignment.station);
            dayAssigned.add(replacementId);
            const dayArr = dayAssignmentIndex.get(dayIdx) ?? [];
            dayArr.push(newAssignment);
            dayAssignmentIndex.set(dayIdx, dayArr);

            unfilled.slot.assigned++;
            if (unfilled.slot.assigned >= unfilled.slot.needed) {
              workingUnfilled.splice(u, 1);
              totalUnfilled--;
            }
            currentScore = newScore;
            filled = true;
            improved = true;
            totalSwaps++;
            phase3Swaps++;
            break;
          } else {
            working.pop();
            currentAssign.assignment.staffId = savedStaff;
            currentAssign.assignment.staffName = savedName;
            currentAssign.assignment.reasoning = savedReasoning;
            workingWeekHours.set(candidateId, candidateCurrentHours);
            workingWeekHours.set(replacementId, replacementHoursBefore);
          }
        }

        if (filled) break;
      }

      if (filled) continue;

      // Strategy 3c: Cross-day redistribution -- candidate is assigned on another
      // day; try to find a replacement there and move them to this unfilled slot
      for (const candidateId of validForUnfilled) {
        if (dayAssigned.has(candidateId)) continue;

        const candidateCurrentHours = workingWeekHours.get(candidateId) ?? 0;
        const candidateMax = input.maxHoursLookup.get(candidateId) ?? 40;
        if (candidateCurrentHours + slotDur > candidateMax) continue;

        if (wouldCreateClopening(candidateId, dayIdx, unfilled.slot.startTime, unfilled.slot.endTime, dayAssignmentIndex)) continue;

        for (const [otherDayIdx, otherDayAssigned] of workingAssignedPerDay) {
          if (otherDayIdx === dayIdx) continue;
          if (!otherDayAssigned.has(candidateId)) continue;

          const otherDayAssigns = dayAssignmentIndex.get(otherDayIdx) ?? [];
          const otherValidMap = weekSlotValidCandidates.get(otherDayIdx);
          if (!otherValidMap) continue;

          const targetAssign = otherDayAssigns.find((ta) => ta.assignment.staffId === candidateId);
          if (!targetAssign) continue;

          const otherSlotKey = `${targetAssign.assignment.station}|${targetAssign.assignment.startTime}|${targetAssign.assignment.endTime}`;
          const otherSlotValid = otherValidMap.get(otherSlotKey);
          if (!otherSlotValid) continue;

          for (const replacementId of otherSlotValid) {
            if (otherDayAssigned.has(replacementId)) continue;

            const replacementCandidate = candidateMap.get(replacementId);
            if (!replacementCandidate) continue;

            const otherSlotDur = getSlotDurationHours(targetAssign.assignment.startTime, targetAssign.assignment.endTime);
            const replacementHours = workingWeekHours.get(replacementId) ?? 0;
            const replacementMax = input.maxHoursLookup.get(replacementId) ?? 40;
            if (replacementHours + otherSlotDur > replacementMax) continue;

            if (wouldCreateClopening(replacementId, otherDayIdx, targetAssign.assignment.startTime, targetAssign.assignment.endTime, dayAssignmentIndex)) continue;
            if (wouldCreateClopening(candidateId, dayIdx, unfilled.slot.startTime, unfilled.slot.endTime, dayAssignmentIndex)) continue;

            const scoreBefore = currentScore;

            const savedOtherStaff = targetAssign.assignment.staffId;
            const savedOtherName = targetAssign.assignment.staffName;
            const savedOtherReasoning = targetAssign.assignment.reasoning;

            targetAssign.assignment.staffId = replacementId;
            targetAssign.assignment.staffName = replacementCandidate.staffName;

            const candidate = candidateMap.get(candidateId)!;
            const newAssignment: WeekTaggedAssignment = {
              dayIndex: dayIdx,
              assignment: {
                staffId: candidateId,
                staffName: candidate.staffName,
                station: unfilled.slot.station,
                startTime: unfilled.slot.startTime,
                endTime: unfilled.slot.endTime,
                reasoning: buildReasoning(candidate, unfilled.slot.station),
              },
            };
            working.push(newAssignment);

            const candidateHoursBefore = workingWeekHours.get(candidateId) ?? 0;
            const replacementHoursBefore = workingWeekHours.get(replacementId) ?? 0;
            workingWeekHours.set(replacementId, replacementHoursBefore + otherSlotDur);
            workingWeekHours.set(candidateId, candidateHoursBefore + slotDur);

            const newScore = scoreWeekAssignments(
              working, candidateMap, totalUnfilled - 1, workingWeekHours, input.maxHoursLookup,
            );

            if (newScore > scoreBefore) {
              targetAssign.assignment.reasoning = buildReasoning(replacementCandidate, targetAssign.assignment.station);
              otherDayAssigned.delete(savedOtherStaff);
              otherDayAssigned.add(replacementId);
              const dayArr = dayAssignmentIndex.get(dayIdx) ?? [];
              dayArr.push(newAssignment);
              dayAssignmentIndex.set(dayIdx, dayArr);
              dayAssigned.add(candidateId);
              workingAssignedPerDay.set(dayIdx, dayAssigned);

              unfilled.slot.assigned++;
              if (unfilled.slot.assigned >= unfilled.slot.needed) {
                workingUnfilled.splice(u, 1);
                totalUnfilled--;
              }
              currentScore = newScore;
              filled = true;
              improved = true;
              totalSwaps++;
              phase3Swaps++;
              break;
            } else {
              working.pop();
              targetAssign.assignment.staffId = savedOtherStaff;
              targetAssign.assignment.staffName = savedOtherName;
              targetAssign.assignment.reasoning = savedOtherReasoning;
              workingWeekHours.set(candidateId, candidateHoursBefore);
              workingWeekHours.set(replacementId, replacementHoursBefore);
            }
          }

        if (filled) break;
      }

      if (filled) break;
    }

      if (filled) continue;

      // Strategy 3d: Depth-2 cross-day chain -- C1 is on Day B, their
      // replacement R1 comes from Day C, and R2 (free) fills R1's slot.
      for (const c1Id of validForUnfilled) {
        if (dayAssigned.has(c1Id)) continue;

        const c1Hours = workingWeekHours.get(c1Id) ?? 0;
        const c1Max = input.maxHoursLookup.get(c1Id) ?? 40;

        if (wouldCreateClopening(c1Id, dayIdx, unfilled.slot.startTime, unfilled.slot.endTime, dayAssignmentIndex)) continue;

        for (const [dayBIdx, dayBAssigned] of workingAssignedPerDay) {
          if (dayBIdx === dayIdx) continue;
          if (!dayBAssigned.has(c1Id)) continue;

          const dayBAssigns = dayAssignmentIndex.get(dayBIdx) ?? [];
          const dayBValidMap = weekSlotValidCandidates.get(dayBIdx);
          if (!dayBValidMap) continue;

          const c1Assign = dayBAssigns.find((ta) => ta.assignment.staffId === c1Id);
          if (!c1Assign) continue;

          const c1SlotKey = `${c1Assign.assignment.station}|${c1Assign.assignment.startTime}|${c1Assign.assignment.endTime}`;
          const c1SlotValid = dayBValidMap.get(c1SlotKey);
          if (!c1SlotValid) continue;

          const c1SlotDur = getSlotDurationHours(c1Assign.assignment.startTime, c1Assign.assignment.endTime);

          // C1 moves from Day B (loses c1SlotDur) to Day A (gains slotDur)
          const c1NewHours = c1Hours - c1SlotDur + slotDur;
          if (c1NewHours > c1Max) continue;

          for (const r1Id of c1SlotValid) {
            if (dayBAssigned.has(r1Id)) continue;

            const r1Candidate = candidateMap.get(r1Id);
            if (!r1Candidate) continue;

            if (wouldCreateClopening(r1Id, dayBIdx, c1Assign.assignment.startTime, c1Assign.assignment.endTime, dayAssignmentIndex)) continue;

            for (const [dayCIdx, dayCAssigned] of workingAssignedPerDay) {
              if (dayCIdx === dayIdx || dayCIdx === dayBIdx) continue;
              if (!dayCAssigned.has(r1Id)) continue;

              const dayCAssigns = dayAssignmentIndex.get(dayCIdx) ?? [];
              const dayCValidMap = weekSlotValidCandidates.get(dayCIdx);
              if (!dayCValidMap) continue;

              const r1Assign = dayCAssigns.find((ta) => ta.assignment.staffId === r1Id);
              if (!r1Assign) continue;

              const r1SlotKey = `${r1Assign.assignment.station}|${r1Assign.assignment.startTime}|${r1Assign.assignment.endTime}`;
              const r1SlotValid = dayCValidMap.get(r1SlotKey);
              if (!r1SlotValid) continue;

              const r1SlotDur = getSlotDurationHours(r1Assign.assignment.startTime, r1Assign.assignment.endTime);
              const r1Hours = workingWeekHours.get(r1Id) ?? 0;
              const r1Max = input.maxHoursLookup.get(r1Id) ?? 40;

              // R1 moves from Day C (loses r1SlotDur) to Day B (gains c1SlotDur)
              const r1NewHours = r1Hours - r1SlotDur + c1SlotDur;
              if (r1NewHours > r1Max) continue;

              for (const r2Id of r1SlotValid) {
                if (dayCAssigned.has(r2Id)) continue;

                const r2Candidate = candidateMap.get(r2Id);
                if (!r2Candidate) continue;

                const r2Hours = workingWeekHours.get(r2Id) ?? 0;
                const r2Max = input.maxHoursLookup.get(r2Id) ?? 40;
                if (r2Hours + r1SlotDur > r2Max) continue;

                if (wouldCreateClopening(r2Id, dayCIdx, r1Assign.assignment.startTime, r1Assign.assignment.endTime, dayAssignmentIndex)) continue;

                const r2AssignedAnywhere = [...workingAssignedPerDay.values()].some((ids) => ids.has(r2Id));
                if (r2AssignedAnywhere) continue;

                const scoreBefore = currentScore;

                const savedC1Staff = c1Assign.assignment.staffId;
                const savedC1Name = c1Assign.assignment.staffName;
                const savedC1Reasoning = c1Assign.assignment.reasoning;

                const savedR1Staff = r1Assign.assignment.staffId;
                const savedR1Name = r1Assign.assignment.staffName;
                const savedR1Reasoning = r1Assign.assignment.reasoning;

                const c1HoursBefore = workingWeekHours.get(c1Id) ?? 0;
                const r1HoursBefore = workingWeekHours.get(r1Id) ?? 0;
                const r2HoursBefore = workingWeekHours.get(r2Id) ?? 0;

                // Apply: R2 -> R1's slot on Day C
                r1Assign.assignment.staffId = r2Id;
                r1Assign.assignment.staffName = r2Candidate.staffName;

                // Apply: R1 -> C1's slot on Day B
                c1Assign.assignment.staffId = r1Id;
                c1Assign.assignment.staffName = r1Candidate.staffName;

                // Apply: C1 -> unfilled slot on Day A
                const c1Candidate = candidateMap.get(c1Id)!;
                const newAssignment: WeekTaggedAssignment = {
                  dayIndex: dayIdx,
                  assignment: {
                    staffId: c1Id,
                    staffName: c1Candidate.staffName,
                    station: unfilled.slot.station,
                    startTime: unfilled.slot.startTime,
                    endTime: unfilled.slot.endTime,
                    reasoning: buildReasoning(c1Candidate, unfilled.slot.station),
                  },
                };
                working.push(newAssignment);

                workingWeekHours.set(c1Id, c1HoursBefore - c1SlotDur + slotDur);
                workingWeekHours.set(r1Id, r1HoursBefore - r1SlotDur + c1SlotDur);
                workingWeekHours.set(r2Id, r2HoursBefore + r1SlotDur);

                const newScore = scoreWeekAssignments(
                  working, candidateMap, totalUnfilled - 1, workingWeekHours, input.maxHoursLookup,
                );

                if (newScore > scoreBefore) {
                  c1Assign.assignment.reasoning = buildReasoning(r1Candidate, c1Assign.assignment.station);
                  r1Assign.assignment.reasoning = buildReasoning(r2Candidate, r1Assign.assignment.station);

                  dayBAssigned.delete(savedC1Staff);
                  dayBAssigned.add(r1Id);

                  dayCAssigned.delete(savedR1Staff);
                  dayCAssigned.add(r2Id);

                  dayAssigned.add(c1Id);
                  workingAssignedPerDay.set(dayIdx, dayAssigned);

                  const dayArr = dayAssignmentIndex.get(dayIdx) ?? [];
                  dayArr.push(newAssignment);
                  dayAssignmentIndex.set(dayIdx, dayArr);

                  unfilled.slot.assigned++;
                  if (unfilled.slot.assigned >= unfilled.slot.needed) {
                    workingUnfilled.splice(u, 1);
                    totalUnfilled--;
                  }
                  currentScore = newScore;
                  filled = true;
                  improved = true;
                  totalSwaps++;
                  phase3dSwaps++;
                  break;
                } else {
                  working.pop();
                  c1Assign.assignment.staffId = savedC1Staff;
                  c1Assign.assignment.staffName = savedC1Name;
                  c1Assign.assignment.reasoning = savedC1Reasoning;
                  r1Assign.assignment.staffId = savedR1Staff;
                  r1Assign.assignment.staffName = savedR1Name;
                  r1Assign.assignment.reasoning = savedR1Reasoning;
                  workingWeekHours.set(c1Id, c1HoursBefore);
                  workingWeekHours.set(r1Id, r1HoursBefore);
                  workingWeekHours.set(r2Id, r2HoursBefore);
                }
              }

              if (filled) break;
            }

            if (filled) break;
          }

          if (filled) break;
        }

        if (filled) break;
      }
    }

    if (!improved) break;
  }

  return {
    assignments: working,
    unfilled: workingUnfilled,
    swapCount: totalSwaps,
    phase1Swaps,
    phase2Swaps,
    phase3Swaps,
    phase3dSwaps,
  };
}

// ============================================================
// DeterministicSolverService -- Public API
// ============================================================

export const DeterministicSolverService = {
  /**
   * Solve a single day's schedule using weighted greedy assignment.
   *
   * All candidates in the context have already passed hard filters
   * (availability, skills, time-off, shift overlap, clopening,
   * overtime) via CandidateService. The solver only makes soft
   * optimization decisions.
   *
   * Guarantees:
   * - Every assignment uses a valid candidate from the slot's list
   * - No staff member is assigned to more than one slot per day
   * - Output is always a valid GeneratedDaySchedule
   *
   * @param context - Day scheduling context with pre-filtered candidates
   * @returns A valid GeneratedDaySchedule (never throws)
   */
  solve(
    context: DaySchedulingContext,
  ): GeneratedDaySchedule {
    const dateStr = context.date.toISOString().split("T")[0];
    const assignments: GeneratedShiftAssignment[] = [];
    const unfilledSlots: UnfilledSlot[] = [];

    const assignedStaffIds = new Set<string>();

    const sortedSlots = sortSlotsByTightness(context.slots);

    for (const { slot, candidates } of sortedSlots) {
      const targetCount = slot.preferredStaff;
      let assignedToSlot = 0;

      const availableCandidates = candidates.filter(
        (c) => !assignedStaffIds.has(c.staffId),
      );

      const scored = availableCandidates.map((c) => ({
        candidate: c,
        score: scoreCandidate(c, slot.station),
      }));

      scored.sort((a, b) => b.score - a.score);

      for (const { candidate } of scored) {
        if (assignedToSlot >= targetCount) break;

        assignments.push({
          staffId: candidate.staffId,
          staffName: candidate.staffName,
          station: slot.station,
          startTime: slot.startTime,
          endTime: slot.endTime,
          reasoning: buildReasoning(candidate, slot.station),
        });

        assignedStaffIds.add(candidate.staffId);
        assignedToSlot++;
      }

      if (assignedToSlot < targetCount) {
        unfilledSlots.push({
          station: slot.station,
          startTime: slot.startTime,
          endTime: slot.endTime,
          needed: targetCount,
          assigned: assignedToSlot,
          reason:
            availableCandidates.length === 0
              ? "No valid candidates available"
              : `Only ${assignedToSlot} of ${targetCount} positions filled (${availableCandidates.length} candidates available, some assigned to other slots)`,
        });
      }
    }

    // ── Hill-climbing local search ──────────────────────────
    const { assignments: optimized, swapCount } = hillClimbOptimize(
      assignments,
      context.slots,
      unfilledSlots.length,
    );

    const noteParts = [
      `Deterministic base schedule: ${optimized.length} assignments, ${unfilledSlots.length} unfilled.`,
    ];
    if (swapCount > 0) {
      noteParts.push(`Hill-climbing improved with ${swapCount} swap(s).`);
    }

    return {
      date: dateStr,
      dayOfWeek: context.dayName,
      assignments: optimized,
      unfilledSlots,
      notes: noteParts.join(" "),
    };
  },

  /**
   * Solve an entire week's schedule in a single unified pass.
   *
   * Unlike `solve()` which operates day-by-day, `solveWeek()` considers
   * ALL slots across ALL days simultaneously. This prevents late-week
   * candidate starvation by ensuring the hardest-to-fill slots (fewest
   * candidates, regardless of which day) get first pick of the staff pool.
   *
   * Algorithm:
   * 1. Flatten all slot-day pairs and sort by global tightness
   * 2. Unified greedy pass with per-day one-shift constraint + weekly maxHours
   * 3. Week-level hill climbing (within-day swaps + cross-day redistribution)
   *
   * Constraints enforced:
   * - One shift per staff member per day
   * - maxHoursPerWeek per staff member
   * - Clopening prevention (10h gap between closing and next-day opening)
   * - Candidates must be valid for the slot (pre-filtered by CandidateService)
   *
   * @param input - Week solver input with all days' candidates and hour limits
   * @returns GeneratedDaySchedule[] ordered by dayIndex (Mon-Sun)
   */
  solveWeek(input: WeekSolverInput): GeneratedDaySchedule[] {
    const candidateMap = buildWeekCandidateMap(input);
    const weekSlotValid = buildWeekSlotValidCandidates(input);

    // ── Phase 1: Flatten and sort all slots globally ──────────
    const allTaggedSlots: WeekTaggedSlot[] = [];
    for (const day of input.days) {
      for (const slotCandidate of day.slots) {
        allTaggedSlots.push({
          dayIndex: day.dayIndex,
          dateStr: day.dateStr,
          dayName: day.dayName,
          slot: slotCandidate,
        });
      }
    }

    allTaggedSlots.sort((a, b) => {
      const aCandidates = a.slot.candidates.length;
      const bCandidates = b.slot.candidates.length;
      if (aCandidates !== bCandidates) return aCandidates - bCandidates;

      const aPri = PRIORITY_ORDER[a.slot.slot.priority] ?? 2;
      const bPri = PRIORITY_ORDER[b.slot.slot.priority] ?? 2;
      if (aPri !== bPri) return bPri - aPri;

      return a.slot.slot.preferredStaff - b.slot.slot.preferredStaff;
    });

    // ── Phase 2: Unified greedy pass ──────────────────────────
    const assignedPerDay = new Map<number, Set<string>>();
    const weekHoursUsed = new Map<string, number>(input.existingWeekHours);
    const allAssignments: WeekTaggedAssignment[] = [];
    const allUnfilled: Array<{ dayIndex: number; slot: UnfilledSlot }> = [];
    const dayAssignmentIndex = new Map<number, WeekTaggedAssignment[]>();

    for (const day of input.days) {
      assignedPerDay.set(day.dayIndex, new Set());
      dayAssignmentIndex.set(day.dayIndex, []);
    }

    for (const tagged of allTaggedSlots) {
      const { dayIndex, slot: { slot, candidates } } = tagged;
      const targetCount = slot.preferredStaff;
      let assignedToSlot = 0;

      const dayAssigned = assignedPerDay.get(dayIndex)!;
      const slotDuration = getSlotDurationHours(slot.startTime, slot.endTime);

      const availableCandidates = candidates.filter(
        (c) => !dayAssigned.has(c.staffId),
      );

      const scored = availableCandidates
        .filter((c) => {
          const currentHours = weekHoursUsed.get(c.staffId) ?? 0;
          const max = input.maxHoursLookup.get(c.staffId) ?? 40;
          return currentHours + slotDuration <= max;
        })
        .map((c) => ({
          candidate: c,
          score: scoreCandidate(c, slot.station, weekHoursUsed.get(c.staffId) ?? 0),
        }));

      scored.sort((a, b) => b.score - a.score);

      for (const { candidate } of scored) {
        if (assignedToSlot >= targetCount) break;

        if (wouldCreateClopening(
          candidate.staffId, dayIndex, slot.startTime, slot.endTime,
          dayAssignmentIndex,
        )) continue;

        const ta: WeekTaggedAssignment = {
          dayIndex,
          assignment: {
            staffId: candidate.staffId,
            staffName: candidate.staffName,
            station: slot.station,
            startTime: slot.startTime,
            endTime: slot.endTime,
            reasoning: buildReasoning(candidate, slot.station),
          },
        };

        allAssignments.push(ta);
        dayAssignmentIndex.get(dayIndex)!.push(ta);
        dayAssigned.add(candidate.staffId);

        const currentHours = weekHoursUsed.get(candidate.staffId) ?? 0;
        weekHoursUsed.set(candidate.staffId, currentHours + slotDuration);
        assignedToSlot++;
      }

      if (assignedToSlot < targetCount) {
        allUnfilled.push({
          dayIndex,
          slot: {
            station: slot.station,
            startTime: slot.startTime,
            endTime: slot.endTime,
            needed: targetCount,
            assigned: assignedToSlot,
            reason:
              availableCandidates.length === 0
                ? "No valid candidates available"
                : `Only ${assignedToSlot} of ${targetCount} positions filled`,
          },
        });
      }
    }

    // ── Phase 3: Week-level hill climbing ─────────────────────
    const {
      assignments: optimized,
      unfilled: optimizedUnfilled,
      swapCount,
      phase1Swaps: hcPhase1,
      phase2Swaps: hcPhase2,
      phase3Swaps: hcPhase3,
      phase3dSwaps: hcPhase3d,
    } = weekHillClimbOptimize(
        allAssignments,
        allUnfilled,
        input,
        candidateMap,
        weekSlotValid,
        weekHoursUsed,
        assignedPerDay,
      );

    // ── Phase 4: Group results by day ────────────────────────
    const dayScheduleMap = new Map<number, {
      assignments: GeneratedShiftAssignment[];
      unfilled: UnfilledSlot[];
    }>();

    for (const day of input.days) {
      dayScheduleMap.set(day.dayIndex, { assignments: [], unfilled: [] });
    }

    for (const ta of optimized) {
      dayScheduleMap.get(ta.dayIndex)!.assignments.push(ta.assignment);
    }

    for (const u of optimizedUnfilled) {
      dayScheduleMap.get(u.dayIndex)!.unfilled.push(u.slot);
    }

    const results: GeneratedDaySchedule[] = [];
    const sortedDays = [...input.days].sort((a, b) => a.dayIndex - b.dayIndex);

    for (const day of sortedDays) {
      const dayData = dayScheduleMap.get(day.dayIndex)!;
      const noteParts = [
        `Week-level solve: ${dayData.assignments.length} assignments, ${dayData.unfilled.length} unfilled.`,
      ];
      if (swapCount > 0 && day.dayIndex === sortedDays[0].dayIndex) {
        noteParts.push(
          `Week-level hill climbing: ${swapCount} swap(s) (pairwise: ${hcPhase1}, replacements: ${hcPhase2}, redistribution: ${hcPhase3}, depth-2: ${hcPhase3d}).`,
        );
      }

      results.push({
        date: day.dateStr,
        dayOfWeek: day.dayName,
        assignments: dayData.assignments,
        unfilledSlots: dayData.unfilled,
        notes: noteParts.join(" "),
      });
    }

    return results;
  },
};

/**
 * Parse HH:MM time strings into a duration in hours.
 */
function getSlotDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}
