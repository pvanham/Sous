import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
} from "@/types/ai-scheduling";
import type { ShiftDTO } from "@/types/shift";
import type { CandidateDTO } from "@/types/candidate";

// ============================================================
// Schedule Generation Prompts -- Sprint 3.7
// ============================================================
// Prompt templates for the AI Scheduling Agent "Soft Selector."
// These functions build the system and user prompts that are
// sent to OpenAI's generateJSON<T>() for day-by-day schedule
// generation.
//
// Architecture: Part of the AI Service Layer (per ARCHITECTURE.md).
// These are pure functions -- no DB access, no side effects.
// ============================================================

/** Minimum hours between closing shift end and next day opening shift start */
const CLOPENING_THRESHOLD_HOURS = 10;

// ────────────────────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────────────────────

/**
 * Build the static system prompt that defines the AI's role and output format.
 * This prompt does NOT change between days or kitchens.
 *
 * The system prompt instructs the AI to:
 * - Act as "Sous," a kitchen scheduling assistant
 * - SELECT from pre-verified candidates only (never invent staff)
 * - Consider preferences, fairness, experience mix, and clopening avoidance
 * - Output strict JSON matching the GeneratedDaySchedule shape
 */
export function buildSystemPrompt(): string {
  return `You are Sous, an expert kitchen scheduling assistant.

You will receive a list of OPEN SLOTS and VALID CANDIDATES for each slot.
All candidates have already been verified as available and qualified — do NOT question their eligibility.
Your job is to SELECT the best candidate from each slot's candidate list.

IMPORTANT RULES:
1. You MUST only assign staff members who appear in a slot's candidate list. Never invent or reference staff outside the provided candidates.
2. You MUST use the exact staffId alias values (e.g., "S1", "S2") from the candidate list. Do not modify or fabricate IDs.
3. A staff member MUST NOT be assigned more than ONE shift per day. Even if a person appears as a candidate for multiple slots, assign them to exactly ONE slot (the best fit based on the criteria below) and choose different staff for the remaining slots. This is a hard constraint — no exceptions.
4. Assign up to the "preferredStaff" count for each slot. If fewer candidates are available than needed, assign everyone available and report the shortfall in "unfilledSlots".

SELECTION CRITERIA (in priority order):
1. Hour distribution — STRONGLY prefer candidates with the most remaining weekly hours. This is the most important factor for building a viable full-week schedule. Spread hours evenly across the team. A candidate with 30h remaining is much better than one with 5h remaining, even if the latter is more skilled.
2. Staff preferences — Favor candidates whose "preference" is "preferred" over "available". Favor candidates working at their preferredStations.
3. Skill match — Higher proficiency for the target station is better, but do NOT sacrifice hour fairness for marginally higher proficiency.
4. Clopening avoidance — If previous day closing shifts are provided, avoid assigning someone who closed late the previous night to an early morning slot (less than ${CLOPENING_THRESHOLD_HOURS} hours between shifts).
5. Team balance — Mix experience levels when possible.

For each assignment, provide a brief "reasoning" (1-2 sentences) that mentions the candidate's remaining hours to explain why you chose them.

OUTPUT FORMAT — respond with a single JSON object matching this exact structure:
{
  "assignments": [
    {
      "staffId": "<exact alias from candidate list, e.g. S1>",
      "staffName": "<name from candidate list>",
      "station": "<station name>",
      "startTime": "<HH:MM>",
      "endTime": "<HH:MM>",
      "reasoning": "<1-2 sentences>"
    }
  ],
  "unfilledSlots": [
    {
      "station": "<station name>",
      "startTime": "<HH:MM>",
      "endTime": "<HH:MM>",
      "needed": <number>,
      "assigned": <number>,
      "reason": "<why it couldn't be filled>"
    }
  ],
  "notes": "<1-3 sentence summary of scheduling decisions for this day>"
}

Only include slots in "unfilledSlots" if the number of assignments for that slot is fewer than its "preferredStaff" target. If a slot has zero candidates, still list it in "unfilledSlots".`;
}

// ────────────────────────────────────────────────────────────
// Day User Prompt
// ────────────────────────────────────────────────────────────

/**
 * Format a candidate for inclusion in the prompt.
 * Uses short alias IDs (e.g., "S1") instead of raw MongoDB ObjectIds to
 * reduce token count and prevent LLM ID-hallucination errors.
 *
 * @param candidate - The candidate to format
 * @param station - Target station for proficiency lookup
 * @param idToAlias - Map of real staffId -> short alias (e.g., "S1")
 */
function formatCandidate(
  candidate: CandidateDTO,
  station: string,
  idToAlias: Map<string, string>
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

  // Compact single-line format: ~60% fewer tokens than multi-line
  return `    - ${alias} "${candidate.staffName}" prof:${proficiency}/5 pref:${candidate.preference} hrs:${candidate.currentWeekHours.toFixed(1)}/${candidate.maxHoursPerWeek}(${hoursRemaining.toFixed(1)}rem)${flagStr}`;
}

/**
 * Format a closing shift for the clopening warning section.
 * Uses alias if available.
 */
