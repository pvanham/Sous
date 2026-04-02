/**
 * Infeasibility analysis for CP-SAT schedule generation (Phase 4 Step 9).
 * Produces prioritized constraint relaxation suggestions when the solver reports INFEASIBLE.
 */

import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { StaffAvailabilityDTO } from "@/types/staff-availability";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { LaborRequirementService } from "@/server/services/labor-requirement.service";
import { StaffAvailabilityService } from "@/server/services/staff-availability.service";
import { StaffService } from "@/server/services/staff.service";

const LOG_PREFIX = "[InfeasibilityAnalyzer]";

export interface InfeasibilityAnalysisInput {
  /** The input payload that was sent to the solver (serialized WeekSolverInput subset) */
  inputPayload: Record<string, unknown>;
  orgId: string;
  locationId: string;
}

export interface InfeasibilityAnalysis {
  /** Prioritized list of constraint relaxation suggestions */
  suggestedRelaxations: ConstraintRelaxationSuggestion[];
  /** High-level explanation of likely causes */
  likelyCauses: string[];
}

export interface ConstraintRelaxationSuggestion {
  /** Priority rank (1 = most impactful) */
  priority: number;
  /** The constraint category */
  category: "overtime" | "clopening" | "staffing" | "availability" | "hours";
  /** Human-readable suggestion */
  suggestion: string;
  /** Current value of the constraint */
  currentValue: string;
  /** Recommended new value */
  recommendedValue: string;
}

