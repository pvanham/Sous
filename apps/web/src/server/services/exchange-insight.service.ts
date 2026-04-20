import { format } from "date-fns";
import { Types } from "mongoose";

import {
  generateJSON,
  AILimitExceededError,
  AIServiceUnavailableError,
} from "@/lib/ai/openai-client";
import { CandidateService } from "@/server/services/candidate.service";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import { TimeOffRequestService } from "@/server/services/time-off-request.service";
import {
  calculateShiftDuration,
  getDayOfWeek,
  getWeekStart,
  getWeekEnd,
} from "@/lib/utils/date";
import type { StaffDTO } from "@/types/staff";

// ============================================================
// ExchangeInsightService — Sous note for an agreed shift swap
// ============================================================
//
// What it does
//   Given an `ExchangeShift` row that has just been picked up
//   (status `covered` or `pending_coverage`), gather everything
//   the LLM needs to write a concise note about the trade and
//   persist that note via `ExchangeShiftService.setAIInsight`.
//
//   The note is meant to be USEFUL — not a generic "have a nice
//   day". The model is given:
//     • the shift itself (date, time, station, length),
//     • the dropper and the picker (skill at this station,
//       hours scheduled this week vs. their cap, time-off
//       situation, preferred stations),
//     • the labor requirement that originally created the slot
//       (`minStaff` / `preferredStaff` so it can flag short-
//       handed picks), and
//     • the dropper's `reason` if any.
//
//   Output is forced to JSON via `generateJSON` so we can extract
//   a single `insight` string the mobile UI just renders. We also
//   ask the model to keep it to ≤2 short sentences so the card
//   stays scannable on a phone.
//
// Architecture
//   Service layer — imports other services (StaffService,
//   ShiftService, ExchangeShiftService, LaborRequirementService,
//   TimeOffRequestService, CandidateService) and the OpenAI
//   client. Never imports Mongoose models directly. Tenant-
//   scoped: every read is filtered by (orgId, locationId).
//
// Usage tracking
//   We pass `tracking: { action: "exchange_insight" }` so usage
//   is logged and counted toward the location's monthly AI
//   budget — but the action is NOT in the limit-enforced
//   allow-list (`schedule_generation`), so an exhausted budget
//   does not block insight generation. If billing wants to
//   throttle this in the future, flip the check in
//   `openai-client.ts:checkLimitsIfTracked`.
//
// Failure handling
//   The LLM call has its own retry / cost ceiling inside
//   `openai-client.ts`. Anything that escapes (limit exceeded,
//   service unavailable, JSON parse error, missing context) is
//   caught here and persisted as `aiInsightStatus: "failed"` so
//   the row never gets stuck in `pending`. This service never
//   throws to its caller — it returns a small status discriminated
//   union so the route handler / `after()` callback can log
//   without bringing down the request.

// ============================================================
// Internal model output shape
// ============================================================

interface AIInsightOutput {
  insight: string;
}

// ============================================================
// Public API
// ============================================================

