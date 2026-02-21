import type { CandidateDTO, SlotCandidates } from "@/types/candidate";
import type { LaborPriority } from "@/types/labor-requirement";
import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  UnfilledSlot,
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

// ────────────────────────────────────────────────────────────
// Scoring Weights
// ────────────────────────────────────────────────────────────

const WEIGHT_PREFERRED_STATION = 10;
const WEIGHT_PREFERRED_TIME = 5;
const WEIGHT_HOURS_BALANCE = 8;
const WEIGHT_PROFICIENCY = 2;

/**
 * Score a candidate for a specific slot. Higher = better fit.
 *
 * Factors:
 * - Preferred station match (+10)
 * - Availability preference "preferred" (+5)
 * - Hours balance: remaining capacity ratio (+0 to +8)
 * - Proficiency for the target station (+2 per level, max +10)
 */
function scoreCandidate(
  candidate: CandidateDTO,
  station: string,
): number {
  let score = 0;

  if (candidate.preferredStations.includes(station)) {
    score += WEIGHT_PREFERRED_STATION;
  }

  if (candidate.preference === "preferred") {
    score += WEIGHT_PREFERRED_TIME;
  }

  const remaining = candidate.maxHoursPerWeek - candidate.currentWeekHours;
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
   * @param dayHourBudget - Optional soft target for total hours this day
   *                        (used for cross-day hour budgeting)
   * @returns A valid GeneratedDaySchedule (never throws)
   */
  solve(
    context: DaySchedulingContext,
    dayHourBudget?: number,
  ): GeneratedDaySchedule {
    const dateStr = context.date.toISOString().split("T")[0];
    const assignments: GeneratedShiftAssignment[] = [];
    const unfilledSlots: UnfilledSlot[] = [];

    const assignedStaffIds = new Set<string>();
    let dayHoursUsed = 0;

    const sortedSlots = sortSlotsByTightness(context.slots);

    for (const { slot, candidates } of sortedSlots) {
      const targetCount = slot.preferredStaff;
      let assignedToSlot = 0;

      const slotDuration = getSlotDurationHours(
        slot.startTime,
        slot.endTime,
      );

      const availableCandidates = candidates.filter(
        (c) => !assignedStaffIds.has(c.staffId),
      );

      const scored = availableCandidates.map((c) => ({
        candidate: c,
        score: scoreCandidate(c, slot.station),
      }));

      if (dayHourBudget !== undefined) {
        for (const entry of scored) {
          const wouldExceedBudget =
            dayHoursUsed + slotDuration > dayHourBudget * 1.15;
          if (wouldExceedBudget) {
            const remaining =
              entry.candidate.maxHoursPerWeek -
              entry.candidate.currentWeekHours;
            const capacityRatio =
              entry.candidate.maxHoursPerWeek > 0
                ? remaining / entry.candidate.maxHoursPerWeek
                : 0;
            if (capacityRatio < 0.3) {
              entry.score -= 3;
            }
          }
        }
      }

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
        dayHoursUsed += slotDuration;
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

    return {
      date: dateStr,
      dayOfWeek: context.dayName,
      assignments,
      unfilledSlots,
      notes: `Deterministic base schedule: ${assignments.length} assignments, ${unfilledSlots.length} unfilled.`,
    };
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
