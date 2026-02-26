import { format } from "date-fns";
import { generateJSON } from "@/lib/ai/openai-client";
import {
  AILimitExceededError,
  AIServiceUnavailableError,
} from "@/lib/ai/openai-client";
import {
  getWeekDays,
  getDayOfWeek,
  getStoreHoursForDay,
  combineDateTime,
  getWeekEnd,
  calculateShiftDuration,
} from "@/lib/utils/date";
import { CandidateService } from "@/server/services/candidate.service";
import { DeterministicSolverService } from "@/server/services/deterministic-solver.service";
import { CPSolverService } from "@/server/services/cp-solver.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import {
  ScheduleValidatorService,
  type QualityScoreBreakdown,
} from "@/server/services/schedule-validator.service";
import {
  buildOptimizerSystemPrompt,
  buildOptimizerUserPrompt,
  buildSwapCorrectionPrompt,
} from "./prompts/schedule-generation";
import type { StaffDTO } from "@/types/staff";
import type { ShiftDTO } from "@/types/shift";
import type { TokenUsage } from "@/types/ai-usage";
import type { SlotCandidates } from "@/types/candidate";
import type {
  SchedulingContext,
  DaySchedulingContext,
  GeneratedSchedule,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  UnfilledSlot,
  GenerationMetadata,
  AIRawDayOutput,
  AISwapOutput,
  ValidationError,
  ValidationWarning,
  WeekDayCandidates,
  WeekSolverInput,
  SolverEngine,
} from "@/types/ai-scheduling";
import type { OptimizerRejectionReason } from "./prompts/schedule-generation";

// ============================================================
// SchedulingAgentService -- Hybrid Architecture
// ============================================================
// Two-phase schedule generation:
//   Phase 1: DeterministicSolverService produces a guaranteed-valid
//            base schedule in milliseconds.
//   Phase 2: AI optimizer attempts to improve the base by reassigning
//            staff for better preference/fairness alignment. Gets up
//            to 3 total attempts (1 initial + 2 retries). Falls back
//            to the deterministic base if AI fails or scores lower.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models directly
// - Calls other services (CandidateService, DeterministicSolverService, etc.)
// - Returns DTOs (plain objects)
// - Multi-tenancy via (orgId, locationId) scoping
// ============================================================

/** Closing shift threshold hour -- shifts ending at or after this are "closing shifts" */
const CLOSING_SHIFT_HOUR = 20;

/** Minimum hours between a closing shift end and the next day's opening shift start */
const CLOPENING_THRESHOLD_HOURS = 10;

/** Adjacent-day shift data for cross-day clopening validation */
interface AdjacentDayShifts {
  previousDay: ShiftDTO[];
  nextDay: ShiftDTO[];
}