/** Category priority bands (lower = more impactful first). */
const PRIORITY = {
  staffing: 1,
  overtime: 2,
  clopening: 3,
  hours: 4,
  availability: 5,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Parse "HH:MM" to minutes from midnight; invalid returns null. */
function parseTimeToMinutes(hhmm: string | undefined): number | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function slotDurationHours(startTime: string, endTime: string): number {
  const a = parseTimeToMinutes(startTime);
  const b = parseTimeToMinutes(endTime);
  if (a === null || b === null) return 0;
  let diff = (b - a) / 60;
  if (diff < 0) diff += 24;
  return Math.max(0, diff);
}

interface FetchedContext {
  kitchenConfig: Awaited<ReturnType<typeof KitchenConfigService.getByLocation>>;
  staffList: Awaited<ReturnType<typeof StaffService.list>>;
  laborReqs: Awaited<ReturnType<typeof LaborRequirementService.list>>;
  availability: Awaited<ReturnType<typeof StaffAvailabilityService.list>>;
}

async function fetchContextSafe(
  orgId: string,
  locationId: string,
): Promise<Partial<FetchedContext>> {
  try {
    const [kitchenConfig, staffList, laborReqs, availability] = await Promise.all([
      KitchenConfigService.getByLocation(orgId, locationId),
      StaffService.list(orgId, locationId),
      LaborRequirementService.list(orgId, locationId),
      StaffAvailabilityService.list(orgId, locationId),
    ]);
    return { kitchenConfig, staffList, laborReqs, availability };
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Failed to fetch config for analysis:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

interface ParsedSettings {
  allowClopening: boolean;
  clopeningThresholdMinutes: number;
  overtimeThresholdHours: number;
  overtimePolicy: "strict" | "avoid" | "allowed";
}

function parseSettings(
  raw: unknown,
  kitchenFallback: ParsedSettings | null,
): ParsedSettings {
  const fb = kitchenFallback ?? {
    allowClopening: false,
    clopeningThresholdMinutes: 600,
    overtimeThresholdHours: 40,
    overtimePolicy: "avoid" as const,
  };
  if (!isRecord(raw)) return fb;
  const allowClopening =
    typeof raw.allowClopening === "boolean" ? raw.allowClopening : fb.allowClopening;
  const clopeningThresholdMinutes =
    asNumber(raw.clopeningThresholdMinutes) ?? fb.clopeningThresholdMinutes;
  const overtimeThresholdHours =
    asNumber(raw.overtimeThresholdHours) ?? fb.overtimeThresholdHours;
  const op = asString(raw.overtimePolicy);
  const overtimePolicy =
    op === "strict" || op === "avoid" || op === "allowed" ? op : fb.overtimePolicy;
  return {
    allowClopening,
    clopeningThresholdMinutes,
    overtimeThresholdHours,
    overtimePolicy,
  };
}

function recordFromPayload(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = asNumber(v);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

interface DaySlotInfo {
  dayName: string;
  dateStr: string;
  dayOfWeek: number;
  sumMinStaff: number;
  uniqueCandidateIds: Set<string>;
  insufficientSlots: { station: string; startTime: string; minStaff: number }[];
}

function parseDaysPayload(payload: Record<string, unknown>): DaySlotInfo[] {
  const daysRaw = payload.days;
  if (!Array.isArray(daysRaw)) return [];
  const out: DaySlotInfo[] = [];
  for (const day of daysRaw) {
    if (!isRecord(day)) continue;
    const dayName = asString(day.dayName) ?? "Unknown day";
    const dateStr = asString(day.dateStr) ?? "";
    const dayOfWeek = asNumber(day.dayOfWeek) ?? 0;
    const slotsRaw = day.slots;
    if (!Array.isArray(slotsRaw)) continue;
    let sumMinStaff = 0;
    const uniqueCandidateIds = new Set<string>();
    const insufficientSlots: DaySlotInfo["insufficientSlots"] = [];
    for (const sc of slotsRaw) {
      if (!isRecord(sc)) continue;
      const slot = sc.slot;
      const candidates = sc.candidates;
      if (isRecord(slot)) {
        const minStaff = asNumber(slot.minStaff) ?? 0;
        sumMinStaff += minStaff;
        const station = asString(slot.station) ?? "station";
        const startTime = asString(slot.startTime) ?? "";
        if (sc.hasSufficientCandidates === false) {
          insufficientSlots.push({ station, startTime, minStaff });
        }
      }
      if (Array.isArray(candidates)) {
        for (const c of candidates) {
          if (isRecord(c)) {
            const sid = asString(c.staffId);
            if (sid) uniqueCandidateIds.add(sid);
          }
        }
      }
    }
    out.push({
      dayName,
      dateStr,
      dayOfWeek,
      sumMinStaff,
      uniqueCandidateIds,
      insufficientSlots,
    });
  }
  return out;
}

function analyzeStaffing(
  days: DaySlotInfo[],
  activeStaffCount: number | undefined,
): { suggestions: ConstraintRelaxationSuggestion[]; causes: string[] } {
  const suggestions: ConstraintRelaxationSuggestion[] = [];
  const causes: string[] = [];

  for (const d of days) {
    const u = d.uniqueCandidateIds.size;
    if (d.sumMinStaff > u && d.sumMinStaff > 0) {
      causes.push(
        `${d.dayName} needs at least ${d.sumMinStaff} staff across slots, but only ${u} qualified staff are available for those shifts.`,
      );
      suggestions.push({
        priority: PRIORITY.staffing,
        category: "staffing",
        suggestion: `On ${d.dayName}, reduce minimum staffing on one or more shifts, or add staff who can cover those stations and times.`,
        currentValue: `${d.sumMinStaff} minimum staff-hours of coverage required (aggregate)`,
        recommendedValue: `Match staffing to the ${u} available qualified staff`,
      });
    }
    for (const ins of d.insufficientSlots) {
      causes.push(
        `${d.dayName} at ${ins.station} (${ins.startTime}): not enough qualified candidates for minimum staffing.`,
      );
      suggestions.push({
        priority: PRIORITY.staffing,
        category: "staffing",
        suggestion: `Lower the minimum staff count for ${ins.station} on ${d.dayName}, or train additional staff for that station.`,
        currentValue: `At least ${ins.minStaff} staff required`,
        recommendedValue: "A lower minimum or additional qualified staff",
      });
    }
  }

  if (
    activeStaffCount !== undefined &&
    activeStaffCount > 0 &&
    days.some((d) => d.sumMinStaff > activeStaffCount)
  ) {
    causes.push(
      `Labor requirements may exceed the ${activeStaffCount} active staff at this location.`,
    );
    suggestions.push({
      priority: PRIORITY.staffing,
      category: "staffing",
      suggestion:
        "Reduce minimum staffing on busy shifts or hire more staff so requirements stay within your team size.",
      currentValue: `${activeStaffCount} active staff`,
      recommendedValue: "Fewer required positions per shift or a larger team",
    });
  }

  return { suggestions, causes };
}

function analyzeOvertime(
  settings: ParsedSettings,
  existingWeekHours: Record<string, number>,
): { suggestions: ConstraintRelaxationSuggestion[]; causes: string[] } {
  const suggestions: ConstraintRelaxationSuggestion[] = [];
  const causes: string[] = [];
  const thr = settings.overtimeThresholdHours;
  const policy = settings.overtimePolicy;

  if (policy === "strict") {
    causes.push(
      `Overtime is set to strict at ${thr} hours per week — the solver may have no way to assign hours without breaking that limit.`,
    );
    suggestions.push({
      priority: PRIORITY.overtime,
      category: "overtime",
      suggestion:
        "Try a slightly higher weekly hour limit before overtime applies, or use a softer overtime rule so the solver can prefer — but not forbid — going over the limit.",
      currentValue: `${thr} hours (strict — hard limit)`,
      recommendedValue: `${Math.min(thr + 5, 60)} hours (strict) or "${thr} hours (avoid — soft penalty)"`,
    });
  }

  for (const [, hours] of Object.entries(existingWeekHours)) {
    if (!Number.isFinite(hours)) continue;
    if (hours >= thr - 0.5) {
      causes.push(
        "Some staff already have many hours booked this week, which tightens feasible assignments under strict overtime rules.",
      );
      suggestions.push({
        priority: PRIORITY.overtime,
        category: "overtime",
        suggestion:
          "Free up hours on existing shifts for affected staff, raise the overtime threshold slightly, or switch overtime handling from strict to avoid.",
        currentValue: `${thr} hour overtime threshold`,
        recommendedValue: `${thr + 5} hours or a softer overtime policy`,
      });
      break;
    }
  }

  return { suggestions, causes };
}

function analyzeClopening(settings: ParsedSettings): {
  suggestions: ConstraintRelaxationSuggestion[];
  causes: string[];
} {
  const suggestions: ConstraintRelaxationSuggestion[] = [];
  const causes: string[] = [];
  const gapHours = settings.clopeningThresholdMinutes / 60;

  if (!settings.allowClopening) {
    causes.push(
      "Back-to-back closing and opening shifts are not allowed, which can rule out valid patterns when staffing is tight.",
    );
    suggestions.push({
      priority: PRIORITY.clopening,
      category: "clopening",
      suggestion:
        "Allow back-to-back closing and opening shifts when needed, or widen the minimum rest between shifts.",
      currentValue: `Not allowed (${gapHours.toFixed(0)} hour minimum between shifts)`,
      recommendedValue: "Allow back-to-back shifts when necessary",
    });
  } else if (settings.clopeningThresholdMinutes > 600) {
    causes.push(
      "The required rest between shifts is very long, which may make some day-to-day combinations impossible.",
    );
    suggestions.push({
      priority: PRIORITY.clopening,
      category: "clopening",
      suggestion:
        "Consider shortening the minimum rest between shifts (while staying within your policies).",
      currentValue: `${gapHours.toFixed(1)} hours between shifts`,
      recommendedValue: "About 10 hours between shifts",
    });
  }

  return { suggestions, causes };
}

function analyzeHours(payload: Record<string, unknown>): {
  suggestions: ConstraintRelaxationSuggestion[];
  causes: string[];
} {
  const suggestions: ConstraintRelaxationSuggestion[] = [];
  const causes: string[] = [];

  const minHoursLookup = recordFromPayload(payload.minHoursLookup);
  const maxHoursLookup = recordFromPayload(payload.maxHoursLookup);

  let totalMinRequested = 0;
  for (const v of Object.values(minHoursLookup)) {
    totalMinRequested += v;
  }

  let totalSlotPersonHoursMin = 0;
  for (const day of daysRawSlots(payload)) {
    totalSlotPersonHoursMin += day.personHoursMin;
  }

  if (totalSlotPersonHoursMin > 0 && totalMinRequested > totalSlotPersonHoursMin + 1e-6) {
    causes.push(
      "Staff minimum weekly hours add up to more than the minimum labor hours implied by your shift requirements.",
    );
    suggestions.push({
      priority: PRIORITY.hours,
      category: "hours",
      suggestion:
        "Lower some staff minimum weekly hours, or add more shift coverage so there is enough work to go around.",
      currentValue: `${totalMinRequested.toFixed(0)} total minimum hours requested`,
      recommendedValue: `At most ~${Math.floor(totalSlotPersonHoursMin)} hours to match current shift demand`,
    });
  }

  for (const [id, minH] of Object.entries(minHoursLookup)) {
    const maxH = maxHoursLookup[id];
    if (maxH !== undefined && minH > maxH) {
      causes.push("At least one staff member has a minimum weekly hours value higher than their maximum.");
      suggestions.push({
        priority: PRIORITY.hours,
        category: "hours",
        suggestion:
          "Fix staff profiles so minimum weekly hours are not higher than maximum weekly hours.",
        currentValue: `${minH} min vs ${maxH} max hours`,
        recommendedValue: "Minimum less than or equal to maximum",
      });
      break;
    }
  }

  return { suggestions, causes };
}

/** Iterate slots for person-hour totals. */
function daysRawSlots(payload: Record<string, unknown>): Array<{ personHoursMin: number }> {
  const daysRaw = payload.days;
  if (!Array.isArray(daysRaw)) return [];
  const result: Array<{ personHoursMin: number }> = [];
  for (const day of daysRaw) {
    if (!isRecord(day)) continue;
    const slotsRaw = day.slots;
    if (!Array.isArray(slotsRaw)) continue;
    let personHoursMin = 0;
    for (const sc of slotsRaw) {
      if (!isRecord(sc)) continue;
      const slot = sc.slot;
      if (!isRecord(slot)) continue;
      const start = asString(slot.startTime) ?? "00:00";
      const end = asString(slot.endTime) ?? "00:00";
      const minStaff = asNumber(slot.minStaff) ?? 0;
      const dur = slotDurationHours(start, end);
      personHoursMin += dur * minStaff;
    }
    result.push({ personHoursMin });
  }
  return result;
}

function analyzeAvailability(
  days: DaySlotInfo[],
  availability: StaffAvailabilityDTO[] | undefined,
  laborReqs: LaborRequirementDTO[] | undefined,
): { suggestions: ConstraintRelaxationSuggestion[]; causes: string[] } {
  const suggestions: ConstraintRelaxationSuggestion[] = [];
  const causes: string[] = [];
  if (!availability || !laborReqs) return { suggestions, causes };

  const availableByDay = new Map<number, Set<string>>();
  for (const a of availability) {
    if (a.preference === "unavailable") continue;
    if (a.availableFrom === null || a.availableTo === null) continue;
    let set = availableByDay.get(a.dayOfWeek);
    if (!set) {
      set = new Set<string>();
      availableByDay.set(a.dayOfWeek, set);
    }
    set.add(a.staffId);
  }

  const requiredByDay = new Map<number, number>();
  for (const lr of laborReqs) {
    const prev = requiredByDay.get(lr.dayOfWeek) ?? 0;
    requiredByDay.set(lr.dayOfWeek, prev + lr.minStaff);
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (const [dow, reqSum] of requiredByDay.entries()) {
    const avail = availableByDay.get(dow)?.size ?? 0;
    if (reqSum > 0 && avail > 0 && reqSum > avail * 2) {
      const name = dayNames[dow] ?? `Day ${dow}`;
      causes.push(
        `${name}: staffing requirements are high relative to how many staff show as available.`,
      );
      suggestions.push({
        priority: PRIORITY.availability,
        category: "availability",
        suggestion: `On ${name}, widen availability windows where possible, or reduce minimum staffing for that day's shifts.`,
        currentValue: `${avail} staff with usable availability`,
        recommendedValue: "More availability or lighter staffing targets",
      });
    }
  }

  for (const d of days) {
    const avail = availableByDay.get(d.dayOfWeek)?.size ?? 0;
    if (d.sumMinStaff > 0 && avail > 0 && d.sumMinStaff > avail * 2) {
      causes.push(
        `${d.dayName}: required coverage may outstrip typical availability for that weekday.`,
      );
      suggestions.push({
        priority: PRIORITY.availability,
        category: "availability",
        suggestion: `Review recurring availability for ${d.dayName} and adjust labor requirements or time windows.`,
        currentValue: `${avail} staff available`,
        recommendedValue: "Aligned availability and staffing targets",
      });
      break;
    }
  }

  return { suggestions, causes };
}

function dedupeSuggestions(
  items: ConstraintRelaxationSuggestion[],
): ConstraintRelaxationSuggestion[] {
  const seen = new Set<string>();
  const out: ConstraintRelaxationSuggestion[] = [];
  for (const s of items) {
    const key = `${s.category}|${s.suggestion}|${s.currentValue}|${s.recommendedValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

function dedupeCauses(causes: string[]): string[] {
  return [...new Set(causes)];
}

function fallbackSuggestion(): ConstraintRelaxationSuggestion {
  return {
    priority: PRIORITY.availability + 1,
    category: "staffing",
    suggestion:
      "Review staffing requirements, overtime limits, and staff availability together — small adjustments in any of these areas often restore a feasible schedule.",
    currentValue: "Current scheduling rules",
    recommendedValue: "Slightly relaxed targets in one or two areas",
  };
}

/**
 * Analyze an infeasible solver run and suggest concrete constraint relaxations.
 * Never throws; failed DB reads result in partial analysis with a console warning.
 */
export async function analyzeInfeasibility(
  input: InfeasibilityAnalysisInput,
): Promise<InfeasibilityAnalysis> {
  const payload = input.inputPayload;
  const orgId = input.orgId;
  const locationId = input.locationId;

  const ctx = await fetchContextSafe(orgId, locationId);
  const kitchenConfig = ctx.kitchenConfig ?? null;
  const staffList = ctx.staffList;
  const laborReqs = ctx.laborReqs;
  const availability = ctx.availability;

  const kitchenScheduleSettings = kitchenConfig?.scheduleGenerationSettings;
  const kitchenParsed: ParsedSettings | null = kitchenScheduleSettings
    ? {
        allowClopening: kitchenScheduleSettings.allowClopening,
        clopeningThresholdMinutes: kitchenScheduleSettings.minHoursBetweenShifts * 60,
        overtimeThresholdHours: kitchenScheduleSettings.overtimeThresholdHours,
        overtimePolicy: kitchenScheduleSettings.overtimePolicy,
      }
    : null;

  const settings = parseSettings(payload.settings, kitchenParsed);
  const existingWeekHours = recordFromPayload(payload.existingWeekHours);
  const days = parseDaysPayload(payload);

  const activeStaffCount = staffList?.filter((s) => s.isActive).length;

  const allSuggestions: ConstraintRelaxationSuggestion[] = [];
  const allCauses: string[] = [];

  const s1 = analyzeStaffing(days, activeStaffCount);
  allSuggestions.push(...s1.suggestions);
  allCauses.push(...s1.causes);

  const s2 = analyzeOvertime(settings, existingWeekHours);
  allSuggestions.push(...s2.suggestions);
  allCauses.push(...s2.causes);

  const s3 = analyzeClopening(settings);
  allSuggestions.push(...s3.suggestions);
  allCauses.push(...s3.causes);

  const s4 = analyzeHours(payload);
  allSuggestions.push(...s4.suggestions);
  allCauses.push(...s4.causes);

  const s5 = analyzeAvailability(days, availability, laborReqs);
  allSuggestions.push(...s5.suggestions);
  allCauses.push(...s5.causes);

  let suggestedRelaxations = dedupeSuggestions(allSuggestions);
  if (suggestedRelaxations.length === 0) {
    suggestedRelaxations = [fallbackSuggestion()];
  }

  if (allCauses.length === 0) {
    allCauses.push(
      "The solver could not find any assignment that satisfies all hard rules at once (hours, shift spacing, and staffing limits).",
    );
  }

  return {
    suggestedRelaxations,
    likelyCauses: dedupeCauses(allCauses),
  };
}
