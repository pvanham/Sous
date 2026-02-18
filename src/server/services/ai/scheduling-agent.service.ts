import { format } from "date-fns";
import { generateJSON } from "@/lib/ai/openai-client";
import {
  AILimitExceededError,
  AIServiceUnavailableError,
} from "@/lib/ai/openai-client";
import {
  getWeekDays,
  getDayOfWeek,
  getDayKey,
  getStoreHoursForDay,
  combineDateTime,
} from "@/lib/utils/date";
import { CandidateService } from "@/server/services/candidate.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { StaffService } from "@/server/services/staff.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { ScheduleService } from "@/server/services/schedule.service";
import { ShiftService } from "@/server/services/shift.service";
import { ScheduleValidatorService } from "@/server/services/schedule-validator.service";
import {
  buildSystemPrompt,
  buildDayUserPrompt,
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

// ============================================================
// SchedulingAgentService -- Sprint 3.7: AI Selector Layer
//                        + Sprint 3.8: Validator Layer Integration
// ============================================================
// The "Soft Selector" that receives ONLY pre-filtered candidates
// from CandidateService (Sprint 3.5) and uses GPT-4o to pick
// the best candidate for each slot.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models directly
// - Calls other services (CandidateService, KitchenConfigService, etc.)
// - Returns DTOs (plain objects)
// - Multi-tenancy via (orgId, locationId) scoping
// ============================================================

/** Closing shift threshold hour -- shifts ending at or after this are "closing shifts" */
const CLOSING_SHIFT_HOUR = 20; // 8:00 PM

/** Day name mapping from dayOfWeek index */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// ────────────────────────────────────────────────────────────
// Logging helpers (compact, timer-aware)
// ────────────────────────────────────────────────────────────

const LOG_PREFIX = "[SchedulingAgent]";

/** Format elapsed milliseconds as a human-readable string. */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

/** Format token count compactly. */
function fmtTokens(t: TokenUsage): string {
  return `${t.totalTokens} tokens ($${(t.estimatedCostCents / 100).toFixed(3)})`;
}

// ────────────────────────────────────────────────────────────
// Usage tracking options (passed to generateJSON)
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

/**
 * Get closing shifts from a given day's shift list.
 * A "closing shift" is any shift that ends at or after CLOSING_SHIFT_HOUR.
 */
function getClosingShifts(shifts: ShiftDTO[], date: Date): ShiftDTO[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return shifts.filter((s) => {
    const shiftDate = format(new Date(s.end), "yyyy-MM-dd");
    if (shiftDate !== dateStr) return false;
    const endHour = new Date(s.end).getHours();
    return endHour >= CLOSING_SHIFT_HOUR;
  });
}

/**
 * Rank week days by scheduling difficulty (descending).
 * Difficulty = sum of (minStaff * shiftDuration) across all labor
 * requirements for that day. Generating the hardest days first gives
 * them priority access to the limited staff-hour pool.
 *
 * @returns Array of indices into `weekDays` sorted hardest-first.
 */
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

/**
 * Convert a GeneratedShiftAssignment into a synthetic ShiftDTO.
 * Used to accumulate AI-generated shifts across days so that
 * CandidateService can see them when filtering subsequent days.
 *
 * These are "virtual" shifts -- they have placeholder IDs and are
 * not yet persisted to the database.
 */
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
    notes: `AI-generated: ${assignment.reasoning}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create an empty TokenUsage object.
 */
function emptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
  };
}

/**
 * Merge two TokenUsage objects by summing their fields.
 */
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
 * Resolves short alias IDs (e.g., "S1") back to real MongoDB ObjectIds
 * using the provided aliasToId map, then validates that all staffIds
 * exist in the candidate pool for each slot.
 * Strips any assignments with invalid staffIds.
 *
 * Exported for use by ScheduleValidatorService (Sprint 3.8) to
 * normalize correction responses through the same pipeline.
 *
 * @param raw - Raw AI JSON output
 * @param slots - Slot candidates for validation
 * @param dateStr - Date string for the day
 * @param dayName - Day name (e.g., "Monday")
 * @param aliasToId - Map of short alias -> real staffId (for resolving AI output)
 */
export function normalizeAIOutput(
  raw: AIRawDayOutput,
  slots: SlotCandidates[],
  dateStr: string,
  dayName: string,
  aliasToId: Map<string, string> = new Map(),
): GeneratedDaySchedule {
  // Build a set of all valid staffIds across all slots
  const allValidStaffIds = new Set<string>();
  const staffNameMap = new Map<string, string>();
  for (const slotCandidate of slots) {
    for (const candidate of slotCandidate.candidates) {
      allValidStaffIds.add(candidate.staffId);
      staffNameMap.set(candidate.staffId, candidate.staffName);
    }
  }

  // Filter assignments to only valid staff IDs
  const validAssignments: GeneratedShiftAssignment[] = [];
  const invalidCount = { count: 0 };

  for (const assignment of raw.assignments ?? []) {
    // Resolve alias to real staffId if applicable
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
      invalidCount.count++;
      console.warn(
        `[SchedulingAgent] Stripped invalid staffId "${assignment.staffId}" (resolved: "${resolvedId}") from AI output for ${dateStr}`,
      );
    }
  }

  // Normalize unfilled slots
  const unfilledSlots: UnfilledSlot[] = (raw.unfilledSlots ?? []).map((u) => ({
    station: u.station,
    startTime: u.startTime,
    endTime: u.endTime,
    needed: u.needed,
    assigned: u.assigned,
    reason: u.reason || "Insufficient candidates",
  }));

  let notes = raw.notes ?? "";
  if (invalidCount.count > 0) {
    notes += ` (${invalidCount.count} invalid assignment(s) were removed during post-processing)`;
  }

  return {
    date: dateStr,
    dayOfWeek: dayName,
    assignments: validAssignments,
    unfilledSlots,
    notes,
  };
}

// ────────────────────────────────────────────────────────────
// Locked-State Merge Helper
// ────────────────────────────────────────────────────────────

/**
 * Merge locked (valid) assignments with the AI's corrected output for
 * failed slots. Deduplicates in case the AI echoes back a locked
 * assignment despite being told not to -- locked always wins.
 *
 * @param locked - Assignments that passed validation and were preserved
 * @param corrected - The AI's corrected output (should only contain failed-slot fixes)
 * @returns Merged GeneratedDaySchedule with locked + deduplicated corrected assignments
 */
export function mergeLockedAndCorrected(
  locked: GeneratedShiftAssignment[],
  corrected: GeneratedDaySchedule,
): GeneratedDaySchedule {
  const lockedStaffSlotKeys = new Set(
    locked.map(
      (a) => `${a.staffId}|${a.station}|${a.startTime}|${a.endTime}`,
    ),
  );

  const deduped = corrected.assignments.filter((a) => {
    const key = `${a.staffId}|${a.station}|${a.startTime}|${a.endTime}`;
    return !lockedStaffSlotKeys.has(key);
  });

  return {
    ...corrected,
    assignments: [...locked, ...deduped],
    notes: corrected.notes
      ? `${corrected.notes} (${locked.length} locked + ${deduped.length} corrected)`
      : `${locked.length} locked + ${deduped.length} corrected assignments`,
  };
}

// ────────────────────────────────────────────────────────────
// Algorithmic Fallback
// ────────────────────────────────────────────────────────────

/**
 * Simple deterministic fallback when AI is unavailable.
 *
 * Strategy: For each slot, assign the first N candidates from
 * CandidateService's pre-sorted order (preferred > available,
 * high proficiency > low, no overtime > overtime).
 *
 * This ensures a functional schedule even without AI reasoning.
 */
function algorithmicFallback(
  dayContext: DaySchedulingContext,
): GeneratedDaySchedule {
  const dateStr = dayContext.date.toISOString().split("T")[0];
  const assignments: GeneratedShiftAssignment[] = [];
  const unfilledSlots: UnfilledSlot[] = [];

  // Track staff already assigned on this day (one shift per day)
  const assignedStaff = new Set<string>();

  for (const { slot, candidates } of dayContext.slots) {
    const targetCount = slot.preferredStaff;
    let assigned = 0;

    // Assign candidates in order (CandidateService already sorts optimally)
    for (const candidate of candidates) {
      if (assigned >= targetCount) break;

      // Skip if already assigned to any slot today (one shift per day)
      if (assignedStaff.has(candidate.staffId)) {
        continue;
      }

      assignments.push({
        staffId: candidate.staffId,
        staffName: candidate.staffName,
        station: slot.station,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reasoning: "Assigned via algorithmic fallback (AI unavailable)",
      });

      assignedStaff.add(candidate.staffId);
      assigned++;
    }

    // Track unfilled slots
    if (assigned < targetCount) {
      unfilledSlots.push({
        station: slot.station,
        startTime: slot.startTime,
        endTime: slot.endTime,
        needed: targetCount,
        assigned,
        reason:
          candidates.length === 0
            ? "No valid candidates available"
            : `Only ${assigned} of ${targetCount} positions filled (${candidates.length} candidates available, some may have conflicts)`,
      });
    }
  }

  return {
    date: dateStr,
    dayOfWeek: dayContext.dayName,
    assignments,
    unfilledSlots,
    notes:
      "Schedule created using basic assignment (AI unavailable). No AI optimization applied.",
  };
}

// ────────────────────────────────────────────────────────────
// Alias Map Builder
// ────────────────────────────────────────────────────────────

/**
 * Build bidirectional alias maps from candidate slot data.
 * Assigns short sequential aliases (S1, S2, ...) to each unique staffId.
 * This prevents LLM hallucination of 24-char MongoDB ObjectIds and
 * reduces token count in the prompt.
 *
 * @param slots - Slot candidates containing all unique staff
 * @returns idToAlias (real ID -> alias) and aliasToId (alias -> real ID) maps
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
   * Fetches all needed data in parallel from the various services.
   *
   * Per ARCHITECTURE.md: This method calls Service Layer methods only
   * (KitchenConfigService, StaffService, etc.). No Mongoose model imports.
   *
   * @param orgId - Organization ID (multi-tenancy scoping)
   * @param locationId - Location ID (multi-tenancy scoping)
   * @param clerkUserId - Clerk user ID who triggered generation (for AI tracking)
   * @param weekStart - Monday of the target week
   * @returns SchedulingContext with all data needed for generation
   */
  async buildSchedulingContext(
    orgId: string,
    locationId: string,
    clerkUserId: string,
    weekStart: Date,
  ): Promise<SchedulingContext> {
    // Fetch config, staff, and labor requirements in parallel
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

    // Get or create the schedule record for the week
    const schedule = await ScheduleService.getOrCreateForWeek(
      orgId,
      locationId,
      weekStart,
    );

    // Fetch existing shifts for this schedule
    const existingShifts = await ShiftService.getBySchedule(schedule.id);

    // Filter to active staff only
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
   * Generate a schedule for ONE day using the AI Soft Selector,
   * then validate against hard constraints with retry loop.
   *
   * This is the core method that:
   * 1. Builds prompts from the day context
   * 2. Calls OpenAI's generateJSON<T>() with tracking
   * 3. Normalizes the AI output (strips invalid staffIds)
   * 4. Validates against hard constraints (Sprint 3.8)
   * 5. If errors, retries with correction hints (up to 3 attempts)
   * 6. Falls back to algorithmic assignment if AI is unavailable
   * 7. On max retries, strips invalid assignments (graceful degradation)
   *
   * @param context - Day scheduling context with pre-filtered candidates
   * @param tracking - Usage tracking options (orgId, locationId, clerkUserId)
   * @param allStaff - All active staff DTOs (for validation lookups)
   * @returns GeneratedDaySchedule with shift assignments, token usage, and warnings
   */
  async generateDaySchedule(
    context: DaySchedulingContext,
    tracking: TrackingOptions,
    allStaff: StaffDTO[] = [],
  ): Promise<{
    daySchedule: GeneratedDaySchedule;
    tokenUsage: TokenUsage;
    usedFallback: boolean;
    warnings: ValidationWarning[];
  }> {
    const dateStr = context.date.toISOString().split("T")[0];
    const dayName = context.dayName;

    // If no slots to fill, return empty day
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

    // Check if all slots have zero candidates -- skip AI call
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

    // Try AI generation, fall back to algorithmic if unavailable
    try {
      // Build alias maps: short IDs (S1, S2, ...) prevent LLM ID-hallucination
      const { idToAlias, aliasToId } = buildAliasMap(context.slots);

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildDayUserPrompt(context, idToAlias);

      const aiStart = Date.now();
      const { data: rawOutput, usage } = await generateJSON<AIRawDayOutput>(
        systemPrompt,
        userPrompt,
        {
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 4000,
          tracking: {
            orgId: tracking.orgId,
            locationId: tracking.locationId,
            clerkUserId: tracking.clerkUserId,
            action: tracking.action,
          },
        },
      );
      const aiElapsed = Date.now() - aiStart;
      console.log(
        `${LOG_PREFIX} ${dateStr} AI call: ${fmtMs(aiElapsed)} | ${fmtTokens(usage)} | ${(rawOutput.assignments ?? []).length} assignments returned`,
      );

      // Normalize AI output: resolve aliases back to real IDs and validate
      let daySchedule = normalizeAIOutput(
        rawOutput,
        context.slots,
        dateStr,
        dayName,
        aliasToId,
      );

      // ── Sprint 3.8: Validation + Smart Retry Loop ────────
      // Error types the AI can fix by reassigning staff:
      const FIXABLE_ERROR_TYPES = new Set([
        "double_booking",
        "multiple_shifts_same_day",
        "overlap",
        "skill_mismatch",
        "unavailable_staff",
        "invalid_staff_id",
      ]);

      let accumulatedTokenUsage = usage;
      let validation = ScheduleValidatorService.validate(
        daySchedule,
        context,
        allStaff,
      );

      if (validation.valid) {
        console.log(
          `${LOG_PREFIX} ${dateStr} Validation passed (${validation.warnings.length} warning(s))`,
        );
      }

      // Smart retry: partition errors into fixable vs unfixable
      if (!validation.valid) {
        const unfixableErrors = validation.errors.filter(
          (e) => !FIXABLE_ERROR_TYPES.has(e.type),
        );
        const fixableErrors = validation.errors.filter((e) =>
          FIXABLE_ERROR_TYPES.has(e.type),
        );

        // Strip unfixable assignments immediately (e.g. max_hours_exceeded)
        // The AI cannot fix these because weekly hours are a running total
        if (unfixableErrors.length > 0) {
          console.log(
            `${LOG_PREFIX} ${dateStr} Stripping ${unfixableErrors.length} unfixable error(s) (${unfixableErrors.map((e) => e.type).join(", ")})`,
          );
          daySchedule = ScheduleValidatorService.stripInvalidAssignments(
            daySchedule,
            unfixableErrors,
          );
          // Re-validate after stripping unfixable errors
          validation = ScheduleValidatorService.validate(
            daySchedule,
            context,
            allStaff,
          );
        }

        // Only retry if fixable errors remain
        if (fixableErrors.length > 0 && !validation.valid) {
          for (
            let attempt = 1;
            !validation.valid &&
            attempt <= ScheduleValidatorService.MAX_RETRY_ATTEMPTS;
            attempt++
          ) {
            const currentFixable = validation.errors.filter((e) =>
              FIXABLE_ERROR_TYPES.has(e.type),
            );
            if (currentFixable.length === 0) {
              // Only unfixable errors left -- strip and stop
              console.log(
                `${LOG_PREFIX} ${dateStr} No fixable errors remain, stripping remaining violations.`,
              );
              daySchedule = ScheduleValidatorService.stripInvalidAssignments(
                daySchedule,
                validation.errors,
              );
              validation = ScheduleValidatorService.validate(
                daySchedule,
                context,
                allStaff,
              );
              break;
            }

            // Partition valid (locked) vs invalid (to retry) assignments
            const { lockedAssignments, failedSlotKeys } =
              ScheduleValidatorService.partitionAssignments(
                daySchedule,
                currentFixable,
              );

            console.warn(
              `${LOG_PREFIX} ${dateStr} Validation failed: ${currentFixable.length} fixable error(s). ` +
                `Locked ${lockedAssignments.length} valid assignment(s). ` +
                `Retry ${attempt}/${ScheduleValidatorService.MAX_RETRY_ATTEMPTS}...`,
            );

            try {
              const retryStart = Date.now();
              const { daySchedule: corrected, tokenUsage: retryUsage } =
                await ScheduleValidatorService.retryWithCorrections(
                  daySchedule,
                  currentFixable,
                  context,
                  tracking,
                  attempt,
                  idToAlias,
                  aliasToId,
                  lockedAssignments,
                  failedSlotKeys,
                );
              const retryElapsed = Date.now() - retryStart;
              console.log(
                `${LOG_PREFIX} ${dateStr} Retry ${attempt} AI call: ${fmtMs(retryElapsed)} | ${fmtTokens(retryUsage)}`,
              );

              daySchedule = corrected;
              accumulatedTokenUsage = mergeTokenUsage(
                accumulatedTokenUsage,
                retryUsage,
              );

              // Re-validate the corrected output
              validation = ScheduleValidatorService.validate(
                daySchedule,
                context,
                allStaff,
              );
            } catch (retryError) {
              // If AI becomes unavailable during retry, break out and use what we have
              if (
                retryError instanceof AILimitExceededError ||
                retryError instanceof AIServiceUnavailableError
              ) {
                console.warn(
                  `${LOG_PREFIX} ${dateStr} AI unavailable during retry. Using best available schedule.`,
                );
                break;
              }
              throw retryError;
            }
          }
        } else if (fixableErrors.length === 0) {
          console.log(
            `${LOG_PREFIX} ${dateStr} All errors were unfixable — skipping retry loop.`,
          );
        }
      }

      // If still invalid after all retries, strip remaining invalid assignments
      if (!validation.valid) {
        console.warn(
          `${LOG_PREFIX} ${dateStr} Max retries exhausted. Stripping ${validation.errors.length} remaining invalid assignment(s).`,
        );
        daySchedule = ScheduleValidatorService.stripInvalidAssignments(
          daySchedule,
          validation.errors,
        );
        // Re-validate after stripping to get clean warnings
        validation = ScheduleValidatorService.validate(
          daySchedule,
          context,
          allStaff,
        );
      }

      return {
        daySchedule,
        tokenUsage: accumulatedTokenUsage,
        usedFallback: false,
        warnings: validation.warnings,
      };
    } catch (error) {
      // Fallback on AI limit exceeded or service unavailable
      if (
        error instanceof AILimitExceededError ||
        error instanceof AIServiceUnavailableError
      ) {
        console.warn(
          `${LOG_PREFIX} ${dateStr} AI unavailable: ${error.message}. Using algorithmic fallback.`,
        );
        const daySchedule = algorithmicFallback(context);

        // Validate fallback output too (should be clean, but capture warnings)
        const validation = ScheduleValidatorService.validate(
          daySchedule,
          context,
          allStaff,
        );

        return {
          daySchedule,
          tokenUsage: emptyTokenUsage(),
          usedFallback: true,
          warnings: validation.warnings,
        };
      }

      // Re-throw unexpected errors
      throw error;
    }
  },

  /**
   * Generate a full week's schedule using day-by-day chunking.
   *
   * Orchestration:
   * 1. Gets all 7 days of the week
   * 2. Filters to days the kitchen is open
   * 3. For each open day (sequentially, for clopening + shift accumulation):
   *    a. Fetches candidates via CandidateService.getCandidatesForDay()
   *    b. Builds DaySchedulingContext with accumulated shifts from prior days
   *    c. Calls generateDaySchedule() (AI or fallback)
   *    d. Accumulates generated shifts for subsequent days
   * 4. Aggregates into GeneratedSchedule with metadata
   *
   * Sequential processing is critical:
   * - CandidateService needs to see prior days' generated shifts to avoid
   *   double-booking staff across days
   * - Each day's prompt includes the previous day's closing shifts for
   *   clopening avoidance
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

    // Accumulate shifts as we generate each day
    // Start with existing shifts from the database
    let accumulatedShifts: ShiftDTO[] = [...context.existingShifts];
    let totalTokenUsage = emptyTokenUsage();
    let usedFallbackAnyDay = false;
    const allWarnings: ValidationWarning[] = [];

    const dayResults: GeneratedDaySchedule[] = [];
    let runningShiftCount = 0;

    // Generate days in demand-difficulty order (busiest first) so the
    // hardest-to-staff days get first pick of the limited hour pool.
    const generationOrder = calculateDayPriority(
      context.laborRequirements,
      weekDays,
    );

    let step = 0;
    for (const i of generationOrder) {
      step++;
      const dayStart = Date.now();
      const date = weekDays[i];
      const dayOfWeek = getDayOfWeek(date);
      const dayName = DAY_NAMES[dayOfWeek];
      const dateStr = format(date, "yyyy-MM-dd");

      // Check if kitchen is open this day
      const operatingHours = getStoreHoursForDay(
        context.config.operatingHours,
        date,
      );

      // Get labor requirements for this day of week
      const dayRequirements = context.laborRequirements.filter(
        (req) => req.dayOfWeek === dayOfWeek,
      );

      // Skip days with no operating hours or no labor requirements
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

      // Get candidates for this day using CandidateService
      // Pass accumulatedShifts so it can see prior days' generated shifts
      const candidateStart = Date.now();
      const slotCandidates = await CandidateService.getCandidatesForDay(
        context.orgId,
        context.locationId,
        date,
        dayRequirements,
        accumulatedShifts,
      );
      const candidateElapsed = Date.now() - candidateStart;

      const totalCandidates = slotCandidates.reduce(
        (sum, s) => sum + s.candidates.length,
        0,
      );
      console.log(
        `${LOG_PREFIX} ${dateStr} Candidates: ${totalCandidates} across ${slotCandidates.length} slot(s) (${fmtMs(candidateElapsed)})`,
      );

      // Get previous day's closing shifts for clopening avoidance
      let previousDayClosingShifts: ShiftDTO[] = [];
      if (i > 0) {
        const previousDay = weekDays[i - 1];
        previousDayClosingShifts = getClosingShifts(
          accumulatedShifts,
          previousDay,
        );
      }

      // Build the day context
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

      // Generate the day's schedule (with Sprint 3.8 validation + retry)
      const { daySchedule, tokenUsage, usedFallback, warnings } =
        await this.generateDaySchedule(dayContext, tracking, context.staff);

      // Accumulate results
      dayResults.push(daySchedule);
      allWarnings.push(...warnings);
      totalTokenUsage = mergeTokenUsage(totalTokenUsage, tokenUsage);
      if (usedFallback) usedFallbackAnyDay = true;
      runningShiftCount += daySchedule.assignments.length;

      // Convert assignments to synthetic ShiftDTOs and accumulate
      // This lets CandidateService see these shifts for subsequent days
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

      const dayElapsed = Date.now() - dayStart;
      console.log(
        `${LOG_PREFIX} ${dateStr} Done: ${daySchedule.assignments.length} shifts, ${daySchedule.unfilledSlots.length} unfilled, ${warnings.length} warnings (${fmtMs(dayElapsed)}) [${fmtMs(Date.now() - startTime)} elapsed, ${runningShiftCount} total shifts]`,
      );
    }

    // Re-sort results into calendar order (Mon-Sun) for consistent UI display
    dayResults.sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate metadata
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

    // Build summary
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
      summaryParts.push("Some days used basic assignment (AI unavailable).");
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