function timeToMinutesSwap(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check whether assigning a staff member to a slot would create a clopening
 * violation with their shifts on adjacent days.
 */
function wouldSwapCreateClopening(
  staffId: string,
  slotStartTime: string,
  slotEndTime: string,
  adjacentDayShifts: AdjacentDayShifts,
): boolean {
  const startMin = timeToMinutesSwap(slotStartTime);
  const endMin = timeToMinutesSwap(slotEndTime);

  for (const shift of adjacentDayShifts.previousDay) {
    if (shift.staffId !== staffId) continue;
    const prevEnd = new Date(shift.end);
    const prevEndMin = prevEnd.getHours() * 60 + prevEnd.getMinutes();
    const gapMinutes = (24 * 60 - prevEndMin) + startMin;
    if (gapMinutes / 60 < CLOPENING_THRESHOLD_HOURS) return true;
  }

  for (const shift of adjacentDayShifts.nextDay) {
    if (shift.staffId !== staffId) continue;
    const nextStart = new Date(shift.start);
    const nextStartMin = nextStart.getHours() * 60 + nextStart.getMinutes();
    const gapMinutes = (24 * 60 - endMin) + nextStartMin;
    if (gapMinutes / 60 < CLOPENING_THRESHOLD_HOURS) return true;
  }

  return false;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MAX_OPTIMIZER_ATTEMPTS = 2;

// ────────────────────────────────────────────────────────────
// Logging helpers
// ────────────────────────────────────────────────────────────

const LOG_PREFIX = "[SchedulingAgent]";

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

function fmtTokens(t: TokenUsage): string {
  return `${t.totalTokens} tokens ($${(t.estimatedCostCents / 100).toFixed(3)})`;
}

/**
 * Format validation errors for terminal logging: type frequency + per-error details.
 */
function formatErrorBreakdown(errors: ValidationError[]): string {
  const byType = new Map<string, ValidationError[]>();
  for (const e of errors) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }
  const typeFreq = [...byType.entries()]
    .map(([type, list]) => `${list.length}x ${type}`)
    .join(", ");
  const lines: string[] = [`  Errors: ${typeFreq}`];
  for (const e of errors) {
    const shortMsg = e.message
      .replace(/^Staff "[^"]+"\s+/, "")
      .replace(/\.\s*$/, "");
    lines.push(`    [${e.type}] "${e.staffName}" — ${shortMsg}`);
  }
  return lines.join("\n");
}

/**
 * Format a quality score breakdown for terminal logging.
 */
function formatScoreBreakdown(
  label: string,
  b: QualityScoreBreakdown,
): string {
  const prefStn = `${b.preferredStationCount}x(+${b.preferredStationMatches})`;
  const prefTime = `${b.timePreferenceCount}x(+${b.timePreferenceMatches})`;
  const hrsBal = b.hourBalancePenalty.toFixed(1);
  const minHrs = b.minHoursShortfallPenalty.toFixed(1);
  const unfilled = `${b.unfilledCount}(-${b.unfilledPenalty})`;
  return `  ${label.padEnd(4)}: pref_stn: ${prefStn} | pref_time: ${prefTime} | hrs_bal: -${hrsBal} | min_hrs: -${minHrs} | unfilled: ${unfilled} = ${b.total}`;
}

/**
 * Format the delta between two score breakdowns.
 */
function formatScoreDelta(
  base: QualityScoreBreakdown,
  ai: QualityScoreBreakdown,
): string {
  const prefStnDelta = ai.preferredStationCount - base.preferredStationCount;
  const prefTimeDelta = ai.timePreferenceCount - base.timePreferenceCount;
  const hrsBalDelta = (base.hourBalancePenalty - ai.hourBalancePenalty).toFixed(
    1,
  );
  const minHrsDelta = (base.minHoursShortfallPenalty - ai.minHoursShortfallPenalty).toFixed(1);
  const netDelta = (ai.total - base.total).toFixed(1);
  const parts: string[] = [];
  if (prefStnDelta !== 0) parts.push(`pref_stn: ${prefStnDelta > 0 ? "+" : ""}${prefStnDelta}`);
  if (prefTimeDelta !== 0) parts.push(`pref_time: ${prefTimeDelta > 0 ? "+" : ""}${prefTimeDelta}`);
  parts.push(`hrs_bal: ${Number(hrsBalDelta) >= 0 ? "+" : ""}${hrsBalDelta}`);
  if (Number(minHrsDelta) !== 0) parts.push(`min_hrs: ${Number(minHrsDelta) >= 0 ? "+" : ""}${minHrsDelta}`);
  parts.push(`net: ${Number(netDelta) >= 0 ? "+" : ""}${netDelta}`);
  return `  Delta: ${parts.join(" | ")}`;
}

/** Result of applying AI swap suggestions to a base schedule */
interface SwapApplicationResult {
  schedule: GeneratedDaySchedule;
  appliedCount: number;
  skippedSwaps: Array<{ slot: string; reason: string }>;
}

/**
 * Apply AI-suggested swaps to a base schedule one at a time.
 * Each swap is independently validated: invalid swaps are skipped,
 * allowing partial success. This eliminates the double-booking
 * problem since the running assignedStaff set is always consistent.
 */
function applySwaps(
  baseSchedule: GeneratedDaySchedule,
  swaps: AISwapOutput["swaps"],
  slots: SlotCandidates[],
  aliasToId: Map<string, string>,
  adjacentDayShifts?: AdjacentDayShifts,
): SwapApplicationResult {
  if (swaps.length === 0) {
    return { schedule: baseSchedule, appliedCount: 0, skippedSwaps: [] };
  }

  const assignments = baseSchedule.assignments.map((a) => ({ ...a }));

  // Build slot key -> assignment index map
  // Slot format: "Station HH:MM-HH:MM"
  const assignmentBySlot = new Map<string, number>();
  for (let i = 0; i < assignments.length; i++) {
    const key = `${assignments[i].station} ${assignments[i].startTime}-${assignments[i].endTime}`;
    assignmentBySlot.set(key, i);
  }

  // Build per-slot valid candidate sets using the same key format
  const slotValidCandidates = new Map<string, Set<string>>();
  for (const { slot, candidates } of slots) {
    const key = `${slot.station} ${slot.startTime}-${slot.endTime}`;
    const validIds = new Set<string>();
    for (const c of candidates) {
      validIds.add(c.staffId);
    }
    slotValidCandidates.set(key, validIds);
  }

  // Staff name lookup from candidates
  const staffNames = new Map<string, string>();
  for (const { candidates } of slots) {
    for (const c of candidates) {
      staffNames.set(c.staffId, c.staffName);
    }
  }

  const assignedStaff = new Set(assignments.map((a) => a.staffId));

  let appliedCount = 0;
  const skippedSwaps: Array<{ slot: string; reason: string }> = [];

  for (const swap of swaps) {
    const resolvedRemoveId = aliasToId.get(swap.removeStaffId) ?? swap.removeStaffId;
    const resolvedAssignId = aliasToId.get(swap.assignStaffId) ?? swap.assignStaffId;

    const assignIdx = assignmentBySlot.get(swap.slot);
    if (assignIdx === undefined) {
      skippedSwaps.push({ slot: swap.slot, reason: `Slot "${swap.slot}" not found in schedule` });
      continue;
    }

    if (assignments[assignIdx].staffId !== resolvedRemoveId) {
      skippedSwaps.push({
        slot: swap.slot,
        reason: `"${swap.removeStaffId}" is not currently assigned to ${swap.slot} (current: "${assignments[assignIdx].staffName}")`,
      });
      continue;
    }

    const validForSlot = slotValidCandidates.get(swap.slot);
    if (!validForSlot?.has(resolvedAssignId)) {
      skippedSwaps.push({
        slot: swap.slot,
        reason: `"${swap.assignStaffId}" is not a valid candidate for ${swap.slot}`,
      });
      continue;
    }

    if (assignedStaff.has(resolvedAssignId)) {
      skippedSwaps.push({
        slot: swap.slot,
        reason: `"${swap.assignStaffId}" is already assigned to another slot today`,
      });
      continue;
    }

    if (adjacentDayShifts) {
      const slotParts = swap.slot.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (slotParts) {
        const [, slotStart, slotEnd] = slotParts;
        if (wouldSwapCreateClopening(resolvedAssignId, slotStart, slotEnd, adjacentDayShifts)) {
          skippedSwaps.push({
            slot: swap.slot,
            reason: `"${swap.assignStaffId}" would create clopening with adjacent day shift`,
          });
          continue;
        }
      }
    }

    // Apply the swap
    assignedStaff.delete(resolvedRemoveId);
    assignedStaff.add(resolvedAssignId);

    assignments[assignIdx] = {
      ...assignments[assignIdx],
      staffId: resolvedAssignId,
      staffName: staffNames.get(resolvedAssignId) ?? swap.assignStaffId,
      reasoning: swap.reasoning || "AI swap",
    };

    appliedCount++;
  }

  return {
    schedule: {
      ...baseSchedule,
      assignments,
    },
    appliedCount,
    skippedSwaps,
  };
}

/**
 * Greedy swap selection: when applying all swaps together doesn't improve
 * the score, try each swap independently against the base and keep only
 * the ones that individually increase the running score.
 *
 * This is the "deterministic fix-up" — it salvages good individual swaps
 * from a batch that collectively hurts the score.
 */
function greedySwapSelection(
  baseSchedule: GeneratedDaySchedule,
  rawSwaps: AISwapOutput["swaps"],
  slots: SlotCandidates[],
  aliasToId: Map<string, string>,
  context: DaySchedulingContext,
  adjacentDayShifts?: AdjacentDayShifts,
  weekHoursAccumulator?: Map<string, number>,
): SwapApplicationResult {
  let currentSchedule: GeneratedDaySchedule = {
    ...baseSchedule,
    assignments: baseSchedule.assignments.map((a) => ({ ...a })),
  };
  let currentScore = ScheduleValidatorService.scoreQuality(
    currentSchedule,
    context,
    weekHoursAccumulator,
  );
  let totalApplied = 0;
  const allSkipped: Array<{ slot: string; reason: string }> = [];

  for (const swap of rawSwaps) {
    const { schedule: candidate, appliedCount, skippedSwaps } = applySwaps(
      currentSchedule,
      [swap],
      slots,
      aliasToId,
      adjacentDayShifts,
    );

    if (appliedCount === 0) {
      allSkipped.push(...skippedSwaps);
      continue;
    }

    const newScore = ScheduleValidatorService.scoreQuality(candidate, context, weekHoursAccumulator);
    if (newScore > currentScore) {
      currentSchedule = candidate;
      currentScore = newScore;
      totalApplied++;
    } else {
      allSkipped.push({
        slot: swap.slot,
        reason: `Swap would not improve score (${newScore.toFixed(2)} <= ${currentScore.toFixed(2)})`,
      });
    }
  }

  return {
    schedule: currentSchedule,
    appliedCount: totalApplied,
    skippedSwaps: allSkipped,
  };
}

/**
 * Log AI swap results for terminal output.
 */
function logSwapResults(
  dateStr: string,
  swaps: AISwapOutput["swaps"],
  appliedCount: number,
  skippedSwaps: Array<{ slot: string; reason: string }>,
  aliasToId: Map<string, string>,
): void {
  if (swaps.length === 0) {
    console.log(`${LOG_PREFIX} ${dateStr} AI suggested 0 swaps (base is optimal)`);
    return;
  }

  const appliedLines: string[] = [];
  const skippedSet = new Set(skippedSwaps.map((s) => s.slot));

  for (const swap of swaps) {
    if (!skippedSet.has(swap.slot)) {
      appliedLines.push(
        `  ${swap.slot}: "${swap.removeStaffId}" -> "${swap.assignStaffId}" (${swap.reasoning})`,
      );
    }
  }

  if (appliedLines.length > 0) {
    console.log(
      `${LOG_PREFIX} ${dateStr} AI swaps applied (${appliedCount}/${swaps.length}):`,
    );
    for (const line of appliedLines) {
      console.log(line);
    }
  }

  if (skippedSwaps.length > 0) {
    console.log(
      `${LOG_PREFIX} ${dateStr} AI swaps skipped (${skippedSwaps.length}):`,
    );
    for (const s of skippedSwaps) {
      console.log(`  ${s.slot}: ${s.reason}`);
    }
  }
}

// ────────────────────────────────────────────────────────────
// Usage tracking options
// ────────────────────────────────────────────────────────────

interface TrackingOptions {
  orgId: string;
  locationId: string;
  clerkUserId: string;
  action: "schedule_generation";
}

/** Accumulator for weekly optimizer stats (passed by generateWeekSchedule) */
interface OptimizerStatsAccumulator {
  aiImproved: number;
  usedBase: number;
  totalAttempts: number;
  allErrors: ValidationError[];
  scoreDeltas: number[];
}

/** Metadata for a single active day, built during candidate pre-fetching. */
interface DayContextInfo {
  date: Date;
  dayOfWeek: number;
  dayName: string;
  dateStr: string;
  operatingHours: { open: string; close: string } | null;
  slotCandidates: SlotCandidates[];
}

/** Result of Phase 1 (candidate pre-fetching) + Phase 2 (deterministic solve). */
interface PrefetchAndSolveResult {
  weekDays: Date[];
  skippedDayResults: GeneratedDaySchedule[];
  allDayCandidates: WeekDayCandidates[];
  dayContextMap: Map<number, DayContextInfo>;
  weekDaySchedules: GeneratedDaySchedule[];
  weekBaseMap: Map<string, GeneratedDaySchedule>;
  weekHoursAccumulator: Map<string, number>;
  solverElapsed: number;
  totalWeekAssignments: number;
  totalWeekUnfilled: number;
}

// ────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────

function getClosingShifts(shifts: ShiftDTO[], date: Date): ShiftDTO[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return shifts.filter((s) => {
    const shiftDate = format(new Date(s.end), "yyyy-MM-dd");
    if (shiftDate !== dateStr) return false;
    const endHour = new Date(s.end).getHours();
    return endHour >= CLOSING_SHIFT_HOUR;
  });
}

function assignmentToSyntheticShift(
  assignment: GeneratedShiftAssignment,
  date: Date,
  orgId: string,
  locationId: string,
  scheduleId: string,
): ShiftDTO {
  const start = combineDateTime(date, assignment.startTime);
  const end = combineDateTime(date, assignment.endTime);

  return {
    id: `synthetic-${assignment.staffId}-${date.toISOString()}-${assignment.startTime}`,
    orgId,
    locationId,
    scheduleId,
    staffId: assignment.staffId,
    start,
    end,
    station: assignment.station,
    notes: assignment.reasoning,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function initWeekHoursFromShifts(
  shifts: ShiftDTO[],
  weekStart: Date,
): Map<string, number> {
  const weekEnd = getWeekEnd(weekStart);
  const hoursMap = new Map<string, number>();

  for (const shift of shifts) {
    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);

    if (shiftStart >= weekStart && shiftEnd <= weekEnd) {
      const duration = calculateShiftDuration(shiftStart, shiftEnd);
      const current = hoursMap.get(shift.staffId) ?? 0;
      hoursMap.set(shift.staffId, current + duration);
    }
  }

  return hoursMap;
}

function getSlotDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

function emptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
  };
}

function mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostCents:
      Math.round((a.estimatedCostCents + b.estimatedCostCents) * 100) / 100,
  };
}

/**
 * Phase 1 + Phase 2: Pre-fetch candidates for all days, then run the
 * week-level deterministic solver. Shared by both generateBaseWeekSchedule
 * and generateWeekSchedule to avoid code duplication.
 */
async function prefetchAndSolve(
  context: SchedulingContext,
  solverEngine: SolverEngine = "legacy",
): Promise<PrefetchAndSolveResult> {
  const weekDays = getWeekDays(context.weekStart);
  const weekHoursAccumulator = initWeekHoursFromShifts(
    context.existingShifts,
    context.weekStart,
  );

  // ── Phase 1: Pre-fetch candidates for ALL days ──
  const prefetchStart = Date.now();
  const allDayCandidates: WeekDayCandidates[] = [];
  const dayContextMap = new Map<number, DayContextInfo>();
  const skippedDayResults: GeneratedDaySchedule[] = [];

  for (let i = 0; i < weekDays.length; i++) {
    const date = weekDays[i];
    const dayOfWeek = getDayOfWeek(date);
    const dayName = DAY_NAMES[dayOfWeek];
    const dateStr = format(date, "yyyy-MM-dd");

    const operatingHours = getStoreHoursForDay(
      context.config.operatingHours,
      date,
    );

    const dayRequirements = context.laborRequirements.filter(
      (req) => req.dayOfWeek === dayOfWeek,
    );

    if (!operatingHours || dayRequirements.length === 0) {
      const reason = !operatingHours ? "closed" : "no shift slots";
      console.log(
        `${LOG_PREFIX} Pre-fetch [${i + 1}/7] ${dayName} ${dateStr} — skipped (${reason})`,
      );
      skippedDayResults.push({
        date: dateStr,
        dayOfWeek: dayName,
        assignments: [],
        unfilledSlots: [],
        notes: !operatingHours
          ? "Kitchen is closed on this day."
          : "No shift slots defined for this day.",
      });
      continue;
    }

    let previousDayClosingShifts: ShiftDTO[] = [];
    if (i > 0) {
      const previousDay = weekDays[i - 1];
      previousDayClosingShifts = getClosingShifts(
        context.existingShifts,
        previousDay,
      );
    }

    const slotCandidates = await CandidateService.getCandidatesForDay(
      context.orgId,
      context.locationId,
      date,
      dayRequirements,
      context.existingShifts,
      weekHoursAccumulator,
      previousDayClosingShifts,
    );

    const totalCandidates = slotCandidates.reduce(
      (sum, s) => sum + s.candidates.length, 0,
    );
    console.log(
      `${LOG_PREFIX} Pre-fetch [${i + 1}/7] ${dayName} ${dateStr} — ${totalCandidates} candidates across ${slotCandidates.length} slot(s)`,
    );

    allDayCandidates.push({
      dayIndex: i,
      date,
      dateStr,
      dayOfWeek,
      dayName,
      slots: slotCandidates,
    });

    dayContextMap.set(i, {
      date,
      dayOfWeek,
      dayName,
      dateStr,
      operatingHours,
      slotCandidates,
    });
  }

  console.log(
    `${LOG_PREFIX} Pre-fetch complete: ${allDayCandidates.length} active day(s) (${fmtMs(Date.now() - prefetchStart)})`,
  );

  // ── Phase 2: Week-level deterministic solve ──
  const weekSolverInput: WeekSolverInput = {
    days: allDayCandidates,
    maxHoursLookup: new Map(context.staff.map((s) => [s.id, s.maxHoursPerWeek])),
    minHoursLookup: new Map(context.staff.map((s) => [s.id, s.minHoursPerWeek])),
    existingWeekHours: new Map(weekHoursAccumulator),
  };

  const solverStart = Date.now();
  const weekDaySchedules =
    solverEngine === "cp"
      ? await CPSolverService.solveWeek(weekSolverInput)
      : DeterministicSolverService.solveWeek(weekSolverInput);
  const solverElapsed = Date.now() - solverStart;

  const totalWeekAssignments = weekDaySchedules.reduce(
    (sum, d) => sum + d.assignments.length, 0,
  );
  const totalWeekUnfilled = weekDaySchedules.reduce(
    (sum, d) => sum + d.unfilledSlots.length, 0,
  );

  const weekSolveBreakdown = weekDaySchedules
    .map((ds) => `    ${ds.dayOfWeek} ${ds.date}: ${ds.assignments.length} assigned, ${ds.unfilledSlots.length} unfilled`)
    .join("\n");
  console.log(
    `${LOG_PREFIX} Week-level solve: ${totalWeekAssignments} assignments, ${totalWeekUnfilled} unfilled (${fmtMs(solverElapsed)})\n${weekSolveBreakdown}`,
  );

  const weekBaseMap = new Map<string, GeneratedDaySchedule>();
  for (const ds of weekDaySchedules) {
    weekBaseMap.set(ds.date, ds);
  }

  return {
    weekDays,
    skippedDayResults,
    allDayCandidates,
    dayContextMap,
    weekDaySchedules,
    weekBaseMap,
    weekHoursAccumulator,
    solverElapsed,
    totalWeekAssignments,
    totalWeekUnfilled,
  };
}

