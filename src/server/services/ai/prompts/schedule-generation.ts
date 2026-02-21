import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  ValidationError,
} from "@/types/ai-scheduling";
import type { CandidateDTO } from "@/types/candidate";

// ============================================================
// Schedule Generation Prompts -- Hybrid Architecture
// ============================================================
// Prompt templates for the AI Schedule Optimizer.
// The AI receives a valid base schedule from the deterministic
// solver and attempts to improve it by reassigning staff for
// better preference alignment and hour fairness.
//
// Architecture: Part of the AI Service Layer (per ARCHITECTURE.md).
// These are pure functions -- no DB access, no side effects.
// ============================================================

const MAX_CANDIDATES_PER_SLOT = 8;

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
 * Format a candidate compactly for inclusion in the prompt.
 * Uses short alias IDs (e.g., "S1") to reduce token count.
 */
function formatCandidate(
  candidate: CandidateDTO,
  station: string,
  idToAlias: Map<string, string>,
  hoursRank: number,
  totalInSlot: number,
): string {
  const alias = idToAlias.get(candidate.staffId) ?? candidate.staffId;
  const proficiency =
    candidate.skills.find((s) => s.station === station)?.proficiency ?? 0;
  const isPreferredStation = candidate.preferredStations.includes(station);
  const hoursRemaining =
    candidate.maxHoursPerWeek - candidate.currentWeekHours;

  const flags: string[] = [];
  if (candidate.preference === "preferred") flags.push("PREF_TIME");
  if (isPreferredStation) flags.push("PREF_STN");

  const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";

  return `    - ${alias} "${candidate.staffName}" prof:${proficiency}/5 hrs:${hoursRemaining.toFixed(1)}rem rank:${hoursRank}/${totalInSlot}${flagStr}`;
}

// ────────────────────────────────────────────────────────────
// Optimizer System Prompt
// ────────────────────────────────────────────────────────────

/**
 * Build the system prompt for the AI optimizer role.
 * Positions the AI as an optimizer that improves a valid base schedule,
 * NOT as the primary scheduler.
 */
export function buildOptimizerSystemPrompt(): string {
  return `You are Sous, a kitchen schedule optimizer.

You will receive a VALID BASE SCHEDULE and a list of AVAILABLE CANDIDATES for each slot. The base schedule already satisfies all hard constraints. Your job is to IMPROVE it by reassigning staff to better match preferences and balance hours.

HARD RULES (violating any of these makes your output invalid):
1. You MUST only assign staff who appear in a slot's candidate list. Never invent staff.
2. You MUST use the exact staffId alias values (e.g., "S1", "S2") from the candidate lists.
3. A staff member MUST NOT be assigned more than ONE shift per day — no exceptions.
4. Assign up to the "need" count for each slot. If fewer candidates exist, report in "unfilledSlots".
5. Every slot from the base schedule must appear in your output with an assignment (or in unfilledSlots).

OPTIMIZATION GOALS (what makes a schedule "better"):
1. Station preferences — Assign staff to stations in their preferredStations list when possible. This is the primary optimization target.
2. Hour fairness — Spread hours evenly. Prefer candidates with more remaining weekly hours.
3. Time preferences — Favor candidates flagged as PREF_TIME over others.
4. If the base schedule is already optimal, return it unchanged.

For each assignment, provide a brief "reasoning" (one short phrase).

OUTPUT FORMAT — respond with a single JSON object:
{
  "assignments": [
    {
      "staffId": "<alias, e.g. S1>",
      "staffName": "<name>",
      "station": "<station>",
      "startTime": "<HH:MM>",
      "endTime": "<HH:MM>",
      "reasoning": "<short phrase>"
    }
  ],
  "unfilledSlots": [
    {
      "station": "<station>",
      "startTime": "<HH:MM>",
      "endTime": "<HH:MM>",
      "needed": <number>,
      "assigned": <number>,
      "reason": "<why>"
    }
  ],
  "notes": "<1 sentence summary>"
}`;
}

// ────────────────────────────────────────────────────────────
// Optimizer User Prompt
// ────────────────────────────────────────────────────────────

/**
 * Build the user prompt for the AI optimizer. Includes:
 * 1. Day header
 * 2. The base schedule from the deterministic solver
 * 3. Auto-detected optimization opportunities
 * 4. Available candidates per slot (capped at MAX_CANDIDATES_PER_SLOT)
 *
 * @param context - Day scheduling context with candidates
 * @param baseSchedule - The deterministic solver's valid output
 * @param idToAlias - Map of real staffId -> short alias
 */
