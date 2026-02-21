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
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { ScheduleValidatorService } from "@/server/services/schedule-validator.service";
import {
  buildOptimizerSystemPrompt,
  buildOptimizerUserPrompt,
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
  ValidationWarning,
} from "@/types/ai-scheduling";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
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

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MAX_OPTIMIZER_ATTEMPTS = 3;

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

// ────────────────────────────────────────────────────────────
// Usage tracking options
// ────────────────────────────────────────────────────────────

interface TrackingOptions {
  orgId: string;
  locationId: string;
  clerkUserId: string;
  action: "schedule_generation";
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

function calculateDayPriority(
  laborRequirements: LaborRequirementDTO[],
  weekDays: Date[],
): number[] {
  const difficulties: { dayIndex: number; score: number }[] = [];

  for (let i = 0; i < weekDays.length; i++) {
    const dayOfWeek = getDayOfWeek(weekDays[i]);
    const dayReqs = laborRequirements.filter((r) => r.dayOfWeek === dayOfWeek);

    let score = 0;
    for (const req of dayReqs) {
      const [startH, startM] = req.startTime.split(":").map(Number);
      const [endH, endM] = req.endTime.split(":").map(Number);
      const durationHours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
      score += req.minStaff * durationHours;
    }

    difficulties.push({ dayIndex: i, score });
  }

  difficulties.sort((a, b) => b.score - a.score);
  return difficulties.map((d) => d.dayIndex);
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
   * Phase 2: AI optimizer tries to improve the base (up to 3 attempts)
   *          - If AI output is valid AND scores higher than base, use it
   *          - If invalid or lower quality, retry with correction prompt
   *          - After all attempts, fall back to the deterministic base
   *
   * @param context - Day scheduling context with pre-filtered candidates
   * @param tracking - Usage tracking options
   * @param allStaff - All active staff DTOs (for validation lookups)
   * @param dayHourBudget - Optional soft hour budget for this day
   * @returns GeneratedDaySchedule with shift assignments, token usage, and warnings
   */
  async generateDaySchedule(
    context: DaySchedulingContext,
    tracking: TrackingOptions,
    allStaff: StaffDTO[] = [],
    dayHourBudget?: number,
  ): Promise<{
    daySchedule: GeneratedDaySchedule;
    tokenUsage: TokenUsage;
    usedFallback: boolean;
    warnings: ValidationWarning[];
  }> {
    const dateStr = context.date.toISOString().split("T")[0];
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
        warnings: [],
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
        warnings: [],
      };
    }

    // ── Phase 1: Deterministic Base Schedule ──────────────────
    const solverStart = Date.now();
    const baseSchedule = DeterministicSolverService.solve(
      context,
      dayHourBudget,
    );
    const solverElapsed = Date.now() - solverStart;

    const baseScore = ScheduleValidatorService.scoreQuality(
      baseSchedule,
      context,
    );

    console.log(
      `${LOG_PREFIX} ${dateStr} Solver: ${baseSchedule.assignments.length} assignments, ` +
        `${baseSchedule.unfilledSlots.length} unfilled, score=${baseScore} (${fmtMs(solverElapsed)})`,
    );

    // ── Phase 2: AI Optimizer (up to 3 attempts) ─────────────
    const { idToAlias, aliasToId } = buildAliasMap(context.slots);
    let accumulatedTokenUsage = emptyTokenUsage();
    let bestSchedule = baseSchedule;
    let aiImproved = false;
    let lastRejectedOutput: GeneratedDaySchedule | undefined;
    let lastRejectionReason: OptimizerRejectionReason | undefined;