/**
 * Validate and normalize AI output against the candidate lists.
 * Resolves short alias IDs (e.g., "S1") back to real MongoDB ObjectIds,
 * then strips any assignments with invalid staffIds.
 *
 * Exported for use by ScheduleValidatorService to normalize
 * correction responses through the same pipeline.
 */
export function normalizeAIOutput(
  raw: AIRawDayOutput,
  slots: SlotCandidates[],
  dateStr: string,
  dayName: string,
  aliasToId: Map<string, string> = new Map(),
): GeneratedDaySchedule {
  const allValidStaffIds = new Set<string>();
  const staffNameMap = new Map<string, string>();
  for (const slotCandidate of slots) {
    for (const candidate of slotCandidate.candidates) {
      allValidStaffIds.add(candidate.staffId);
      staffNameMap.set(candidate.staffId, candidate.staffName);
    }
  }

  const validAssignments: GeneratedShiftAssignment[] = [];
  let invalidCount = 0;

  for (const assignment of raw.assignments ?? []) {
    const resolvedId = aliasToId.get(assignment.staffId) ?? assignment.staffId;

    if (allValidStaffIds.has(resolvedId)) {
      validAssignments.push({
        staffId: resolvedId,
        staffName:
          assignment.staffName || staffNameMap.get(resolvedId) || "Unknown",
        station: assignment.station,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        reasoning: assignment.reasoning || "No reasoning provided",
      });
    } else {
      invalidCount++;
      console.warn(
        `${LOG_PREFIX} Stripped invalid staffId "${assignment.staffId}" (resolved: "${resolvedId}") from AI output for ${dateStr}`,
      );
    }
  }

  const unfilledSlots: UnfilledSlot[] = (raw.unfilledSlots ?? []).map((u) => ({
    station: u.station,
    startTime: u.startTime,
    endTime: u.endTime,
    needed: u.needed,
    assigned: u.assigned,
    reason: u.reason || "Insufficient candidates",
  }));

  let notes = raw.notes ?? "";
  if (invalidCount > 0) {
    notes += ` (${invalidCount} invalid assignment(s) removed during post-processing)`;
  }

  return {
    date: dateStr,
    dayOfWeek: dayName,
    assignments: validAssignments,
    unfilledSlots,
    notes,
  };
}

/**
 * Build bidirectional alias maps from candidate slot data.
 * Short sequential aliases (S1, S2, ...) prevent LLM hallucination
 * of 24-char MongoDB ObjectIds and reduce token count.
 */
function buildAliasMap(slots: SlotCandidates[]): {
  idToAlias: Map<string, string>;
  aliasToId: Map<string, string>;
} {
  const idToAlias = new Map<string, string>();
  const aliasToId = new Map<string, string>();
  let counter = 1;

  for (const { candidates } of slots) {
    for (const candidate of candidates) {
      if (!idToAlias.has(candidate.staffId)) {
        const alias = `S${counter}`;
        idToAlias.set(candidate.staffId, alias);
        aliasToId.set(alias, candidate.staffId);
        counter++;
      }
    }
  }

  return { idToAlias, aliasToId };
}

// ============================================================
// SchedulingAgentService -- Public API
// ============================================================

