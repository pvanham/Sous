import { format } from "date-fns";
import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  ValidationError,
} from "@/types/ai-scheduling";
import type { CandidateDTO } from "@/types/candidate";

// ============================================================
// Schedule Generation Prompts -- Swap-Based Architecture
// ============================================================
// Prompt templates for the AI Schedule Optimizer.
// The AI receives a valid base schedule (produced by the CP solver)
// and suggests specific SWAPS to improve preference alignment
// and hour fairness.
//
// Key design: the AI returns a list of swaps (not a full schedule),
// each of which is independently validated and applied. Invalid
// swaps are skipped -- partial success is possible.
//
// Architecture: Part of the AI Service Layer (per ARCHITECTURE.md).
// These are pure functions -- no DB access, no side effects.
// ============================================================

const MAX_CANDIDATES_PER_SLOT = 10;

// ────────────────────────────────────────────────────────────
// Shared Helpers
// ────────────────────────────────────────────────────────────

/**
 * Compute a 1-based hours-utilization rank for each candidate in a slot.
 * Rank 1 = most remaining hours (best pick for fairness).
 */
function computeHoursRankMap(candidates: CandidateDTO[]): Map<string, number> {
  const sorted = [...candidates].sort(
    (a, b) =>
      (b.maxHoursPerWeek - b.currentWeekHours) -
      (a.maxHoursPerWeek - a.currentWeekHours),
  );
  return new Map(sorted.map((c, i) => [c.staffId, i + 1]));
}

/**
 * Build a lookup from staffId -> assignment for the base schedule.
 * Used to tag candidates with their current assignment in the prompt.
 */
function buildAssignmentMap(
  assignments: GeneratedShiftAssignment[],
): Map<string, GeneratedShiftAssignment> {
  const map = new Map<string, GeneratedShiftAssignment>();
  for (const a of assignments) {
    map.set(a.staffId, a);
  }
  return map;
}

/**
 * Format a candidate compactly for inclusion in the prompt.
 * Uses short alias IDs (e.g., "S1") to reduce token count.
 * Includes [ASSIGNED: Station HH:MM-HH:MM] flag when the candidate
 * is already assigned in the base schedule.
 */
function formatCandidate(
  candidate: CandidateDTO,
  station: string,
  idToAlias: Map<string, string>,
  hoursRank: number,
  totalInSlot: number,
  assignmentMap: Map<string, GeneratedShiftAssignment>,
): string {
  const alias = idToAlias.get(candidate.staffId) ?? candidate.staffId;
  const proficiency =
    candidate.skills.find((s) => s.station === station)?.proficiency ?? 0;
  const isPreferredStation = candidate.preferredStations.includes(station);
  const hoursRemaining =
    candidate.maxHoursPerWeek - candidate.currentWeekHours;

  const flags: string[] = [];

  const currentAssignment = assignmentMap.get(candidate.staffId);
  if (currentAssignment) {
    flags.push(`ASSIGNED: ${currentAssignment.station} ${currentAssignment.startTime}-${currentAssignment.endTime}`);
  }

  if (candidate.preference === "preferred") flags.push("PREF_TIME");
  if (isPreferredStation) flags.push("PREF_STN");

  const flagStr = flags.length > 0 ? ` [${flags.join("] [")}]` : "";

  return `    - ${alias} "${candidate.staffName}" prof:${proficiency}/5 hrs:${hoursRemaining.toFixed(1)}rem rank:${hoursRank}/${totalInSlot}${flagStr}`;
}

// ────────────────────────────────────────────────────────────
// Optimizer System Prompt
// ────────────────────────────────────────────────────────────

/**
 * Build the system prompt for the swap-based AI optimizer.
 * Restricts swaps to FREE (unassigned) candidates only --
 * no swap chains, eliminating the most common failure modes.
 */
