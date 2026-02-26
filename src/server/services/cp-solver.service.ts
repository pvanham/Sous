import type {
  GeneratedDaySchedule,
  WeekSolverInput,
} from "@/types/ai-scheduling";

// ============================================================
// CPSolverService -- OR-Tools CP-SAT via Python Microservice
// ============================================================
// HTTP client that serializes WeekSolverInput, POSTs to the
// FastAPI CP-SAT solver running in Docker, and deserializes
// the response back to GeneratedDaySchedule[].
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models
// - No DB access -- delegates to external solver
// - Input/output use the same types as DeterministicSolverService
// ============================================================

const LOG_PREFIX = "[CPSolver]";

const CP_SOLVER_URL =
  process.env.CP_SOLVER_URL ?? "http://localhost:8000";

const SOLVER_TIMEOUT_MS = 60_000;

// ────────────────────────────────────────────────────────────
// Response types matching the Python SolveResponse schema
// ────────────────────────────────────────────────────────────

interface SolverShiftAssignment {
  staffId: string;
  staffName: string;
  station: string;
  startTime: string;
  endTime: string;
  reasoning: string;
}

interface SolverUnfilledSlot {
  station: string;
  startTime: string;
  endTime: string;
  needed: number;
  assigned: number;
  reason: string;
}

interface SolverDayResult {
  date: string;
  dayOfWeek: string;
  assignments: SolverShiftAssignment[];
  unfilledSlots: SolverUnfilledSlot[];
  notes: string;
}

interface SolverResponse {
  status: string;
  days: SolverDayResult[];
  objectiveValue: number;
  solveTimeMs: number;
}

// ────────────────────────────────────────────────────────────
// Serialization helpers
// ────────────────────────────────────────────────────────────

function mapToRecord(map: Map<string, number>): Record<string, number> {
  const obj: Record<string, number> = {};
  for (const [k, v] of map) {
    obj[k] = v;
  }
  return obj;
}

function serializeInput(input: WeekSolverInput): string {
  const payload = {
    days: input.days.map((day) => ({
      dayIndex: day.dayIndex,
      dateStr: day.dateStr,
      dayOfWeek: day.dayOfWeek,
      dayName: day.dayName,
      slots: day.slots.map((sc) => ({
        slot: sc.slot,
        candidates: sc.candidates,
        hasSufficientCandidates: sc.hasSufficientCandidates,
      })),
    })),
    maxHoursLookup: mapToRecord(input.maxHoursLookup),
    minHoursLookup: mapToRecord(input.minHoursLookup),
    existingWeekHours: mapToRecord(input.existingWeekHours),
  };
  return JSON.stringify(payload);
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export const CPSolverService = {
  async solveWeek(
    input: WeekSolverInput,
  ): Promise<GeneratedDaySchedule[]> {
    const t0 = Date.now();
    const url = `${CP_SOLVER_URL}/solve`;

    const totalSlots = input.days.reduce(
      (sum, d) => sum + d.slots.length,
      0,
    );
    console.log(
      `${LOG_PREFIX} Sending ${totalSlots} slots across ` +
        `${input.days.length} days to CP-SAT solver at ${url}`,
    );

    const body = serializeInput(input);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(SOLVER_TIMEOUT_MS),
      });
    } catch (err) {
      const elapsed = Date.now() - t0;
      const msg =
        err instanceof Error ? err.message : "Unknown fetch error";
      console.error(
        `${LOG_PREFIX} Failed to reach CP-SAT solver (${elapsed}ms): ${msg}`,
      );

      return buildFallbackResponse(input, `Solver unavailable: ${msg}`);
    }

    if (!response.ok) {
      const elapsed = Date.now() - t0;
      const text = await response.text().catch(() => "");
      console.error(
        `${LOG_PREFIX} CP-SAT solver returned HTTP ${response.status} ` +
          `(${elapsed}ms): ${text.slice(0, 500)}`,
      );

      return buildFallbackResponse(
        input,
        `Solver HTTP ${response.status}`,
      );
    }

    const result: SolverResponse = await response.json();
    const elapsed = Date.now() - t0;

    const totalAssignments = result.days.reduce(
      (sum, d) => sum + d.assignments.length,
      0,
    );
    const totalUnfilled = result.days.reduce(
      (sum, d) => sum + d.unfilledSlots.length,
      0,
    );

    console.log(
      `${LOG_PREFIX} CP-SAT status: ${result.status}, ` +
        `objective: ${result.objectiveValue}, ` +
        `${totalAssignments} assignments, ${totalUnfilled} unfilled ` +
        `(solver: ${result.solveTimeMs}ms, total: ${elapsed}ms)`,
    );

    return result.days;
  },
};

function buildFallbackResponse(
  input: WeekSolverInput,
  reason: string,
): GeneratedDaySchedule[] {
  return [...input.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => ({
      date: day.dateStr,
      dayOfWeek: day.dayName,
      assignments: [],
      unfilledSlots: day.slots.map((sc) => ({
        station: sc.slot.station,
        startTime: sc.slot.startTime,
        endTime: sc.slot.endTime,
        needed: sc.slot.preferredStaff,
        assigned: 0,
        reason,
      })),
      notes: `CP-SAT solver: ${reason}. Returning all slots as unfilled.`,
    }));
}