export const SchedulingAgentService = {
  /**
   * Build the full scheduling context for a week.
   * Per ARCHITECTURE.md: calls Service Layer methods only.
   */
  async buildSchedulingContext(
    orgId: string,
    locationId: string,
    clerkUserId: string,
    weekStart: Date,
  ): Promise<SchedulingContext> {
    const [config, allStaff, laborRequirements] = await Promise.all([
      KitchenConfigService.getByLocation(orgId, locationId),
      StaffService.list(orgId, locationId),
      LaborRequirementService.list(orgId, locationId),
    ]);

    if (!config) {
      throw new Error(
        "Kitchen configuration not found. Please set up your kitchen config in Settings before generating a schedule.",
      );
    }

    const schedule = await ScheduleService.getOrCreateForWeek(
      orgId,
      locationId,
      weekStart,
    );

    const existingShifts = await ShiftService.getBySchedule(schedule.id);
    const activeStaff = allStaff.filter((s) => s.isActive);

    return {
      orgId,
      locationId,
      clerkUserId,
      weekStart,
      config,
      staff: activeStaff,
      laborRequirements,
      existingShifts,
      schedule,
    };
  },

  /**
   * Generate a schedule for ONE day using the hybrid approach:
   *
   * Phase 1: DeterministicSolverService produces a guaranteed-valid base
   *          schedule using greedy assignment + hill-climbing local search.
   * Phase 2: AI swap optimizer suggests specific staff swaps to improve
   *          the base. Each swap is independently validated; invalid swaps
   *          are skipped (partial success). If batch swaps lower the score,
   *          greedy swap selection salvages individually improving swaps.
   *          Falls back to the hill-climbed base if AI cannot improve.
   *
   * @param context - Day scheduling context with pre-filtered candidates
   * @param tracking - Usage tracking options
   * @param allStaff - All active staff DTOs (for validation lookups)
   * @param presolvedBase - Optional pre-solved base schedule from solveWeek() (skips Phase 1)
   * @param stats - Optional optimizer stats accumulator
   * @param adjacentDayShifts - Optional adjacent-day shifts for cross-day clopening validation in AI swaps
   * @returns GeneratedDaySchedule with shift assignments, token usage, and warnings
   */
  async generateDaySchedule(
    context: DaySchedulingContext,
    tracking: TrackingOptions,
    allStaff: StaffDTO[] = [],
    presolvedBase?: GeneratedDaySchedule,
    stats?: OptimizerStatsAccumulator,
    adjacentDayShifts?: AdjacentDayShifts,
    weekHoursAccumulator?: Map<string, number>,
  ): Promise<{
    daySchedule: GeneratedDaySchedule;
    tokenUsage: TokenUsage;
    usedFallback: boolean;
    aiImproved: boolean;
    warnings: ValidationWarning[];
    preferredStationMatches: number;
    totalAssignmentsWithPreference: number;
    optimizerOutcome: string;
  }> {
    const dateStr = format(context.date, "yyyy-MM-dd");
    const dayName = context.dayName;

    if (context.slots.length === 0) {
      return {
        daySchedule: {
          date: dateStr,
          dayOfWeek: dayName,
          assignments: [],
          unfilledSlots: [],
          notes: "No shift slots defined for this day.",
        },
        tokenUsage: emptyTokenUsage(),
        usedFallback: false,
        aiImproved: false,
        warnings: [],
        preferredStationMatches: 0,
        totalAssignmentsWithPreference: 0,
        optimizerOutcome: "",
      };
    }

    const totalCandidates = context.slots.reduce(
      (sum, s) => sum + s.candidates.length,
      0,
    );
    if (totalCandidates === 0) {
      const unfilledSlots: UnfilledSlot[] = context.slots.map(({ slot }) => ({
        station: slot.station,
        startTime: slot.startTime,
        endTime: slot.endTime,
        needed: slot.preferredStaff,
        assigned: 0,
        reason: "No valid candidates available for this slot",
      }));

      return {
        daySchedule: {
          date: dateStr,
          dayOfWeek: dayName,
          assignments: [],
          unfilledSlots,
          notes: "No valid candidates available for any slot on this day.",
        },
        tokenUsage: emptyTokenUsage(),
        usedFallback: false,
        aiImproved: false,
        warnings: [],
        preferredStationMatches: 0,
        totalAssignmentsWithPreference: 0,
        optimizerOutcome: "",
      };
    }

    // ── Phase 1: Deterministic Base Schedule ──────────────────
    let baseSchedule: GeneratedDaySchedule;

    if (presolvedBase) {
      baseSchedule = presolvedBase;
    } else {
      const solverStart = Date.now();
      baseSchedule = DeterministicSolverService.solve(context);
      const solverElapsed = Date.now() - solverStart;
      console.log(
        `${LOG_PREFIX} ${dateStr} Solver: ${baseSchedule.assignments.length} assignments, ` +
          `${baseSchedule.unfilledSlots.length} unfilled (${fmtMs(solverElapsed)})`,
      );
    }

    const baseScore = ScheduleValidatorService.scoreQuality(
      baseSchedule,
      context,
      weekHoursAccumulator,
    );
    const baseBreakdownForPrompt = ScheduleValidatorService.scoreQualityDetailed(
      baseSchedule,
      context,
      weekHoursAccumulator,
    );

    // ── Phase 2: AI Swap Optimizer (up to 2 attempts) ───────
    const { idToAlias, aliasToId } = buildAliasMap(context.slots);
    let accumulatedTokenUsage = emptyTokenUsage();
    let bestSchedule = baseSchedule;
    let aiImproved = false;
    let aiUnavailable = false;
    let optimizerOutcome = `USED BASE — AI failed ${MAX_OPTIMIZER_ATTEMPTS}/${MAX_OPTIMIZER_ATTEMPTS}`;
    let lastFailedSwapDescriptions: string[] = [];
    let lastRejectionReason: OptimizerRejectionReason | undefined;

    // Pre-check: count free (unassigned) candidates across all slots
    const assignedStaffIds = new Set(baseSchedule.assignments.map((a) => a.staffId));
    const freeCandidateIds = new Set<string>();
    for (const { candidates } of context.slots) {
      for (const c of candidates) {
        if (!assignedStaffIds.has(c.staffId)) {
          freeCandidateIds.add(c.staffId);
        }
      }
    }

    if (freeCandidateIds.size < 2) {
      optimizerOutcome = `SKIPPED — only ${freeCandidateIds.size} free candidate(s)`;
      if (stats) {
        stats.usedBase++;
        stats.totalAttempts += 0;
      }
      console.log(
        `${LOG_PREFIX} ${dateStr} Skipping AI optimizer — insufficient free candidates (${freeCandidateIds.size})`,
      );
    }

    if (freeCandidateIds.size >= 2) try {
      for (let attempt = 1; attempt <= MAX_OPTIMIZER_ATTEMPTS; attempt++) {
        const aiStart = Date.now();

        const systemPrompt = buildOptimizerSystemPrompt();
        let userPrompt: string;

        if (attempt === 1) {
          userPrompt = buildOptimizerUserPrompt(
            context,
            baseSchedule,
            idToAlias,
            baseBreakdownForPrompt,
          );
        } else {
          userPrompt = buildSwapCorrectionPrompt(
            baseSchedule,
            lastFailedSwapDescriptions,
            lastRejectionReason!,
            context,
            idToAlias,
          );
        }

        const { data: swapOutput, usage: attemptUsage } =
          await generateJSON<AISwapOutput>(systemPrompt, userPrompt, {
            model: "gpt-4o",
            temperature: attempt === 1 ? 0.3 : 0.2,
            maxTokens: 2000,
            tracking: {
              orgId: tracking.orgId,
              locationId: tracking.locationId,
              clerkUserId: tracking.clerkUserId,
              action: tracking.action,
            },
          });

        const aiElapsed = Date.now() - aiStart;
        accumulatedTokenUsage = mergeTokenUsage(
          accumulatedTokenUsage,
          attemptUsage,
        );

        const receivedSwaps = swapOutput.swaps ?? [];

        // No swaps suggested — base is already optimal per AI
        if (receivedSwaps.length === 0) {
          console.log(
            `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
              `NO SWAPS suggested (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
          );
          optimizerOutcome = "USED BASE — AI found no improvements";
          break;
        }

        // Apply swaps sequentially with validation (includes cross-day clopening check)
        const { schedule: swappedSchedule, appliedCount, skippedSwaps } =
          applySwaps(baseSchedule, receivedSwaps, context.slots, aliasToId, adjacentDayShifts);

        logSwapResults(dateStr, receivedSwaps, appliedCount, skippedSwaps, aliasToId);

        if (appliedCount === 0) {
          // All swaps were invalid -- track with accurate error type
          const swapBySlot = new Map(receivedSwaps.map((sw) => [sw.slot, sw]));
          const syntheticErrors: ValidationError[] = skippedSwaps.map((s, idx) => {
            const originalSwap = swapBySlot.get(s.slot);
            const resolvedId = originalSwap
              ? (aliasToId.get(originalSwap.assignStaffId) ?? originalSwap.assignStaffId)
              : "";
            return {
              type: "invalid_swap" as const,
              staffId: resolvedId,
              staffName: originalSwap?.assignStaffId ?? "",
              shiftIndex: idx,
              message: `Swap for ${s.slot}: ${s.reason}`,
              correctionHint: s.reason,
            };
          });
          if (stats) stats.allErrors.push(...syntheticErrors);

          console.warn(
            `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
              `ALL SWAPS INVALID (${skippedSwaps.length} skipped) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
          );
          lastFailedSwapDescriptions = skippedSwaps.map(
            (s) => `Swap for ${s.slot}: ${s.reason}`,
          );
          lastRejectionReason = {
            type: "invalid",
            errors: syntheticErrors,
          };
          continue;
        }

        // Some swaps applied — score the result
        const aiScore = ScheduleValidatorService.scoreQuality(
          swappedSchedule,
          context,
          weekHoursAccumulator,
        );

        if (aiScore > baseScore) {
          const scoreDelta = aiScore - baseScore;
          optimizerOutcome = `AI IMPROVED +${scoreDelta.toFixed(1)} on attempt ${attempt} (${appliedCount}/${receivedSwaps.length} swaps)`;
          if (stats) {
            stats.aiImproved++;
            stats.totalAttempts += attempt;
            stats.scoreDeltas.push(scoreDelta);
          }
          console.log(
            `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
              `ACCEPTED (score ${aiScore} > base ${baseScore}, ${appliedCount} swaps) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
          );
          bestSchedule = swappedSchedule;
          aiImproved = true;
          break;
        }

        // Applied swaps but score didn't improve — try greedy fix-up
        console.warn(
          `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
            `batch score ${aiScore} <= base ${baseScore} — trying greedy swap selection...`,
        );

        const greedy = greedySwapSelection(
          baseSchedule,
          receivedSwaps,
          context.slots,
          aliasToId,
          context,
          adjacentDayShifts,
          weekHoursAccumulator,
        );

        if (greedy.appliedCount > 0) {
          const greedyScore = ScheduleValidatorService.scoreQuality(
            greedy.schedule,
            context,
            weekHoursAccumulator,
          );

          if (greedyScore > baseScore) {
            const scoreDelta = greedyScore - baseScore;
            optimizerOutcome = `AI IMPROVED +${scoreDelta.toFixed(1)} on attempt ${attempt} (greedy: ${greedy.appliedCount}/${receivedSwaps.length} swaps)`;
            if (stats) {
              stats.aiImproved++;
              stats.totalAttempts += attempt;
              stats.scoreDeltas.push(scoreDelta);
            }
            console.log(
              `${LOG_PREFIX} ${dateStr} Greedy fix-up: ACCEPTED (score ${greedyScore} > base ${baseScore}, ${greedy.appliedCount} swaps kept) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
            );
            bestSchedule = greedy.schedule;
            aiImproved = true;
            break;
          }
        }

        // Greedy didn't help either — log comparison and retry
        const baseBreakdown = ScheduleValidatorService.scoreQualityDetailed(
          baseSchedule,
          context,
        );
        const aiBreakdown = ScheduleValidatorService.scoreQualityDetailed(
          swappedSchedule,
          context,
        );
        console.warn(
          `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
            `LOWER QUALITY (score ${aiScore} <= base ${baseScore}, greedy also failed) (${fmtMs(aiElapsed)})`,
        );
        console.warn(
          formatScoreBreakdown("Base", baseBreakdown) +
            "\n" +
            formatScoreBreakdown("AI", aiBreakdown) +
            "\n" +
            formatScoreDelta(baseBreakdown, aiBreakdown),
        );
        lastFailedSwapDescriptions = [
          `Applied ${appliedCount} swaps but score decreased from ${baseScore} to ${aiScore}. Greedy selection also couldn't improve the base.`,
        ];
        if (skippedSwaps.length > 0) {
          lastFailedSwapDescriptions.push(
            ...skippedSwaps.map((s) => `Swap for ${s.slot}: ${s.reason}`),
          );
        }
        lastRejectionReason = {
          type: "lower_quality",
          baseScore,
          aiScore,
          details: "Focus on assigning staff to their preferred stations.",
        };
      }
    } catch (error) {
      if (
        error instanceof AILimitExceededError ||
        error instanceof AIServiceUnavailableError
      ) {
        aiUnavailable = true;
        optimizerOutcome = "USED BASE — AI unavailable";
        if (stats) {
          stats.usedBase++;
          stats.totalAttempts += 1;
        }
        console.warn(
          `${LOG_PREFIX} ${dateStr} AI unavailable: ${error.message}. Using deterministic base.`,
        );
      } else {
        throw error;
      }
    }

    if (!aiImproved && freeCandidateIds.size >= 2) {
      if (stats) {
        stats.usedBase++;
        stats.totalAttempts += MAX_OPTIMIZER_ATTEMPTS;
      }
      console.log(
        `${LOG_PREFIX} ${dateStr} Using deterministic base (score=${baseScore})`,
      );
    }

    // Final validation for warnings
    const finalValidation = ScheduleValidatorService.validate(
      bestSchedule,
      context,
      allStaff,
    );

    return {
      daySchedule: bestSchedule,
      tokenUsage: accumulatedTokenUsage,
      usedFallback: aiUnavailable,
      aiImproved,
      warnings: finalValidation.warnings,
      preferredStationMatches: finalValidation.preferredStationMatches,
      totalAssignmentsWithPreference: finalValidation.totalAssignmentsWithPreference,
      optimizerOutcome,
    };
  },

  /**
   * Generate a base week schedule using the selected solver engine.
   * Runs Phase 1 (candidate pre-fetching) + Phase 2 (solver) without
   * any AI optimizer calls. Produces a guaranteed-valid schedule that
   * can be previewed immediately, then optionally optimized with AI
   * via generateWeekSchedule().
   *
   * @param context - Full week scheduling context
   * @param solverEngine - Which solver to use ("legacy" or "cp")
   * @returns GeneratedSchedule with aiOptimized = false
   */
  async generateBaseWeekSchedule(
    context: SchedulingContext,
    solverEngine: SolverEngine = "legacy",
  ): Promise<GeneratedSchedule> {
    const startTime = Date.now();

    const engineLabel = solverEngine === "cp" ? "CP (OR-Tools CP-SAT)" : "Legacy (Greedy + Hill-Climbing)";
    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} Starting BASE week generation: ${format(context.weekStart, "yyyy-MM-dd")}\n` +
        `  Engine: ${engineLabel}\n` +
        `  Staff: ${context.staff.length} active | Shift slots: ${context.laborRequirements.length} | Existing shifts: ${context.existingShifts.length}\n` +
        `${"═".repeat(60)}`,
    );

    const base = await prefetchAndSolve(context, solverEngine);

    // Combine skipped days + solver results
    const dayResults: GeneratedDaySchedule[] = [
      ...base.skippedDayResults,
      ...base.weekDaySchedules,
    ];
    dayResults.sort((a, b) => a.date.localeCompare(b.date));

    // Build DaySchedulingContexts for scoring & validation
    const dayContexts: DaySchedulingContext[] = [];
    const allWarnings: ValidationWarning[] = [];
    let totalPreferredStationMatches = 0;
    let totalAssignmentsWithPreference = 0;

    for (const dayCandidate of base.allDayCandidates) {
      const dayInfo = base.dayContextMap.get(dayCandidate.dayIndex)!;
      const daySchedule = base.weekBaseMap.get(dayCandidate.dateStr);
      if (!daySchedule) continue;

      const dayContext: DaySchedulingContext = {
        date: dayCandidate.date,
        dayOfWeek: dayCandidate.dayOfWeek,
        dayName: dayCandidate.dayName,
        slots: dayInfo.slotCandidates,
        existingShifts: context.existingShifts,
        previousDayClosingShifts: [],
        kitchenContext: {
          operatingHours: dayInfo.operatingHours
            ? { open: dayInfo.operatingHours.open, close: dayInfo.operatingHours.close }
            : null,
          totalStaffCount: context.staff.length,
        },
      };
      dayContexts.push(dayContext);

      // Validate for warnings
      const validation = ScheduleValidatorService.validate(
        daySchedule,
        dayContext,
        context.staff,
      );
      allWarnings.push(...validation.warnings);
      totalPreferredStationMatches += validation.preferredStationMatches;
      totalAssignmentsWithPreference += validation.totalAssignmentsWithPreference;

      // Update hours accumulator with solver assignments
      for (const assignment of daySchedule.assignments) {
        const duration = getSlotDurationHours(
          assignment.startTime,
          assignment.endTime,
        );
        const current = base.weekHoursAccumulator.get(assignment.staffId) ?? 0;
        base.weekHoursAccumulator.set(assignment.staffId, current + duration);
      }
    }

    const totalShiftsCreated = dayResults.reduce(
      (sum, d) => sum + d.assignments.length, 0,
    );
    const totalUnfilledSlots = dayResults.reduce(
      (sum, d) => sum + d.unfilledSlots.length, 0,
    );

    const weekScore = ScheduleValidatorService.scoreWeek(
      dayResults,
      dayContexts,
      base.weekHoursAccumulator,
    );

    const underScheduledWarnings = ScheduleValidatorService.checkUnderScheduled(
      base.weekHoursAccumulator,
      context.staff,
    );
    allWarnings.push(...underScheduledWarnings);

    const totalElapsed = Date.now() - startTime;
    const metadata: GenerationMetadata = {
      totalShiftsCreated,
      totalUnfilledSlots,
      usedFallback: false,
      aiImprovedDays: 0,
      totalOptimizerDays: 0,
      generationTimeMs: totalElapsed,
      tokenUsage: emptyTokenUsage(),
      weekScore,
      preferredStationMatches: totalPreferredStationMatches,
      totalAssignmentsWithPreference,
      aiOptimized: false,
    };

    const summaryParts: string[] = [];
    summaryParts.push(
      `Generated ${totalShiftsCreated} shift(s) across ${dayResults.filter((d) => d.assignments.length > 0).length} day(s) using deterministic scheduling.`,
    );
    if (totalUnfilledSlots > 0) {
      summaryParts.push(
        `${totalUnfilledSlots} slot(s) could not be fully staffed.`,
      );
    }
    if (allWarnings.length > 0) {
      summaryParts.push(`${allWarnings.length} warning(s) noted.`);
    }

    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} BASE week generation complete in ${fmtMs(totalElapsed)}\n` +
        `  Engine: ${engineLabel}\n` +
        `  Shifts: ${totalShiftsCreated} | Unfilled: ${totalUnfilledSlots} | Week Score: ${weekScore} | Warnings: ${allWarnings.length}\n` +
        `  Solver: ${base.totalWeekAssignments} assignments (${fmtMs(base.solverElapsed)})\n` +
        `${"═".repeat(60)}\n`,
    );

    return {
      days: dayResults,
      summary: summaryParts.join(" "),
      metadata,
      warnings: allWarnings,
    };
  },

  /**
   * Generate a full week's schedule using week-level deterministic solving
   * followed by per-day AI optimization.
   *
   * Three-phase approach:
   * 1. Pre-fetch candidates for ALL 7 days (using only existing DB shifts)
   * 2. Week-level deterministic solve (global tightness sort + hill climbing)
   * 3. Per-day AI optimizer attempts on top of the week-level base
   *
   * The week-level solve prevents late-week candidate starvation by
   * considering all slots across all days simultaneously.
   *
   * @param context - Full week scheduling context
   * @returns GeneratedSchedule with aiOptimized = true and metadata
   */
  async generateWeekSchedule(
    context: SchedulingContext,
  ): Promise<GeneratedSchedule> {
    const startTime = Date.now();

    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} Starting AI-optimized week generation: ${format(context.weekStart, "yyyy-MM-dd")}\n` +
        `  Staff: ${context.staff.length} active | Shift slots: ${context.laborRequirements.length} | Existing shifts: ${context.existingShifts.length}\n` +
        `${"═".repeat(60)}`,
    );

    const tracking: TrackingOptions = {
      orgId: context.orgId,
      locationId: context.locationId,
      clerkUserId: context.clerkUserId,
      action: "schedule_generation",
    };

    const base = await prefetchAndSolve(context);
    const { weekDays, allDayCandidates, dayContextMap, weekBaseMap, weekHoursAccumulator } = base;

    let accumulatedShifts: ShiftDTO[] = [...context.existingShifts];
    let totalTokenUsage = emptyTokenUsage();
    let usedFallbackAnyDay = false;
    const allWarnings: ValidationWarning[] = [];
    let totalPreferredStationMatches = 0;
    let totalAssignmentsWithPreference = 0;
    const optimizerStats: OptimizerStatsAccumulator = {
      aiImproved: 0,
      usedBase: 0,
      totalAttempts: 0,
      allErrors: [],
      scoreDeltas: [],
    };

    const dayResults: GeneratedDaySchedule[] = [...base.skippedDayResults];
    const dayContexts: DaySchedulingContext[] = [];
    let runningShiftCount = 0;

    // ══════════════════════════════════════════════════════════
    // Phase 3: Per-day AI optimizer on top of week-level base
    // ══════════════════════════════════════════════════════════
    let step = 0;
    for (const dayCandidate of allDayCandidates) {
      step++;
      const dayStart = Date.now();
      const { date, dayOfWeek, dayName, dateStr } = dayCandidate;
      const dayInfo = dayContextMap.get(dayCandidate.dayIndex)!;

      const weekBase = weekBaseMap.get(dateStr);
      if (!weekBase) continue;

      console.log(
        `${LOG_PREFIX} [${step}/${allDayCandidates.length}] ${dayName} ${dateStr} — base: ${weekBase.assignments.length} assignments, ${weekBase.unfilledSlots.length} unfilled`,
      );

      // Get closing shifts from accumulated (includes generated shifts from prior days)
      let previousDayClosingShifts: ShiftDTO[] = [];
      if (dayCandidate.dayIndex > 0) {
        const previousDay = weekDays[dayCandidate.dayIndex - 1];
        previousDayClosingShifts = getClosingShifts(
          accumulatedShifts,
          previousDay,
        );
      }

      // Build adjacent-day shifts for cross-day clopening validation in AI swaps.
      // Previous day: finalized shifts from accumulatedShifts.
      // Next day: week-level base assignments (AI hasn't optimized the next day yet).
      const prevDayDate = dayCandidate.dayIndex > 0 ? weekDays[dayCandidate.dayIndex - 1] : null;
      const nextDayDate = dayCandidate.dayIndex < weekDays.length - 1 ? weekDays[dayCandidate.dayIndex + 1] : null;
      const prevDayStr = prevDayDate ? format(prevDayDate, "yyyy-MM-dd") : null;
      const nextDayStr = nextDayDate ? format(nextDayDate, "yyyy-MM-dd") : null;

      const adjacentShifts: AdjacentDayShifts = {
        previousDay: prevDayStr
          ? accumulatedShifts.filter((s) => format(new Date(s.start), "yyyy-MM-dd") === prevDayStr)
          : [],
        nextDay: nextDayStr
          ? (weekBaseMap.get(nextDayStr)?.assignments ?? []).map((a) =>
              assignmentToSyntheticShift(a, nextDayDate!, context.orgId, context.locationId, context.schedule.id),
            )
          : [],
      };

      const dayContext: DaySchedulingContext = {
        date,
        dayOfWeek,
        dayName,
        slots: dayInfo.slotCandidates,
        existingShifts: accumulatedShifts,
        previousDayClosingShifts,
        kitchenContext: {
          operatingHours: dayInfo.operatingHours
            ? { open: dayInfo.operatingHours.open, close: dayInfo.operatingHours.close }
            : null,
          totalStaffCount: context.staff.length,
        },
      };

      const { daySchedule, tokenUsage, usedFallback, warnings, preferredStationMatches, totalAssignmentsWithPreference: dayAssignmentsWithPref, optimizerOutcome } =
        await this.generateDaySchedule(
          dayContext,
          tracking,
          context.staff,
          weekBase,
          optimizerStats,
          adjacentShifts,
          weekHoursAccumulator,
        );

      dayResults.push(daySchedule);
      dayContexts.push(dayContext);
      allWarnings.push(...warnings);
      totalPreferredStationMatches += preferredStationMatches;
      totalAssignmentsWithPreference += dayAssignmentsWithPref;
      totalTokenUsage = mergeTokenUsage(totalTokenUsage, tokenUsage);
      if (usedFallback) usedFallbackAnyDay = true;
      runningShiftCount += daySchedule.assignments.length;

      const syntheticShifts = daySchedule.assignments.map((assignment) =>
        assignmentToSyntheticShift(
          assignment,
          date,
          context.orgId,
          context.locationId,
          context.schedule.id,
        ),
      );
      accumulatedShifts = [...accumulatedShifts, ...syntheticShifts];

      for (const assignment of daySchedule.assignments) {
        const duration = getSlotDurationHours(
          assignment.startTime,
          assignment.endTime,
        );
        const current = weekHoursAccumulator.get(assignment.staffId) ?? 0;
        weekHoursAccumulator.set(assignment.staffId, current + duration);
      }

      const dayElapsed = Date.now() - dayStart;
      const finalScore = ScheduleValidatorService.scoreQuality(
        daySchedule,
        dayContext,
        weekHoursAccumulator,
      );
      console.log(
        `${LOG_PREFIX} ${dateStr} Done: ${daySchedule.assignments.length} shifts, ${daySchedule.unfilledSlots.length} unfilled, score=${finalScore} (${optimizerOutcome}) (${fmtMs(dayElapsed)}) [${fmtMs(Date.now() - startTime)} elapsed, ${runningShiftCount} total shifts]`,
      );
    }

    // ══════════════════════════════════════════════════════════
    // Phase 4: Post-AI greedy pass for remaining unfilled slots
    // ══════════════════════════════════════════════════════════
    // After AI optimization, some candidates may have been freed up by swaps.
    // Do a final lightweight pass to fill any remaining unfilled slots.
    let phase4Fills = 0;

    for (let dayIdx = 0; dayIdx < dayResults.length; dayIdx++) {
      const dayResult = dayResults[dayIdx];
      if (dayResult.unfilledSlots.length === 0) continue;

      const dayCandidate = allDayCandidates.find((dc) => dc.dateStr === dayResult.date);
      if (!dayCandidate) continue;

      const dayAssignedIds = new Set(dayResult.assignments.map((a) => a.staffId));
      const prevDate = dayIdx > 0 ? weekDays[dayIdx] : null;
      const nextDate = dayIdx < weekDays.length - 1 ? weekDays[dayIdx + 1] : null;
      const prevDateStr = prevDate ? format(prevDate, "yyyy-MM-dd") : null;
      const nextDateStr = nextDate ? format(nextDate, "yyyy-MM-dd") : null;
      const prevDayShifts = prevDateStr
        ? accumulatedShifts.filter((s) => format(new Date(s.start), "yyyy-MM-dd") === prevDateStr)
        : [];
      const nextDayShifts = nextDateStr
        ? (dayResults.find((d) => d.date === nextDateStr)?.assignments ?? []).map((a) =>
            assignmentToSyntheticShift(a, weekDays[dayIdx + 1], context.orgId, context.locationId, context.schedule.id),
          )
        : [];
      const adjShifts: AdjacentDayShifts = { previousDay: prevDayShifts, nextDay: nextDayShifts };

      for (let u = dayResult.unfilledSlots.length - 1; u >= 0; u--) {
        const unfilled = dayResult.unfilledSlots[u];

        const matchingSlot = dayCandidate.slots.find(
          (sc) => sc.slot.station === unfilled.station &&
            sc.slot.startTime === unfilled.startTime &&
            sc.slot.endTime === unfilled.endTime,
        );
        if (!matchingSlot) continue;

        const slotDur = getSlotDurationHours(unfilled.startTime, unfilled.endTime);

        for (const candidate of matchingSlot.candidates) {
          if (dayAssignedIds.has(candidate.staffId)) continue;

          const currentHours = weekHoursAccumulator.get(candidate.staffId) ?? 0;
          if (currentHours + slotDur > candidate.maxHoursPerWeek) continue;

          if (wouldSwapCreateClopening(candidate.staffId, unfilled.startTime, unfilled.endTime, adjShifts)) continue;

          dayResult.assignments.push({
            staffId: candidate.staffId,
            staffName: candidate.staffName,
            station: unfilled.station,
            startTime: unfilled.startTime,
            endTime: unfilled.endTime,
            reasoning: `Post-AI fill: ${candidate.staffName} available for ${unfilled.station}`,
          });
          dayAssignedIds.add(candidate.staffId);
          weekHoursAccumulator.set(candidate.staffId, currentHours + slotDur);

          unfilled.assigned++;
          if (unfilled.assigned >= unfilled.needed) {
            dayResult.unfilledSlots.splice(u, 1);
            phase4Fills++;
          }
          runningShiftCount++;

          const syntheticShift = assignmentToSyntheticShift(
            dayResult.assignments[dayResult.assignments.length - 1],
            weekDays[dayIdx],
            context.orgId,
            context.locationId,
            context.schedule.id,
          );
          accumulatedShifts = [...accumulatedShifts, syntheticShift];
          break;
        }
      }
    }

    if (phase4Fills > 0) {
      console.log(
        `${LOG_PREFIX} Phase 4 post-AI pass: filled ${phase4Fills} previously unfilled slot(s)`,
      );
    }

    dayResults.sort((a, b) => a.date.localeCompare(b.date));

    const totalShiftsCreated = dayResults.reduce(
      (sum, d) => sum + d.assignments.length,
      0,
    );
    const totalUnfilledSlots = dayResults.reduce(
      (sum, d) => sum + d.unfilledSlots.length,
      0,
    );

    const weekScore = ScheduleValidatorService.scoreWeek(
      dayResults,
      dayContexts,
      weekHoursAccumulator,
    );

    const totalElapsed = Date.now() - startTime;
    const optimizerDaysRun = optimizerStats.aiImproved + optimizerStats.usedBase;
    const metadata: GenerationMetadata = {
      totalShiftsCreated,
      totalUnfilledSlots,
      usedFallback: usedFallbackAnyDay,
      aiImprovedDays: optimizerStats.aiImproved,
      totalOptimizerDays: optimizerDaysRun,
      generationTimeMs: totalElapsed,
      tokenUsage: totalTokenUsage,
      weekScore,
      preferredStationMatches: totalPreferredStationMatches,
      totalAssignmentsWithPreference,
      aiOptimized: true,
    };

    const summaryParts: string[] = [];
    summaryParts.push(
      `Generated ${totalShiftsCreated} shift(s) across ${dayResults.filter((d) => d.assignments.length > 0).length} day(s).`,
    );
    if (totalUnfilledSlots > 0) {
      summaryParts.push(
        `${totalUnfilledSlots} slot(s) could not be fully staffed.`,
      );
    }
    if (optimizerStats.aiImproved > 0) {
      summaryParts.push(
        `AI optimizer improved ${optimizerStats.aiImproved}/${optimizerDaysRun} day(s).`,
      );
    }
    if (usedFallbackAnyDay) {
      summaryParts.push(
        "AI was unavailable for some days — used deterministic schedule.",
      );
    }
    if (allWarnings.length > 0) {
      summaryParts.push(`${allWarnings.length} warning(s) noted.`);
    }
    const avgScoreDelta =
      optimizerStats.scoreDeltas.length > 0
        ? (
            optimizerStats.scoreDeltas.reduce((a, b) => a + b, 0) /
            optimizerStats.scoreDeltas.length
          ).toFixed(1)
        : "0";

    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} Week generation complete in ${fmtMs(totalElapsed)}\n` +
        `  Shifts: ${totalShiftsCreated} | Unfilled: ${totalUnfilledSlots} | Week Score: ${weekScore} | Warnings: ${allWarnings.length}\n` +
        `  Week-level solve: ${base.totalWeekAssignments} assignments, ${base.totalWeekUnfilled} unfilled (${fmtMs(base.solverElapsed)})\n` +
        `  Tokens: ${fmtTokens(totalTokenUsage)} | AI unavailable: ${usedFallbackAnyDay ? "yes" : "no"}\n` +
        `\n  AI Optimizer outcomes:\n` +
        `    AI improved:  ${optimizerStats.aiImproved}/${optimizerDaysRun} days (avg +${avgScoreDelta} score)\n` +
        `    Used base:    ${optimizerStats.usedBase}/${optimizerDaysRun} days\n` +
        `    Total attempts: ${optimizerStats.totalAttempts} (${optimizerDaysRun} initial + ${optimizerStats.totalAttempts - optimizerDaysRun} retries)`,
    );

    if (optimizerStats.allErrors.length > 0) {
      const byType = new Map<string, number>();
      for (const e of optimizerStats.allErrors) {
        byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      }
      const typeLines = [...byType.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
          ([type, count]) =>
            `    ${type}: ${count} (${Math.round((count / optimizerStats.allErrors.length) * 100)}%)`,
        )
        .join("\n");

      const byStaff = new Map<string, Map<string, number>>();
      for (const e of optimizerStats.allErrors) {
        if (!byStaff.has(e.staffName)) {
          byStaff.set(e.staffName, new Map());
        }
        const staffTypes = byStaff.get(e.staffName)!;
        staffTypes.set(e.type, (staffTypes.get(e.type) ?? 0) + 1);
      }
      const staffLines = [...byStaff.entries()]
        .filter(([, types]) => [...types.values()].reduce((a, b) => a + b, 0) >= 2)
        .sort(
          (a, b) =>
            [...b[1].values()].reduce((x, y) => x + y, 0) -
            [...a[1].values()].reduce((x, y) => x + y, 0),
        )
        .slice(0, 5)
        .map(([name, types]) => {
          const parts = [...types.entries()].map(
            ([t, c]) => `${c}x ${t}`,
          );
          return `    "${name}": ${[...types.values()].reduce((a, b) => a + b, 0)} errors (${parts.join(", ")})`;
        })
        .join("\n");

      console.log(
        `\n  Validation failures across all attempts (${optimizerStats.allErrors.length} total):\n` +
          typeLines,
      );
      if (staffLines) {
        console.log(`\n  Recurring staff in errors:\n` + staffLines);
      }
    }

    console.log(`${"═".repeat(60)}\n`);

    // Week-level under-scheduled check (runs once with final hours)
    const underScheduledWarnings = ScheduleValidatorService.checkUnderScheduled(
      weekHoursAccumulator,
      context.staff,
    );
    allWarnings.push(...underScheduledWarnings);

    return {
      days: dayResults,
      summary: summaryParts.join(" "),
      metadata,
      warnings: allWarnings,
    };
  },
};