    try {
      for (let attempt = 1; attempt <= MAX_OPTIMIZER_ATTEMPTS; attempt++) {
        let aiSchedule: GeneratedDaySchedule;
        let attemptUsage: TokenUsage;

        const aiStart = Date.now();

        if (attempt === 1) {
          const systemPrompt = buildOptimizerSystemPrompt();
          const userPrompt = buildOptimizerUserPrompt(
            context,
            baseSchedule,
            idToAlias,
          );

          const { data: rawOutput, usage } =
            await generateJSON<AIRawDayOutput>(systemPrompt, userPrompt, {
              model: "gpt-4o-mini",
              temperature: 0.3,
              maxTokens: 4000,
              tracking: {
                orgId: tracking.orgId,
                locationId: tracking.locationId,
                clerkUserId: tracking.clerkUserId,
                action: tracking.action,
              },
            });

          aiSchedule = normalizeAIOutput(
            rawOutput,
            context.slots,
            dateStr,
            dayName,
            aliasToId,
          );
          attemptUsage = usage;
        } else {
          const { daySchedule: corrected, tokenUsage: retryUsage } =
            await ScheduleValidatorService.retryOptimization(
              baseSchedule,
              lastRejectedOutput!,
              lastRejectionReason!,
              context,
              tracking,
              attempt - 1,
              idToAlias,
              aliasToId,
            );

          aiSchedule = corrected;
          attemptUsage = retryUsage;
        }

        const aiElapsed = Date.now() - aiStart;
        accumulatedTokenUsage = mergeTokenUsage(
          accumulatedTokenUsage,
          attemptUsage,
        );

        // Validate the AI output
        const validation = ScheduleValidatorService.validate(
          aiSchedule,
          context,
          allStaff,
        );

        if (!validation.valid) {
          console.warn(
            `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
              `INVALID (${validation.errors.length} error(s)) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
          );
          lastRejectedOutput = aiSchedule;
          lastRejectionReason = {
            type: "invalid",
            errors: validation.errors,
          };
          continue;
        }

        // Valid -- check quality score
        const aiScore = ScheduleValidatorService.scoreQuality(
          aiSchedule,
          context,
        );

        if (aiScore > baseScore) {
          console.log(
            `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
              `ACCEPTED (score ${aiScore} > base ${baseScore}) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
          );
          bestSchedule = aiSchedule;
          aiImproved = true;
          break;
        }

        console.warn(
          `${LOG_PREFIX} ${dateStr} Optimizer attempt ${attempt}/${MAX_OPTIMIZER_ATTEMPTS}: ` +
            `LOWER QUALITY (score ${aiScore} <= base ${baseScore}) (${fmtMs(aiElapsed)}) | ${fmtTokens(attemptUsage)}`,
        );
        lastRejectedOutput = aiSchedule;
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
        console.warn(
          `${LOG_PREFIX} ${dateStr} AI unavailable: ${error.message}. Using deterministic base.`,
        );
      } else {
        throw error;
      }
    }