export function buildOptimizerSystemPrompt(): string {
  return `You are Sous, a kitchen schedule optimizer.

You will receive a VALID BASE SCHEDULE that has already been optimized by a constraint programming solver. Your job is to suggest SWAPS that further improve it.

HARD RULES (violating any of these makes a swap invalid — it will be skipped):
1. Each swap replaces ONE staff member in ONE slot with a DIFFERENT staff member from that slot's candidate list.
2. You MUST use the exact staffId alias values (e.g., "S1", "S2") from the candidate lists.
3. You may ONLY use candidates listed under "FREE candidates" for a slot. NEVER use candidates listed under "ASSIGNED" — they are already working another slot today.
4. You MUST use a slot key from the VALID SLOT KEYS list. Do not invent slot names.
5. The removeStaffId must be the alias of the person CURRENTLY assigned to that slot in the base schedule.

SCORING FORMULA (this is exactly how your swaps are evaluated):
  +3 points for each assignment on a preferred station (PREF_STN flag)
  +2 points for each assignment with preferred time (PREF_TIME flag)
  -0.1 × variance of remaining weekly hours across all assigned staff
  -10 points per unfilled slot
A swap is only accepted if the TOTAL score after ALL swaps is HIGHER than the base score.
Do NOT sacrifice time preferences (+2 each) for station preferences (+3 each) unless the net gain is clearly positive.

WORKED EXAMPLE — Why a "+3 station" swap can still LOSE points:
  Suppose you swap out a staff member who has PREF_TIME for their current slot.
  - You GAIN +3 (new person gets preferred station)
  - You LOSE -2 (old person loses their PREF_TIME match)
  - The new person may have fewer remaining hours, worsening hour variance: -1.5
  - Net: +3 -2 -1.5 = -0.5 → REJECTED. Do NOT make this swap.
  Only swap when you are confident the total delta is positive.

OPTIMIZATION GOALS (in priority order):
1. Station preferences — Move staff to their preferred stations (PREF_STN flag).
2. Time preferences — Preserve and improve PREF_TIME matches. Do not displace a PREF_TIME match unless you gain more elsewhere.
3. Hour fairness — Prefer candidates with more remaining weekly hours (lower rank number = more hours).
4. If the base schedule is already optimal, return an empty swaps array.

OUTPUT FORMAT — respond with a single JSON object:
{
  "swaps": [
    {
      "slot": "<Station> <HH:MM>-<HH:MM>",
      "removeStaffId": "<alias of person currently in this slot>",
      "assignStaffId": "<alias of FREE candidate from that slot's list>",
      "reasoning": "<short phrase>"
    }
  ],
  "notes": "<1 sentence summary>"
}

If no improvements are possible, return: { "swaps": [], "notes": "Base schedule is already optimal." }`;
}

// ────────────────────────────────────────────────────────────
// Optimizer User Prompt
// ────────────────────────────────────────────────────────────

/** Score breakdown passed from the caller (avoids importing validator into prompts) */
export interface ScoreBreakdownInput {
  total: number;
  preferredStationCount: number;
  preferredStationMatches: number;
  timePreferenceCount: number;
  timePreferenceMatches: number;
  hourBalancePenalty: number;
  unfilledCount: number;
  unfilledPenalty: number;
}

/**
 * Build the user prompt for the swap-based optimizer. Includes:
 * 1. Day header
 * 2. Current score breakdown (so the AI can calculate expected swap impact)
 * 3. The base schedule with assignment annotations
 * 4. Auto-detected swap opportunities
 * 5. Available candidates per slot split into FREE / ASSIGNED groups
 * 6. Explicit list of valid slot keys
 *
 * @param context - Day scheduling context with candidates
 * @param baseSchedule - The CP solver's valid output
 * @param idToAlias - Map of real staffId -> short alias
 * @param scoreBreakdown - Optional current score breakdown for the AI to reason about
 */