export function buildOptimizerUserPrompt(
  context: DaySchedulingContext,
  baseSchedule: GeneratedDaySchedule,
  idToAlias: Map<string, string>,
): string {
  const dateStr = context.date.toISOString().split("T")[0];
  const lines: string[] = [];

  // Header
  lines.push(`OPTIMIZE SCHEDULE FOR: ${context.dayName}, ${dateStr}`);
  if (context.kitchenContext.operatingHours) {
    lines.push(
      `Operating Hours: ${context.kitchenContext.operatingHours.open} - ${context.kitchenContext.operatingHours.close}`,
    );
  }
  lines.push("");

  // Base schedule
  lines.push(`BASE SCHEDULE (${baseSchedule.assignments.length} assignments — all valid):`);
  for (const a of baseSchedule.assignments) {
    const alias = idToAlias.get(a.staffId) ?? a.staffId;
    lines.push(`  ${alias} "${a.staffName}" -> ${a.station} ${a.startTime}-${a.endTime}`);
  }
  if (baseSchedule.unfilledSlots.length > 0) {
    lines.push(`  Unfilled: ${baseSchedule.unfilledSlots.map((u) => `${u.station} ${u.startTime}-${u.endTime}`).join(", ")}`);
  }
  lines.push("");

  // Optimization opportunities
  const opportunities = detectOptimizationOpportunities(
    baseSchedule,
    context,
    idToAlias,
  );
  if (opportunities.length > 0) {
    lines.push("OPTIMIZATION OPPORTUNITIES:");
    for (const opp of opportunities) {
      lines.push(`  - ${opp}`);
    }
    lines.push("");
  }

  // Available candidates per slot
  lines.push(`AVAILABLE CANDIDATES PER SLOT (${context.slots.length} slots):`);
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
      lines.push(`  Candidates (${capped.length}${candidates.length > MAX_CANDIDATES_PER_SLOT ? ` of ${candidates.length}` : ""}):`);
      for (const candidate of capped) {
        const rank = rankMap.get(candidate.staffId) ?? capped.length;
        lines.push(formatCandidate(candidate, slot.station, idToAlias, rank, capped.length));
      }
    }
    lines.push("");
  }

  lines.push(
    "Improve this schedule by reassigning staff to better match station preferences and balance hours. Output the full optimized schedule as valid JSON.",
  );

  return lines.join("\n");
}

/**
 * Detect specific optimization opportunities in the base schedule
 * to guide the AI toward useful swaps.
 */
function detectOptimizationOpportunities(
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
      opportunities.push(
        `${alias} "${a.staffName}" is on ${a.station} but prefers: ${candidate.preferredStations.join(", ")}`,
      );
    }
  }

  return opportunities;
}

// ────────────────────────────────────────────────────────────
// Optimizer Correction Prompt
// ────────────────────────────────────────────────────────────

/**
 * Build a correction prompt when the AI's optimization attempt was
 * rejected (invalid output or lower quality score than the base).
 *
 * @param baseSchedule - The deterministic base (reference point)
 * @param previousOutput - The AI's rejected output
 * @param rejectionReason - Why it was rejected
 * @param context - Day scheduling context
 * @param idToAlias - Alias map
 */
export function buildOptimizerCorrectionPrompt(
  baseSchedule: GeneratedDaySchedule,
  previousOutput: GeneratedDaySchedule,
  rejectionReason: OptimizerRejectionReason,
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
): string {
  const dateStr = context.date.toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push(
    `Your previous optimization for ${context.dayName}, ${dateStr} was REJECTED.`,
  );
  lines.push("");

  // Explain why
  if (rejectionReason.type === "invalid") {
    lines.push("REASON: Your output contained validation errors:");
    for (const err of rejectionReason.errors) {
      lines.push(`  - ${err.message} HINT: ${err.correctionHint}`);
    }
  } else {
    lines.push(
      `REASON: Your output scored LOWER than the base schedule (${rejectionReason.aiScore} vs ${rejectionReason.baseScore}).`,
    );
    if (rejectionReason.details) {
      lines.push(`Details: ${rejectionReason.details}`);
    }
  }
  lines.push("");

  // Show the base schedule as reference
  lines.push("BASE SCHEDULE (the valid reference — you must beat this):");
  for (const a of baseSchedule.assignments) {
    const alias = idToAlias.get(a.staffId) ?? a.staffId;
    lines.push(
      `  ${alias} "${a.staffName}" -> ${a.station} ${a.startTime}-${a.endTime}`,
    );
  }
  lines.push("");

  // Show aliased version of the rejected output
  const aliasedPrev = {
    ...previousOutput,
    assignments: previousOutput.assignments.map((a) => ({
      ...a,
      staffId: idToAlias.get(a.staffId) ?? a.staffId,
    })),
  };
  lines.push("YOUR PREVIOUS (REJECTED) OUTPUT:");
  lines.push(JSON.stringify(aliasedPrev, null, 2));
  lines.push("");

  // Candidate lists (compact)
  lines.push("AVAILABLE CANDIDATES PER SLOT:");
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
      for (const candidate of capped) {
        const rank = rankMap.get(candidate.staffId) ?? capped.length;
        lines.push(
          formatCandidate(candidate, slot.station, idToAlias, rank, capped.length),
        );
      }
    }
  }
  lines.push("");

  lines.push(
    "Try again. Your output MUST be valid (no constraint violations) AND score higher than the base schedule. Focus on matching staff to their preferred stations. Output the full schedule as valid JSON.",
  );

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────
// Rejection Reason Type
// ────────────────────────────────────────────────────────────

export type OptimizerRejectionReason =
  | { type: "invalid"; errors: ValidationError[] }
  | { type: "lower_quality"; baseScore: number; aiScore: number; details?: string };
