import type {
  DaySchedulingContext,
  GeneratedDaySchedule,
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
2. You MUST use the exact staffId values from the candidate list. Do not modify or fabricate IDs.
3. A staff member should NOT be assigned to overlapping time slots on the same day. If the same person appears as a candidate for multiple slots, pick them for the slot where they are the best fit and choose someone else for the other slots.
4. Assign up to the "preferredStaff" count for each slot. If fewer candidates are available than needed, assign everyone available and report the shortfall in "unfilledSlots".

SELECTION CRITERIA (in priority order):
1. Staff preferences — Favor candidates whose "preference" is "preferred" over "available". Favor candidates working at their preferredStations.
2. Fair hour distribution — Prefer candidates with fewer currentWeekHours to spread work evenly. Avoid assigning candidates flagged with overtimeWarning unless no alternatives exist.
3. Skill match — Higher proficiency for the target station is better.
4. Clopening avoidance — If previous day closing shifts are provided, avoid assigning someone who closed late the previous night to an early morning slot (less than ${CLOPENING_THRESHOLD_HOURS} hours between shifts).
5. Team balance — Mix experience levels when possible.

For each assignment, provide a brief "reasoning" (1-2 sentences) explaining why you chose that candidate.

OUTPUT FORMAT — respond with a single JSON object matching this exact structure:
{
  "assignments": [
    {
      "staffId": "<exact ID from candidate list>",
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
 * Provides all soft signals the AI needs to make a selection.
 */
function formatCandidate(candidate: CandidateDTO, station: string): string {
  const proficiency =
    candidate.skills.find((s) => s.station === station)?.proficiency ?? 0;
  const isPreferredStation = candidate.preferredStations.includes(station);
  const hoursRemaining =
    candidate.maxHoursPerWeek - candidate.currentWeekHours;

  const flags: string[] = [];
  if (candidate.preference === "preferred") flags.push("PREFERRED_TIME");
  if (isPreferredStation) flags.push("PREFERRED_STATION");
  if (candidate.overtimeWarning) flags.push("OVERTIME_WARNING");

  return [
    `    - ID: ${candidate.staffId}`,
    `      Name: ${candidate.staffName}`,
    `      Proficiency: ${proficiency}/5`,
    `      Preference: ${candidate.preference}`,
    `      Hours this week: ${candidate.currentWeekHours.toFixed(1)} / ${candidate.maxHoursPerWeek} (${hoursRemaining.toFixed(1)} remaining)`,
    isPreferredStation ? `      Preferred station: Yes` : "",
    flags.length > 0 ? `      Flags: [${flags.join(", ")}]` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a closing shift for the clopening warning section.
 */
function formatClosingShift(shift: ShiftDTO): string {
  const endTime = new Date(shift.end);
  const hours = String(endTime.getHours()).padStart(2, "0");
  const minutes = String(endTime.getMinutes()).padStart(2, "0");
  return `  - Staff ID: ${shift.staffId}, ended at ${hours}:${minutes}, station: ${shift.station}`;
}

/**
 * Build the user prompt for a single day's schedule generation.
 * Serializes the DaySchedulingContext into a structured format
 * that the AI can parse and reason about.
 *
 * @param context - The day's scheduling context with pre-filtered candidates
 * @returns Formatted user prompt string
 */
export function buildDayUserPrompt(context: DaySchedulingContext): string {
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
      lines.push(formatClosingShift(shift));
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

    lines.push(`--- Slot ${i + 1}: ${slot.station} ---`);
    lines.push(`  Time: ${slot.startTime} - ${slot.endTime}`);
    lines.push(
      `  Staff needed: ${slot.preferredStaff} preferred (${slot.minStaff} minimum)`
    );
    lines.push(`  Priority: ${slot.priority}`);

    if (candidates.length === 0) {
      lines.push("  Candidates: NONE — add to unfilledSlots");
    } else {
      if (!hasSufficientCandidates) {
        lines.push(
          `  WARNING: Only ${candidates.length} candidates available (need ${slot.minStaff} minimum)`
        );
      }
      lines.push(`  Candidates (${candidates.length}):`);
      for (const candidate of candidates) {
        lines.push(formatCandidate(candidate, slot.station));
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
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      const startStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const endStr = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      lines.push(
        `  - Staff ${shift.staffId}: ${shift.station} ${startStr}-${endStr}`
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
 * Takes the previous AI output and a list of validation errors,
 * and asks the AI to fix the specific issues.
 *
 * This is a stub for Sprint 3.8 (Schedule Validator Service).
 * The self-correction flow will be:
 * 1. Generate → 2. Validate → 3. If errors, feed back via this prompt → 4. Retry
 *
 * @param previousOutput - The AI's previous (invalid) output
 * @param errors - List of specific validation error messages
 * @returns Formatted correction prompt string
 */
export function buildCorrectionPrompt(
  previousOutput: GeneratedDaySchedule,
  errors: string[]
): string {
  const errorList = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");

  return `Your previous schedule output contained the following validation errors:

${errorList}

Here is your previous output that needs correction:
${JSON.stringify(previousOutput, null, 2)}

Please fix ONLY the issues listed above. Keep all valid assignments unchanged.
Output the corrected schedule in the same JSON format as before.`;
}