export function buildOptimizerUserPrompt(
  context: DaySchedulingContext,
  baseSchedule: GeneratedDaySchedule,
  idToAlias: Map<string, string>,
  scoreBreakdown?: ScoreBreakdownInput,
): string {
  const dateStr = format(context.date, "yyyy-MM-dd");
  const lines: string[] = [];
  const assignmentMap = buildAssignmentMap(baseSchedule.assignments);
  const assignedStaffIds = new Set(baseSchedule.assignments.map((a) => a.staffId));

  // Build a global candidate map for preference lookups
  const candidateMap = new Map<string, CandidateDTO>();
  for (const { candidates } of context.slots) {
    for (const c of candidates) {
      if (!candidateMap.has(c.staffId)) {
        candidateMap.set(c.staffId, c);
      }
    }
  }

  // Header
  lines.push(`SUGGEST SWAPS FOR: ${context.dayName}, ${dateStr}`);
  if (context.kitchenContext.operatingHours) {
    lines.push(
      `Operating Hours: ${context.kitchenContext.operatingHours.open} - ${context.kitchenContext.operatingHours.close}`,
    );
  }
  lines.push("");

  if (scoreBreakdown) {
    lines.push(`CURRENT SCORE BREAKDOWN (total = ${scoreBreakdown.total.toFixed(2)}):`);
    lines.push(`  Preferred stations: ${scoreBreakdown.preferredStationCount} matches × +3 = +${scoreBreakdown.preferredStationMatches}`);
    lines.push(`  Preferred times:    ${scoreBreakdown.timePreferenceCount} matches × +2 = +${scoreBreakdown.timePreferenceMatches}`);
    lines.push(`  Hour balance:       -${scoreBreakdown.hourBalancePenalty.toFixed(1)} (lower is better)`);
    if (scoreBreakdown.unfilledCount > 0) {
      lines.push(`  Unfilled slots:     ${scoreBreakdown.unfilledCount} × -10 = -${scoreBreakdown.unfilledPenalty}`);
    }
    lines.push(`Your swaps must produce a TOTAL score above ${scoreBreakdown.total.toFixed(2)} to be accepted.`);
    lines.push("");
  }

  // Base schedule with slot identifiers (only filled slots are valid swap targets)
  lines.push(`CURRENT SCHEDULE (${baseSchedule.assignments.length} assignments — all valid):`);
  for (const a of baseSchedule.assignments) {
    const alias = idToAlias.get(a.staffId) ?? a.staffId;
    const candidate = candidateMap.get(a.staffId);
    const isPreferred = candidate?.preferredStations.includes(a.station);
    const prefNote = isPreferred ? "" : candidate?.preferredStations.length
      ? ` (prefers: ${candidate.preferredStations.join(", ")})`
      : "";
    const timeFlag = candidate?.preference === "preferred" ? " [PREF_TIME]" : "";

    lines.push(`  ${a.station} ${a.startTime}-${a.endTime}: ${alias} "${a.staffName}"${prefNote}${timeFlag}`);
  }
  if (baseSchedule.unfilledSlots.length > 0) {
    lines.push(`  Unfilled (cannot be swap targets): ${baseSchedule.unfilledSlots.map((u) => `${u.station} ${u.startTime}-${u.endTime}`).join(", ")}`);
  }
  lines.push("");

  // Valid slot keys
  const validSlotKeys = baseSchedule.assignments.map(
    (a) => `${a.station} ${a.startTime}-${a.endTime}`,
  );
  lines.push(`VALID SLOT KEYS (only use these in the "slot" field):`);
  for (const key of validSlotKeys) {
    lines.push(`  - ${key}`);
  }
  lines.push("");

  // Optimization opportunities
  const opportunities = detectSwapOpportunities(
    baseSchedule,
    context,
    idToAlias,
  );
  if (opportunities.length > 0) {
    lines.push("SWAP OPPORTUNITIES (non-preferred station assignments):");
    for (const opp of opportunities) {
      lines.push(`  - ${opp}`);
    }
    lines.push("");
  }

  // Available candidates per slot, split into FREE and ASSIGNED
  lines.push(`CANDIDATES PER SLOT (${context.slots.length} slots):`);
  lines.push("Use ONLY candidates from the FREE list. ASSIGNED candidates are already working today and cannot be used.");
  lines.push("");

  for (let i = 0; i < context.slots.length; i++) {
    const { slot, candidates } = context.slots[i];
    const capped = candidates.slice(0, MAX_CANDIDATES_PER_SLOT);

    lines.push(
      `[Slot ${i + 1}] ${slot.station} ${slot.startTime}-${slot.endTime} | need:${slot.preferredStaff}`,
    );

    if (capped.length === 0) {
      lines.push("  Candidates: NONE");
    } else {
      const rankMap = computeHoursRankMap(capped);
      const freeCandidates = capped.filter((c) => !assignedStaffIds.has(c.staffId));
      const assignedCandidates = capped.filter((c) => assignedStaffIds.has(c.staffId));

      if (freeCandidates.length > 0) {
        lines.push(`  FREE candidates (${freeCandidates.length} — usable for swaps):`);
        for (const candidate of freeCandidates) {
          const rank = rankMap.get(candidate.staffId) ?? capped.length;
          lines.push(formatCandidate(candidate, slot.station, idToAlias, rank, capped.length, assignmentMap));
        }
      } else {
        lines.push("  FREE candidates: NONE");
      }

      if (assignedCandidates.length > 0) {
        lines.push(`  ASSIGNED (${assignedCandidates.length} — already working, DO NOT USE):`);
        for (const candidate of assignedCandidates) {
          const rank = rankMap.get(candidate.staffId) ?? capped.length;
          lines.push(formatCandidate(candidate, slot.station, idToAlias, rank, capped.length, assignmentMap));
        }
      }
    }
    lines.push("");
  }

  lines.push(
    "Suggest swaps using ONLY FREE candidates to improve station preference matches and hour balance. Return swap instructions as JSON.",
  );

  return lines.join("\n");
}