function formatClosingShift(
  shift: ShiftDTO,
  idToAlias: Map<string, string>
): string {
  const alias = idToAlias.get(shift.staffId) ?? shift.staffId;
  const endTime = new Date(shift.end);
  const hours = String(endTime.getHours()).padStart(2, "0");
  const minutes = String(endTime.getMinutes()).padStart(2, "0");
  return `  - Staff ID: ${alias}, ended at ${hours}:${minutes}, station: ${shift.station}`;
}

/**
 * Build the user prompt for a single day's schedule generation.
 * Serializes the DaySchedulingContext into a structured format
 * that the AI can parse and reason about.
 *
 * Uses short alias IDs (e.g., "S1") instead of raw MongoDB ObjectIds
 * to reduce token count and prevent LLM ID-hallucination errors.
 *
 * @param context - The day's scheduling context with pre-filtered candidates
 * @param idToAlias - Map of real staffId -> short alias (e.g., "S1")
 * @returns Formatted user prompt string
 */
export function buildDayUserPrompt(
  context: DaySchedulingContext,
  idToAlias: Map<string, string>
): string {
  const {
    date,
    dayName,
    slots,
    previousDayClosingShifts,
    kitchenContext,
  } = context;

  const dateStr = date.toISOString().split("T")[0];

  // Header
  const lines: string[] = [
    `SCHEDULE REQUEST FOR: ${dayName}, ${dateStr}`,
    "",
  ];

  // Operating hours
  if (kitchenContext.operatingHours) {
    lines.push(
      `Operating Hours: ${kitchenContext.operatingHours.open} - ${kitchenContext.operatingHours.close}`
    );
  } else {
    lines.push("Operating Hours: CLOSED (no shifts needed)");
  }
  lines.push(`Total Active Staff: ${kitchenContext.totalStaffCount}`);
  lines.push("");

  // Clopening warning
  if (previousDayClosingShifts.length > 0) {
    lines.push("PREVIOUS DAY CLOSING SHIFTS (check for clopening risk):");
    for (const shift of previousDayClosingShifts) {
      lines.push(formatClosingShift(shift, idToAlias));
    }
    lines.push(
      `  Note: Avoid assigning these staff to shifts starting less than ${CLOPENING_THRESHOLD_HOURS} hours after their close.`
    );
    lines.push("");
  }

  // Slots with candidates
  lines.push(`OPEN SLOTS (${slots.length} total):`);
  lines.push("");

  for (let i = 0; i < slots.length; i++) {
    const { slot, candidates, hasSufficientCandidates } = slots[i];

    // Compact slot header: single line
    lines.push(
      `[Slot ${i + 1}] ${slot.station} ${slot.startTime}-${slot.endTime} | need:${slot.preferredStaff} min:${slot.minStaff} pri:${slot.priority}`
    );

    if (candidates.length === 0) {
      lines.push("  Candidates: NONE — add to unfilledSlots");
    } else {
      if (!hasSufficientCandidates) {
        lines.push(
          `  WARNING: Only ${candidates.length} candidates (need ${slot.minStaff} min)`
        );
      }
      lines.push(`  Candidates (${candidates.length}):`);
      for (const candidate of candidates) {
        lines.push(formatCandidate(candidate, slot.station, idToAlias));
      }
    }
    lines.push("");
  }

  // Existing shifts already assigned for this day (from prior generation or manual)
  const dayShifts = context.existingShifts.filter((s) => {
    const shiftDate = new Date(s.start).toISOString().split("T")[0];
    return shiftDate === dateStr;
  });

  if (dayShifts.length > 0) {
    lines.push("ALREADY ASSIGNED SHIFTS FOR THIS DAY:");
    for (const shift of dayShifts) {
      const alias = idToAlias.get(shift.staffId) ?? shift.staffId;
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      const startStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const endStr = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      lines.push(
        `  - Staff ${alias}: ${shift.station} ${startStr}-${endStr}`
      );
    }
    lines.push(
      "  Note: Do not assign these staff members to overlapping times."
    );
    lines.push("");
  }

  lines.push(
    "Please generate the optimal shift assignments for this day. Remember to output valid JSON."
  );

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────
// Correction Prompt (Stub for Sprint 3.8)
// ────────────────────────────────────────────────────────────

/**
 * Build a correction prompt for the self-correction loop.
 *
 * When `lockedAssignments` and `failedSlotKeys` are provided, the prompt
 * uses a "locked state" strategy: valid assignments are listed as immutable,
 * only failed slots' candidates are included, and the AI is instructed to
 * generate replacements for the failed slots only. This reduces token usage
 * and prevents the AI from regressing previously-valid assignments.
 *
 * Falls back to the full-context prompt when locked state is not provided.
 *
 * @param previousOutput - The AI's previous (invalid) output (with real staffIds)
 * @param errors - List of specific validation error messages
 * @param context - Original day scheduling context (candidates, slots, hours)
 * @param idToAlias - Map of real staffId -> short alias (for prompt consistency)
 * @param lockedAssignments - Assignments that passed validation (immutable)
 * @param failedSlotKeys - Compound keys ("station|startTime|endTime") for failed slots
 * @returns Formatted correction prompt string
 */
export function buildCorrectionPrompt(
  previousOutput: GeneratedDaySchedule,
  errors: string[],
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
  lockedAssignments?: GeneratedShiftAssignment[],
  failedSlotKeys?: Set<string>,
): string {
  const errorList = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");

  const hasLockedState =
    lockedAssignments !== undefined &&
    failedSlotKeys !== undefined &&
    lockedAssignments.length > 0;

  if (hasLockedState) {
    return buildLockedCorrectionPrompt(
      errorList,
      context,
      idToAlias,
      lockedAssignments,
      failedSlotKeys,
    );
  }

  // Fallback: full-context correction (no locked state)
  const originalContext = buildDayUserPrompt(context, idToAlias);

  const aliasedOutput = {
    ...previousOutput,
    assignments: previousOutput.assignments.map((a) => ({
      ...a,
      staffId: idToAlias.get(a.staffId) ?? a.staffId,
    })),
  };

  return `Your previous schedule output for this day contained validation errors that must be fixed.

ORIGINAL SCHEDULING CONTEXT (valid candidates for each slot):
${originalContext}

VALIDATION ERRORS TO FIX:
${errorList}

YOUR PREVIOUS (INVALID) OUTPUT:
${JSON.stringify(aliasedOutput, null, 2)}

INSTRUCTIONS:
- Fix ONLY the assignments flagged above. Keep all valid assignments unchanged.
- You MUST only use staffId aliases from the candidate lists above.
- Do not assign the same staff member to overlapping time slots.
- Output the corrected schedule in the same JSON format.`;
}

/**
 * Build the locked-state correction prompt. Only includes candidates for
 * the failed slots and lists locked assignments so the AI avoids conflicts.
 */
function buildLockedCorrectionPrompt(
  errorList: string,
  context: DaySchedulingContext,
  idToAlias: Map<string, string>,
  lockedAssignments: GeneratedShiftAssignment[],
  failedSlotKeys: Set<string>,
): string {
  const dateStr = context.date.toISOString().split("T")[0];

  // Build the locked assignments section with aliased IDs
  const lockedLines = lockedAssignments.map((a) => {
    const alias = idToAlias.get(a.staffId) ?? a.staffId;
    return `  - ${alias} "${a.staffName}" -> ${a.station} ${a.startTime}-${a.endTime}`;
  });

  // Collect locked staff aliases so the AI knows who is unavailable
  const lockedStaffAliases = new Set(
    lockedAssignments.map((a) => idToAlias.get(a.staffId) ?? a.staffId),
  );

  // Filter context slots to only the failed ones
  const failedSlots = context.slots.filter((sc) => {
    const key = `${sc.slot.station}|${sc.slot.startTime}|${sc.slot.endTime}`;
    return failedSlotKeys.has(key);
  });

  // Build a mini candidate context for just the failed slots
  const slotLines: string[] = [];
  for (let i = 0; i < failedSlots.length; i++) {
    const { slot, candidates, hasSufficientCandidates } = failedSlots[i];

    slotLines.push(
      `[Failed Slot ${i + 1}] ${slot.station} ${slot.startTime}-${slot.endTime} | need:${slot.preferredStaff} min:${slot.minStaff} pri:${slot.priority}`,
    );

    // Filter out candidates who are already locked into another slot
    const availableCandidates = candidates.filter(
      (c) => !lockedStaffAliases.has(idToAlias.get(c.staffId) ?? c.staffId),
    );

    if (availableCandidates.length === 0) {
      slotLines.push("  Candidates: NONE — add to unfilledSlots");
    } else {
      if (!hasSufficientCandidates) {
        slotLines.push(
          `  WARNING: Only ${availableCandidates.length} available candidates (need ${slot.minStaff} min)`,
        );
      }
      slotLines.push(`  Candidates (${availableCandidates.length}):`);
      for (const candidate of availableCandidates) {
        slotLines.push(formatCandidate(candidate, slot.station, idToAlias));
      }
    }
    slotLines.push("");
  }

  return `Your previous schedule output for ${context.dayName}, ${dateStr} contained validation errors. Some assignments were valid and are now LOCKED. You must only fix the failed slots.

LOCKED ASSIGNMENTS (do NOT change, remove, or re-assign these):
${lockedLines.join("\n")}

The staff listed above are already committed. Do NOT assign any of them to additional slots.

FAILED SLOTS TO FIX (provide new assignments for these only):
${slotLines.join("\n")}

VALIDATION ERRORS:
${errorList}

INSTRUCTIONS:
- Your output MUST include ONLY assignments for the FAILED SLOTS listed above.
- Do NOT include the locked assignments in your output — they are already saved.
- You MUST only use staffId aliases from the candidate lists above.
- Do not assign a staff member who is already locked (listed above) to a failed slot.
- Do not assign the same staff member to multiple failed slots.
- If a failed slot cannot be filled, include it in "unfilledSlots".
- Output valid JSON in the same format (assignments, unfilledSlots, notes).`;
}