export type GenerateExchangeInsightResult =
  | { status: "ready"; insight: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Internal LLM caller — extracted so tests can override the
 * function without monkey-patching ESM module bindings on the
 * shared `openai-client` module. Call sites inside this service
 * always go through `defaultLLMCaller`; tests use
 * `__setExchangeInsightLLMCaller` to swap in a deterministic
 * stub. This indirection lives only in this module so the
 * production OpenAI call path is unchanged for every other
 * caller of `generateJSON`.
 */
type LLMCaller = (input: {
  systemPrompt: string;
  userPrompt: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
}) => Promise<AIInsightOutput>;

const defaultLLMCaller: LLMCaller = async ({
  systemPrompt,
  userPrompt,
  orgId,
  locationId,
  clerkUserId,
}) => {
  const { data } = await generateJSON<AIInsightOutput>(
    systemPrompt,
    userPrompt,
    {
      model: "gpt-4o-mini",
      temperature: 0.4,
      maxTokens: 350,
      tracking: {
        orgId,
        locationId,
        clerkUserId,
        action: "exchange_insight",
      },
    },
  );
  return data;
};

let activeLLMCaller: LLMCaller = defaultLLMCaller;

/**
 * Test-only hook to swap the LLM caller for a deterministic stub.
 * Reverts when called with `null`. Has no effect at runtime in
 * production code paths.
 */
export function __setExchangeInsightLLMCaller(
  caller: LLMCaller | null,
): void {
  activeLLMCaller = caller ?? defaultLLMCaller;
}

export const ExchangeInsightService = {
  /**
   * Generate and persist the Sous insight for an agreed swap.
   *
   * Idempotent-ish: if the row is no longer in the right state
   * (e.g. the picker bailed and someone reset the row to
   * `available`) the service short-circuits with a `skipped`
   * result and does not touch the DB. Safe to call from inside
   * `after()` or a retry loop.
   */
  async generateForExchange(input: {
    orgId: string;
    locationId: string;
    exchangeId: string;
    /** Clerk user id of the staff member who triggered the pickup. Used for usage attribution. */
    triggeredByClerkUserId: string;
  }): Promise<GenerateExchangeInsightResult> {
    const { orgId, locationId, exchangeId, triggeredByClerkUserId } = input;

    let prompt: PromptBundle;
    try {
      prompt = await buildPrompt(orgId, locationId, exchangeId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[ExchangeInsightService] context build failed for ${exchangeId}: ${reason}`,
      );
      await markFailed(orgId, locationId, exchangeId);
      return { status: "failed", reason };
    }

    if (prompt.kind === "skipped") {
      // Don't flip the status to `failed` — `skipped` typically
      // means the row left the eligible state (cancelled,
      // re-opened, deleted). Leaving the status alone lets a
      // future legitimate pickup trigger generation.
      return { status: "skipped", reason: prompt.reason };
    }

    try {
      const data = await activeLLMCaller({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: prompt.userPrompt,
        orgId,
        locationId,
        clerkUserId: triggeredByClerkUserId,
      });

      const insight = sanitizeInsight(data?.insight);
      if (!insight) {
        await markFailed(orgId, locationId, exchangeId);
        return { status: "failed", reason: "empty insight" };
      }

      await ExchangeShiftService.setAIInsight({
        orgId,
        locationId,
        exchangeId,
        outcome: "ready",
        insight,
      });

      return { status: "ready", insight };
    } catch (error) {
      const reason = describeAIError(error);
      console.error(
        `[ExchangeInsightService] generation failed for ${exchangeId}: ${reason}`,
      );
      await markFailed(orgId, locationId, exchangeId);
      return { status: "failed", reason };
    }
  },
};

// ============================================================
// System prompt
// ============================================================

const SYSTEM_PROMPT = `You are Sous, an AI assistant embedded in a restaurant scheduling app.
A staff member just picked up a shift another staff member dropped, so two people have agreed to a swap.

Write ONE concise insight (max 2 short sentences, ~45 words) that the dropper, the picker, and any reviewing manager will see in the mobile app.

Make the note useful. Mention concrete things from the data, e.g.:
  - whether the picker is well-suited for the station (skill / preferred station match),
  - whether picking up this shift pushes them close to or over their weekly hours cap,
  - whether the trade leaves the original slot at minimum staffing or improves coverage,
  - whether the dropper's reason (if given) lines up with the timing of the swap,
  - whether either person has time off near this shift that the other party should know about.

Tone: professional, friendly, in the voice of a helpful sous chef. Refer to people by first name only. Do NOT include emojis, headings, bullet points, or markdown. Do NOT recommend an action — just surface what's worth knowing.

Respond with a JSON object of the form { "insight": "<note>" }. The "insight" field MUST be a single plain-text string with no surrounding quotes, no line breaks, and no markdown.`;

// ============================================================
// Prompt construction
// ============================================================

interface PromptReady {
  kind: "ready";
  userPrompt: string;
}

interface PromptSkipped {
  kind: "skipped";
  reason: string;
}

type PromptBundle = PromptReady | PromptSkipped;

async function buildPrompt(
  orgId: string,
  locationId: string,
  exchangeId: string,
): Promise<PromptBundle> {
  if (!Types.ObjectId.isValid(exchangeId)) {
    return { kind: "skipped", reason: "invalid exchange id" };
  }

  const exchange = await ExchangeShiftService.getById(
    orgId,
    locationId,
    exchangeId,
  );
  if (!exchange) {
    return { kind: "skipped", reason: "exchange row not found" };
  }

  if (exchange.status === "available" || exchange.status === "cancelled") {
    return {
      kind: "skipped",
      reason: `status ${exchange.status} not eligible for insight`,
    };
  }

  if (!exchange.pickedUpByStaffId) {
    return { kind: "skipped", reason: "no picker recorded" };
  }

  // Pull both staff records and the underlying shift in parallel.
  const [dropper, picker] = await Promise.all([
    StaffService.getById(orgId, locationId, exchange.staffId),
    StaffService.getById(orgId, locationId, exchange.pickedUpByStaffId),
  ]);

  if (!dropper || !picker) {
    return {
      kind: "skipped",
      reason: "missing dropper or picker staff record",
    };
  }

  const start = new Date(exchange.start);
  const end = new Date(exchange.end);
  const shiftHours = roundHours(calculateShiftDuration(start, end));

  // Week-window lookups for both staff so we can talk about hours
  // load and time-off conflicts. We deliberately do NOT block on
  // these — if any single one fails we just omit that signal from
  // the prompt rather than failing the whole insight.
  const weekStart = getWeekStart(start);
  const weekEnd = getWeekEnd(start);
  const weekEndExclusive = new Date(weekEnd.getTime() + 1);

  const [
    dropperWeekShifts,
    pickerWeekShifts,
    timeOffStaffIdsThisDay,
    laborRequirements,
  ] = await Promise.all([
    safe(() =>
      ShiftService.getByStaffAndWeek(
        orgId,
        locationId,
        dropper.id,
        weekStart,
        weekEndExclusive,
      ),
    ),
    safe(() =>
      ShiftService.getByStaffAndWeek(
        orgId,
        locationId,
        picker.id,
        weekStart,
        weekEndExclusive,
      ),
    ),
    safe(() =>
      TimeOffRequestService.getStaffIdsWithApprovedTimeOff(
        orgId,
        locationId,
        start,
      ),
    ),
    safe(() => LaborRequirementService.list(orgId, locationId)),
  ]);

  const dropperWeekHours = sumHours(dropperWeekShifts ?? []);
  // The pickup already reassigned the underlying shift, so the
  // picker's `weekShifts` includes this swap. Compute "after"
  // hours straight from the join, and "before" by subtracting
  // out the just-picked-up shift if present.
  const pickerWeekHoursAfter = sumHours(pickerWeekShifts ?? []);
  const pickerWeekHoursBefore = Math.max(0, pickerWeekHoursAfter - shiftHours);

  const dayOfWeek = getDayOfWeekShort(start);
  const matchingRequirement = (laborRequirements ?? []).find(
    (req) =>
      req.station === exchange.station &&
      req.dayOfWeek === dayOfWeekIndex(start),
  );

  const dropperHasTimeOff =
    timeOffStaffIdsThisDay?.has(dropper.id) ?? false;
  const pickerHasTimeOff =
    timeOffStaffIdsThisDay?.has(picker.id) ?? false;

  const blob = {
    swap: {
      date: format(start, "EEEE, MMMM d"),
      timeRange: `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`,
      station: exchange.station,
      lengthHours: shiftHours,
      reason: exchange.reason?.trim() ? exchange.reason.trim() : null,
    },
    dropper: describeStaff(dropper, exchange.station, {
      weekHours: roundHours(dropperWeekHours),
      hasTimeOffThisDay: dropperHasTimeOff,
    }),
    picker: describeStaff(picker, exchange.station, {
      weekHoursBeforeSwap: roundHours(pickerWeekHoursBefore),
      weekHoursAfterSwap: roundHours(pickerWeekHoursAfter),
      hasTimeOffThisDay: pickerHasTimeOff,
    }),
    coverage: matchingRequirement
      ? {
          dayOfWeek,
          minStaff: matchingRequirement.minStaff,
          preferredStaff: matchingRequirement.preferredStaff,
        }
      : { dayOfWeek, minStaff: null, preferredStaff: null },
  };

  // Use CandidateService.wouldCauseOvertime as a quick boolean —
  // even though the picker's shift is already reassigned, this
  // method derives strictly from the existing-shifts list, so we
  // pass `pickerWeekShifts` minus the new shift to ask "would
  // this pickup have pushed them over?".
  const overtimeFlag = (() => {
    if (!pickerWeekShifts) return null;
    const without = pickerWeekShifts.filter((s) => s.id !== exchange.shiftId);
    return CandidateService.wouldCauseOvertime(
      picker.id,
      {
        date: start,
        startTime: format(start, "HH:mm"),
        endTime: format(end, "HH:mm"),
      },
      without,
      picker.maxHoursPerWeek,
    );
  })();

  const userPrompt = [
    "Generate the Sous insight for this agreed shift swap. Use only the facts in the JSON below.",
    "",
    `picker_overtime_after_swap: ${overtimeFlag === null ? "unknown" : overtimeFlag}`,
    "",
    "context:",
    "```json",
    JSON.stringify(blob, null, 2),
    "```",
  ].join("\n");

  return { kind: "ready", userPrompt };
}

// ============================================================
// Helpers
// ============================================================

function describeStaff(
  staff: StaffDTO,
  station: string,
  load: Record<string, unknown>,
) {
  const matchingSkill = staff.skills.find((s) => s.station === station);
  return {
    name: firstName(staff.name),
    roles: staff.roles,
    proficiencyAtStation: matchingSkill?.proficiency ?? null,
    isPreferredStation: staff.preferredStations.includes(station),
    maxHoursPerWeek: staff.maxHoursPerWeek,
    minHoursPerWeek: staff.minHoursPerWeek,
    ...load,
  };
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Unknown";
  return trimmed.split(/\s+/)[0];
}

function sumHours(shifts: { start: Date; end: Date }[]): number {
  return shifts.reduce(
    (acc, s) => acc + calculateShiftDuration(new Date(s.start), new Date(s.end)),
    0,
  );
}

function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

function dayOfWeekIndex(date: Date): number {
  // Sunday = 0, Monday = 1, ... Saturday = 6 — matches the
  // `LaborRequirementDTO.dayOfWeek` convention used by
  // `CandidateService.getCandidatesForDay`.
  return getDayOfWeek(date);
}

function getDayOfWeekShort(date: Date): string {
  return format(date, "EEEE");
}

function sanitizeInsight(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  // Hard length cap so a runaway response can't blow past the
  // model's 1000-char `maxlength`.
  return cleaned.slice(0, 800);
}

function describeAIError(error: unknown): string {
  if (error instanceof AILimitExceededError) return "ai limit exceeded";
  if (error instanceof AIServiceUnavailableError) return error.message;
  if (error instanceof Error) return error.message;
  return "unknown ai error";
}

async function markFailed(
  orgId: string,
  locationId: string,
  exchangeId: string,
): Promise<void> {
  try {
    await ExchangeShiftService.setAIInsight({
      orgId,
      locationId,
      exchangeId,
      outcome: "failed",
      insight: null,
    });
  } catch (error) {
    console.error(
      "[ExchangeInsightService] failed to record failure status:",
      error,
    );
  }
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.warn(
      "[ExchangeInsightService] best-effort context fetch failed:",
      error,
    );
    return null;
  }
}