/**
 * Detect specific swap opportunities in the base schedule
 * to guide the AI toward useful swaps.
 */
function detectSwapOpportunities(
  baseSchedule: GeneratedDaySchedule,
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
): string[] {
  const opportunities: string[] = [];

  const candidateMap = new Map<string, CandidateDTO>();
  for (const { candidates } of context.slots) {
    for (const c of candidates) {
      if (!candidateMap.has(c.staffId)) {
        candidateMap.set(c.staffId, c);
      }
    }
  }

  for (const a of baseSchedule.assignments) {
    const candidate = candidateMap.get(a.staffId);
    if (!candidate) continue;

    const alias = idToAlias.get(a.staffId) ?? a.staffId;

    if (
      candidate.preferredStations.length > 0 &&
      !candidate.preferredStations.includes(a.station)
    ) {
      const preferredSlots = context.slots
        .filter((s) => candidate.preferredStations.includes(s.slot.station))
        .map((s) => `${s.slot.station} ${s.slot.startTime}-${s.slot.endTime}`)
        .slice(0, 3);

      const availableFor = preferredSlots.length > 0
        ? ` Available for: ${preferredSlots.join(", ")}`
        : "";

      opportunities.push(
        `${alias} "${a.staffName}" is on ${a.station} ${a.startTime}-${a.endTime} but prefers: ${candidate.preferredStations.join(", ")}.${availableFor}`,
      );
    }
  }

  return opportunities;
}

// ────────────────────────────────────────────────────────────
// Optimizer Correction Prompt (Swap-Based)
// ────────────────────────────────────────────────────────────

/**
 * Build a correction prompt when the AI's swap suggestions were
 * rejected (all swaps invalid or net score didn't improve).
 * Uses the same FREE/ASSIGNED split and valid slot list as the
 * initial user prompt.
 *
 * @param baseSchedule - The deterministic base (reference point)
 * @param failedSwapDescriptions - Human-readable descriptions of why swaps failed
 * @param rejectionReason - Why the attempt was rejected
 * @param context - Day scheduling context
 * @param idToAlias - Alias map
 */