    if (!aiImproved) {
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
      usedFallback: !aiImproved,
      warnings: finalValidation.warnings,
    };
  },

  /**
   * Generate a full week's schedule using day-by-day chunking.
   *
   * Sequential processing is critical:
   * - CandidateService needs prior days' shifts for overlap + clopening
   * - Week hours accumulate across days
   *
   * @param context - Full week scheduling context
   * @returns GeneratedSchedule with all days and metadata
   */
  async generateWeekSchedule(
    context: SchedulingContext,
  ): Promise<GeneratedSchedule> {
    const startTime = Date.now();
    const weekDays = getWeekDays(context.weekStart);

    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} Starting week generation: ${format(context.weekStart, "yyyy-MM-dd")}\n` +
        `  Staff: ${context.staff.length} active | Shift slots: ${context.laborRequirements.length} | Existing shifts: ${context.existingShifts.length}\n` +
        `${"═".repeat(60)}`,
    );

    const tracking: TrackingOptions = {
      orgId: context.orgId,
      locationId: context.locationId,
      clerkUserId: context.clerkUserId,
      action: "schedule_generation",
    };

    let accumulatedShifts: ShiftDTO[] = [...context.existingShifts];
    let totalTokenUsage = emptyTokenUsage();
    let usedFallbackAnyDay = false;
    const allWarnings: ValidationWarning[] = [];

    const dayResults: GeneratedDaySchedule[] = [];
    let runningShiftCount = 0;

    const weekHoursAccumulator = initWeekHoursFromShifts(
      context.existingShifts,
      context.weekStart,
    );

    const generationOrder = calculateDayPriority(
      context.laborRequirements,
      weekDays,
    );

    // ── Cross-day hour budgeting ─────────────────────────────
    // Calculate per-day hour targets to prevent late-week collapse.
    // Budget is proportional to each day's demand relative to total.
    const totalAvailableHours = context.staff.reduce(
      (sum, s) => sum + s.maxHoursPerWeek,
      0,
    );
    const dayHourBudgets = new Map<number, number>();
    let totalNeededHours = 0;
    const dayNeededHoursMap = new Map<number, number>();

    for (let d = 0; d < weekDays.length; d++) {
      const dow = getDayOfWeek(weekDays[d]);
      const dayReqs = context.laborRequirements.filter(
        (r) => r.dayOfWeek === dow,
      );
      let dayHours = 0;
      for (const req of dayReqs) {
        dayHours +=
          getSlotDurationHours(req.startTime, req.endTime) * req.preferredStaff;
      }
      dayNeededHoursMap.set(d, dayHours);
      totalNeededHours += dayHours;
    }

    if (totalNeededHours > 0) {
      for (let d = 0; d < weekDays.length; d++) {
        const dayNeeded = dayNeededHoursMap.get(d) ?? 0;
        const budget =
          totalAvailableHours * (dayNeeded / totalNeededHours);
        dayHourBudgets.set(d, budget);
      }
    }

    console.log(
      `${LOG_PREFIX} Hour budgets: total available=${totalAvailableHours.toFixed(0)}h, ` +
        `total needed=${totalNeededHours.toFixed(0)}h`,
    );

    let step = 0;
    for (const i of generationOrder) {
      step++;
      const dayStart = Date.now();
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
          `${LOG_PREFIX} [${step}/7] ${dayName} ${dateStr} — skipped (${reason}) [${fmtMs(Date.now() - startTime)} elapsed]`,
        );
        dayResults.push({
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

      console.log(
        `${LOG_PREFIX} [${step}/7] ${dayName} ${dateStr} — ${dayRequirements.length} shift slots, hours ${operatingHours.open}-${operatingHours.close}`,
      );

      // Get previous day's closing shifts for clopening hard filter
      let previousDayClosingShifts: ShiftDTO[] = [];
      if (i > 0) {
        const previousDay = weekDays[i - 1];
        previousDayClosingShifts = getClosingShifts(
          accumulatedShifts,
          previousDay,
        );
      }

      // Get candidates -- now with clopening hard filter
      const candidateStart = Date.now();
      const slotCandidates = await CandidateService.getCandidatesForDay(
        context.orgId,
        context.locationId,
        date,
        dayRequirements,
        accumulatedShifts,
        weekHoursAccumulator,
        previousDayClosingShifts,
      );
      const candidateElapsed = Date.now() - candidateStart;

      const totalCandidates = slotCandidates.reduce(
        (sum, s) => sum + s.candidates.length,
        0,
      );
      console.log(
        `${LOG_PREFIX} ${dateStr} Candidates: ${totalCandidates} across ${slotCandidates.length} slot(s) (${fmtMs(candidateElapsed)})`,
      );

      const dayContext: DaySchedulingContext = {
        date,
        dayOfWeek,
        dayName,
        slots: slotCandidates,
        existingShifts: accumulatedShifts,
        previousDayClosingShifts,
        kitchenContext: {
          operatingHours: operatingHours
            ? { open: operatingHours.open, close: operatingHours.close }
            : null,
          totalStaffCount: context.staff.length,
        },
      };

      const dayBudget = dayHourBudgets.get(i);
      const { daySchedule, tokenUsage, usedFallback, warnings } =
        await this.generateDaySchedule(
          dayContext,
          tracking,
          context.staff,
          dayBudget,
        );

      dayResults.push(daySchedule);
      allWarnings.push(...warnings);
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
      console.log(
        `${LOG_PREFIX} ${dateStr} Done: ${daySchedule.assignments.length} shifts, ${daySchedule.unfilledSlots.length} unfilled, ${warnings.length} warnings (${fmtMs(dayElapsed)}) [${fmtMs(Date.now() - startTime)} elapsed, ${runningShiftCount} total shifts]`,
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

    const totalElapsed = Date.now() - startTime;
    const metadata: GenerationMetadata = {
      totalShiftsCreated,
      totalUnfilledSlots,
      usedFallback: usedFallbackAnyDay,
      generationTimeMs: totalElapsed,
      tokenUsage: totalTokenUsage,
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
    if (usedFallbackAnyDay) {
      summaryParts.push(
        "Some days used deterministic base (AI could not improve).",
      );
    }
    if (allWarnings.length > 0) {
      summaryParts.push(`${allWarnings.length} warning(s) noted.`);
    }

    console.log(
      `\n${"═".repeat(60)}\n${LOG_PREFIX} Week generation complete in ${fmtMs(totalElapsed)}\n` +
        `  Shifts: ${totalShiftsCreated} | Unfilled: ${totalUnfilledSlots} | Warnings: ${allWarnings.length}\n` +
        `  Tokens: ${fmtTokens(totalTokenUsage)} | Fallback: ${usedFallbackAnyDay ? "yes" : "no"}\n` +
        `${"═".repeat(60)}\n`,
    );

    return {
      days: dayResults,
      summary: summaryParts.join(" "),
      metadata,
      warnings: allWarnings,
    };
  },
};