export function buildSwapCorrectionPrompt(
  baseSchedule: GeneratedDaySchedule,
  failedSwapDescriptions: string[],
  rejectionReason: OptimizerRejectionReason,
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
): string {
  const dateStr = format(context.date, "yyyy-MM-dd");
  const lines: string[] = [];
  const assignmentMap = buildAssignmentMap(baseSchedule.assignments);
  const assignedStaffIds = new Set(baseSchedule.assignments.map((a) => a.staffId));

  lines.push(
    `Your previous swap suggestions for ${context.dayName}, ${dateStr} were REJECTED.`,
  );
  lines.push("");

  if (rejectionReason.type === "invalid") {
    lines.push("REASON: Your swaps contained errors:");
    for (const desc of failedSwapDescriptions) {
      lines.push(`  - ${desc}`);
    }
  } else {
    lines.push(
      `REASON: The resulting schedule scored LOWER than the base (${rejectionReason.aiScore} vs ${rejectionReason.baseScore}).`,
    );
    lines.push("Remember: +3 per preferred station, +2 per preferred time, -0.1*variance for hours. Do NOT sacrifice time preferences unless the net gain is clearly positive.");
    if (rejectionReason.details) {
      lines.push(`Details: ${rejectionReason.details}`);
    }
  }
  lines.push("");

  // Show the base schedule as reference
  lines.push("BASE SCHEDULE (the valid reference — your swaps must improve this):");
  for (const a of baseSchedule.assignments) {
    const alias = idToAlias.get(a.staffId) ?? a.staffId;
    lines.push(
      `  ${a.station} ${a.startTime}-${a.endTime}: ${alias} "${a.staffName}"`,
    );
  }
  lines.push("");

  // Valid slot keys
  const validSlotKeys = baseSchedule.assignments.map(
    (a) => `${a.station} ${a.startTime}-${a.endTime}`,
  );
  lines.push("VALID SLOT KEYS (only use these in the \"slot\" field):");
  for (const key of validSlotKeys) {
    lines.push(`  - ${key}`);
  }
  lines.push("");

  // Candidate lists with FREE/ASSIGNED split
  lines.push("CANDIDATES PER SLOT:");
  lines.push("Use ONLY candidates from the FREE list. ASSIGNED candidates are already working today and cannot be used.");
  lines.push("");

  for (let i = 0; i < context.slots.length; i++) {
    const { slot, candidates } = context.slots[i];
    const capped = candidates.slice(0, MAX_CANDIDATES_PER_SLOT);

    lines.push(
      `[Slot ${i + 1}] ${slot.station} ${slot.startTime}-${slot.endTime} | need:${slot.preferredStaff}`,
    );

    if (capped.length === 0) {
      lines.push("  Candidates: NONE");
    } else {
      const rankMap = computeHoursRankMap(capped);
      const freeCandidates = capped.filter((c) => !assignedStaffIds.has(c.staffId));
      const assignedCandidates = capped.filter((c) => assignedStaffIds.has(c.staffId));

      if (freeCandidates.length > 0) {
        lines.push(`  FREE candidates (${freeCandidates.length} — usable for swaps):`);
        for (const fc of freeCandidates) {
          const rank = rankMap.get(fc.staffId) ?? capped.length;
          lines.push(formatCandidate(fc, slot.station, idToAlias, rank, capped.length, assignmentMap));
        }
      } else {
        lines.push("  FREE candidates: NONE");
      }

      if (assignedCandidates.length > 0) {
        lines.push(`  ASSIGNED (${assignedCandidates.length} — already working, DO NOT USE):`);
        for (const ac of assignedCandidates) {
          const rank = rankMap.get(ac.staffId) ?? capped.length;
          lines.push(formatCandidate(ac, slot.station, idToAlias, rank, capped.length, assignmentMap));
        }
      }
    }
  }
  lines.push("");

  lines.push(
    "Try different swaps using ONLY FREE candidates. If no improvements are possible with free candidates, return an empty swaps array.",
  );

  return lines.join("\n");
}

// Keep the old correction prompt signature for backward compatibility during transition
export function buildOptimizerCorrectionPrompt(
  baseSchedule: GeneratedDaySchedule,
  _previousOutput: GeneratedDaySchedule,
  rejectionReason: OptimizerRejectionReason,
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
): string {
  return buildSwapCorrectionPrompt(
    baseSchedule,
    rejectionReason.type === "invalid"
      ? rejectionReason.errors.map((e) => `${e.message} HINT: ${e.correctionHint}`)
      : [`Score too low: ${rejectionReason.aiScore} vs base ${rejectionReason.baseScore}`],
    rejectionReason,
    context,
    idToAlias,
  );
}

// ────────────────────────────────────────────────────────────
// Rejection Reason Type
// ────────────────────────────────────────────────────────────

export type OptimizerRejectionReason =
  | { type: "invalid"; errors: ValidationError[] }
  | { type: "lower_quality"; baseScore: number; aiScore: number; details?: string };
