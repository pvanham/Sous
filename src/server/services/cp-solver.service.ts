import type {
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  UnfilledSlot,
  WeekSolverInput,
} from "@/types/ai-scheduling";

// ============================================================
// CPSolverService -- Constraint Programming via GLPK MILP
// ============================================================
// Formulates the weekly scheduling problem as a Mixed Integer
// Linear Program (MILP) and solves it using the GLPK WASM
// solver (glpk.js). Produces the same output interface as the
// greedy DeterministicSolverService so the two are
// interchangeable.
//
// Architecture: Service Layer (per ARCHITECTURE.md)
// - Does NOT import Mongoose models
// - No DB access -- pure functions only
// - Input/output use the same types as DeterministicSolverService
// ============================================================

const LOG_PREFIX = "[CPSolver]";
const CLOPENING_THRESHOLD_MINUTES = 600;
const SOLVER_TIME_LIMIT_SECONDS = 30;

const W_PREFERRED_STATION = 3;
const W_PREFERRED_TIME = 2;
const W_MIN_SHORTFALL = 1000;
const W_PREF_SHORTFALL = 10;
const W_FAIRNESS = 1;

// ────────────────────────────────────────────────────────────
// Internal types
// ────────────────────────────────────────────────────────────

interface FlatSlot {
  idx: number;
  dayIndex: number;
  dateStr: string;
  dayName: string;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  durationHours: number;
  candidateStaffIdxs: number[];
}

interface StaffEntry {
  idx: number;
  staffId: string;
  staffName: string;
  maxHoursPerWeek: number;
  existingHours: number;
}

interface CandidateMeta {
  isPreferredStation: boolean;
  isPreferredTime: boolean;
}

interface TransformedData {
  flatSlots: FlatSlot[];
  staffEntries: StaffEntry[];
  candidateMeta: Map<string, CandidateMeta>;
  staffToSlots: Map<number, number[]>;
  staffSlotsPerDay: Map<string, number[]>;
  conflictingPairs: Array<[number, number]>;
}

// ────────────────────────────────────────────────────────────
// GLPK instance (async WASM init, cached for process life)
// ────────────────────────────────────────────────────────────

type GLPKInstance = Awaited<ReturnType<typeof import("glpk.js")["default"]>>;

let cachedGlpk: GLPKInstance | null = null;

async function getGlpk(): Promise<GLPKInstance> {
  if (!cachedGlpk) {
    const { default: loader } = await import("glpk.js");
    cachedGlpk = await loader();
  }
  return cachedGlpk;
}

// ────────────────────────────────────────────────────────────
// Utility helpers
// ────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function slotDurationHours(startTime: string, endTime: string): number {
  const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
  return Math.round((mins / 60) * 10000) / 10000;
}

function absoluteMinutes(dayIndex: number, time: string): number {
  return dayIndex * 24 * 60 + timeToMinutes(time);
}

// ────────────────────────────────────────────────────────────
// Variable name helpers
// ────────────────────────────────────────────────────────────

function vX(sIdx: number, tIdx: number): string {
  return `x_s${sIdx}_t${tIdx}`;
}
function vSmin(tIdx: number): string {
  return `smin_t${tIdx}`;
}
function vSpref(tIdx: number): string {
  return `spref_t${tIdx}`;
}
function vH(sIdx: number): string {
  return `h_s${sIdx}`;
}

// ────────────────────────────────────────────────────────────
// Step 1 -- Transform WeekSolverInput into flat ILP structures
// ────────────────────────────────────────────────────────────

function transformInput(input: WeekSolverInput): TransformedData {
  const flatSlots: FlatSlot[] = [];
  const staffIdToIdx = new Map<string, number>();
  const staffEntries: StaffEntry[] = [];
  const candidateMeta = new Map<string, CandidateMeta>();
  const staffToSlots = new Map<number, number[]>();
  const staffSlotsPerDay = new Map<string, number[]>();

  for (const day of input.days) {
    for (const sc of day.slots) {
      const slotIdx = flatSlots.length;
      const dur = slotDurationHours(sc.slot.startTime, sc.slot.endTime);
      const candidateStaffIdxs: number[] = [];

      for (const cand of sc.candidates) {
        if (!staffIdToIdx.has(cand.staffId)) {
          const sIdx = staffEntries.length;
          staffIdToIdx.set(cand.staffId, sIdx);
          staffEntries.push({
            idx: sIdx,
            staffId: cand.staffId,
            staffName: cand.staffName,
            maxHoursPerWeek:
              input.maxHoursLookup.get(cand.staffId) ?? 40,
            existingHours:
              input.existingWeekHours.get(cand.staffId) ?? 0,
          });
          staffToSlots.set(sIdx, []);
        }

        const sIdx = staffIdToIdx.get(cand.staffId)!;
        candidateStaffIdxs.push(sIdx);

        candidateMeta.set(`${sIdx}_${slotIdx}`, {
          isPreferredStation: cand.preferredStations.includes(
            sc.slot.station,
          ),
          isPreferredTime: cand.preference === "preferred",
        });

        staffToSlots.get(sIdx)!.push(slotIdx);

        const dayKey = `${sIdx}_${day.dayIndex}`;
        if (!staffSlotsPerDay.has(dayKey)) {
          staffSlotsPerDay.set(dayKey, []);
        }
        staffSlotsPerDay.get(dayKey)!.push(slotIdx);
      }

      flatSlots.push({
        idx: slotIdx,
        dayIndex: day.dayIndex,
        dateStr: day.dateStr,
        dayName: day.dayName,
        station: sc.slot.station,
        startTime: sc.slot.startTime,
        endTime: sc.slot.endTime,
        minStaff: sc.slot.minStaff,
        preferredStaff: sc.slot.preferredStaff,
        durationHours: dur,
        candidateStaffIdxs,
      });
    }
  }

  const conflictingPairs: Array<[number, number]> = [];

  for (let i = 0; i < flatSlots.length; i++) {
    for (let j = i + 1; j < flatSlots.length; j++) {
      const a = flatSlots[i];
      const b = flatSlots[j];

      const endA = absoluteMinutes(a.dayIndex, a.endTime);
      const startA = absoluteMinutes(a.dayIndex, a.startTime);
      const endB = absoluteMinutes(b.dayIndex, b.endTime);
      const startB = absoluteMinutes(b.dayIndex, b.startTime);

      const gapAB = startB > endA ? startB - endA : Infinity;
      const gapBA = startA > endB ? startA - endB : Infinity;

      if (
        gapAB < CLOPENING_THRESHOLD_MINUTES ||
        gapBA < CLOPENING_THRESHOLD_MINUTES
      ) {
        conflictingPairs.push([i, j]);
      }
    }
  }

  return {
    flatSlots,
    staffEntries,
    candidateMeta,
    staffToSlots,
    staffSlotsPerDay,
    conflictingPairs,
  };
}

// ────────────────────────────────────────────────────────────
// Step 2 -- Build GLPK model object
// ────────────────────────────────────────────────────────────

interface GLPKVar {
  name: string;
  coef: number;
}
interface GLPKConstraint {
  name: string;
  vars: GLPKVar[];
  bnds: { type: number; ub: number; lb: number };
}
interface GLPKBound {
  name: string;
  type: number;
  ub: number;
  lb: number;
}
interface GLPKModel {
  name: string;
  objective: {
    direction: number;
    name: string;
    vars: GLPKVar[];
  };
  subjectTo: GLPKConstraint[];
  bounds: GLPKBound[];
  binaries: string[];
  generals: string[];
}

function buildGLPKModel(data: TransformedData, glpk: GLPKInstance): GLPKModel {
  const {
    flatSlots,
    staffEntries,
    candidateMeta,
    staffToSlots,
    staffSlotsPerDay,
    conflictingPairs,
  } = data;

  const objVars: GLPKVar[] = [];
  const subjectTo: GLPKConstraint[] = [];
  const bounds: GLPKBound[] = [];
  const binaryVars: string[] = [];
  const generalVars: string[] = [];

  // ── Objective ───────────────────────────────────────────
  for (const slot of flatSlots) {
    for (const sIdx of slot.candidateStaffIdxs) {
      const meta = candidateMeta.get(`${sIdx}_${slot.idx}`)!;
      let coeff = 0;
      if (meta.isPreferredStation) coeff += W_PREFERRED_STATION;
      if (meta.isPreferredTime) coeff += W_PREFERRED_TIME;
      if (coeff > 0) {
        objVars.push({ name: vX(sIdx, slot.idx), coef: coeff });
      }
    }
  }

  for (const slot of flatSlots) {
    objVars.push({ name: vSmin(slot.idx), coef: -W_MIN_SHORTFALL });
    objVars.push({ name: vSpref(slot.idx), coef: -W_PREF_SHORTFALL });
  }

  if (staffEntries.length > 0) {
    objVars.push({ name: "hmax", coef: -W_FAIRNESS });
    objVars.push({ name: "hmin", coef: W_FAIRNESS });
  }

  // ── Constraints ─────────────────────────────────────────

  // 1) Coverage: sum(x) + smin + spref = preferredStaff
  for (const slot of flatSlots) {
    const vars: GLPKVar[] = slot.candidateStaffIdxs.map((sIdx) => ({
      name: vX(sIdx, slot.idx),
      coef: 1,
    }));
    vars.push({ name: vSmin(slot.idx), coef: 1 });
    vars.push({ name: vSpref(slot.idx), coef: 1 });
    subjectTo.push({
      name: `cov_t${slot.idx}`,
      vars,
      bnds: {
        type: glpk.GLP_FX,
        lb: slot.preferredStaff,
        ub: slot.preferredStaff,
      },
    });
  }

  // 2) Hours tracking: h_s - sum(dur * x) = existingHours
  for (const staff of staffEntries) {
    const slots = staffToSlots.get(staff.idx);
    const vars: GLPKVar[] = [{ name: vH(staff.idx), coef: 1 }];
    if (slots) {
      for (const tIdx of slots) {
        vars.push({
          name: vX(staff.idx, tIdx),
          coef: -flatSlots[tIdx].durationHours,
        });
      }
    }
    subjectTo.push({
      name: `hrs_s${staff.idx}`,
      vars,
      bnds: {
        type: glpk.GLP_FX,
        lb: staff.existingHours,
        ub: staff.existingHours,
      },
    });
  }

  // 3) Max hours: h_s <= maxHoursPerWeek
  for (const staff of staffEntries) {
    subjectTo.push({
      name: `maxhrs_s${staff.idx}`,
      vars: [{ name: vH(staff.idx), coef: 1 }],
      bnds: {
        type: glpk.GLP_UP,
        lb: 0,
        ub: staff.maxHoursPerWeek,
      },
    });
  }

  // 4) One shift per day
  for (const [dayKey, slotIdxs] of staffSlotsPerDay) {
    if (slotIdxs.length <= 1) continue;
    const [sStr, dStr] = dayKey.split("_");
    const sIdx = parseInt(sStr);
    subjectTo.push({
      name: `oneshift_s${sIdx}_d${dStr}`,
      vars: slotIdxs.map((tIdx) => ({ name: vX(sIdx, tIdx), coef: 1 })),
      bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
    });
  }

  // 5) Clopening prevention
  let clopenId = 0;
  for (const [idxA, idxB] of conflictingPairs) {
    const setA = new Set(flatSlots[idxA].candidateStaffIdxs);
    for (const sIdx of flatSlots[idxB].candidateStaffIdxs) {
      if (setA.has(sIdx)) {
        subjectTo.push({
          name: `clopen_${clopenId++}`,
          vars: [
            { name: vX(sIdx, idxA), coef: 1 },
            { name: vX(sIdx, idxB), coef: 1 },
          ],
          bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
        });
      }
    }
  }

  // 6) hmax / hmin linkage
  if (staffEntries.length > 0) {
    for (const staff of staffEntries) {
      subjectTo.push({
        name: `hmaxlink_s${staff.idx}`,
        vars: [
          { name: "hmax", coef: 1 },
          { name: vH(staff.idx), coef: -1 },
        ],
        bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 },
      });
      subjectTo.push({
        name: `hminlink_s${staff.idx}`,
        vars: [
          { name: vH(staff.idx), coef: 1 },
          { name: "hmin", coef: -1 },
        ],
        bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 },
      });
    }
  }

  // ── Bounds ──────────────────────────────────────────────
  for (const slot of flatSlots) {
    bounds.push({
      name: vSmin(slot.idx),
      type: glpk.GLP_DB,
      lb: 0,
      ub: slot.minStaff,
    });
    const prefRange = Math.max(0, slot.preferredStaff - slot.minStaff);
    bounds.push({
      name: vSpref(slot.idx),
      type: glpk.GLP_DB,
      lb: 0,
      ub: prefRange,
    });
  }

  for (const staff of staffEntries) {
    bounds.push({
      name: vH(staff.idx),
      type: glpk.GLP_DB,
      lb: 0,
      ub: staff.maxHoursPerWeek,
    });
  }

  if (staffEntries.length > 0) {
    const cap = Math.max(...staffEntries.map((s) => s.maxHoursPerWeek));
    bounds.push({ name: "hmax", type: glpk.GLP_DB, lb: 0, ub: cap });
    bounds.push({ name: "hmin", type: glpk.GLP_DB, lb: 0, ub: cap });
  }

  // ── Variable type declarations ──────────────────────────
  for (const slot of flatSlots) {
    for (const sIdx of slot.candidateStaffIdxs) {
      binaryVars.push(vX(sIdx, slot.idx));
    }
  }
  for (const slot of flatSlots) {
    generalVars.push(vSmin(slot.idx));
    generalVars.push(vSpref(slot.idx));
  }

  return {
    name: "CPSchedule",
    objective: {
      direction: glpk.GLP_MAX,
      name: "obj",
      vars: objVars,
    },
    subjectTo,
    bounds,
    binaries: binaryVars,
    generals: generalVars,
  };
}

// ────────────────────────────────────────────────────────────
// Step 3 -- Extract solution into GeneratedDaySchedule[]
// ────────────────────────────────────────────────────────────

function extractSolution(
  vars: Record<string, number>,
  data: TransformedData,
  input: WeekSolverInput,
  statusLabel: string,
  objectiveValue: number,
): GeneratedDaySchedule[] {
  const { flatSlots, staffEntries, candidateMeta } = data;

  const dayAssignments = new Map<number, GeneratedShiftAssignment[]>();
  const dayUnfilled = new Map<number, UnfilledSlot[]>();

  for (const day of input.days) {
    dayAssignments.set(day.dayIndex, []);
    dayUnfilled.set(day.dayIndex, []);
  }

  for (const slot of flatSlots) {
    let filled = 0;

    for (const sIdx of slot.candidateStaffIdxs) {
      const val = vars[vX(sIdx, slot.idx)] ?? 0;
      if (val >= 0.5) {
        const staff = staffEntries[sIdx];
        const meta = candidateMeta.get(`${sIdx}_${slot.idx}`);

        const parts: string[] = [];
        if (meta?.isPreferredStation) parts.push("preferred station");
        if (meta?.isPreferredTime) parts.push("preferred time");
        if (parts.length === 0) parts.push("optimal assignment");

        dayAssignments.get(slot.dayIndex)!.push({
          staffId: staff.staffId,
          staffName: staff.staffName,
          station: slot.station,
          startTime: slot.startTime,
          endTime: slot.endTime,
          reasoning: `CP solver: ${parts.join(", ")}`,
        });
        filled++;
      }
    }

    if (filled < slot.preferredStaff) {
      dayUnfilled.get(slot.dayIndex)!.push({
        station: slot.station,
        startTime: slot.startTime,
        endTime: slot.endTime,
        needed: slot.preferredStaff,
        assigned: filled,
        reason:
          filled < slot.minStaff
            ? `Only ${filled} of ${slot.minStaff} minimum positions filled`
            : `${filled} of ${slot.preferredStaff} preferred positions filled`,
      });
    }
  }

  const sortedDays = [...input.days].sort((a, b) => a.dayIndex - b.dayIndex);
  return sortedDays.map((day) => {
    const assignments = dayAssignments.get(day.dayIndex) ?? [];
    const unfilled = dayUnfilled.get(day.dayIndex) ?? [];
    return {
      date: day.dateStr,
      dayOfWeek: day.dayName,
      assignments,
      unfilledSlots: unfilled,
      notes:
        `CP solver (${statusLabel}): ${assignments.length} assignments, ` +
        `${unfilled.length} unfilled. Objective: ${Math.round(objectiveValue)}.`,
    };
  });
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export const CPSolverService = {
  async solveWeek(
    input: WeekSolverInput,
  ): Promise<GeneratedDaySchedule[]> {
    const t0 = Date.now();

    const data = transformInput(input);

    console.log(
      `${LOG_PREFIX} Transformed: ${data.flatSlots.length} slots, ` +
        `${data.staffEntries.length} staff, ` +
        `${data.conflictingPairs.length} clopening pairs ` +
        `(${Date.now() - t0}ms)`,
    );

    if (data.flatSlots.length === 0) {
      return [...input.days]
        .sort((a, b) => a.dayIndex - b.dayIndex)
        .map((day) => ({
          date: day.dateStr,
          dayOfWeek: day.dayName,
          assignments: [],
          unfilledSlots: [],
          notes: "CP solver: no slots to fill.",
        }));
    }

    const glpk = await getGlpk();
    const model = buildGLPKModel(data, glpk);

    console.log(
      `${LOG_PREFIX} GLPK model built: ${model.subjectTo.length} constraints, ` +
        `${model.binaries.length} binary vars, ` +
        `${model.generals.length} general vars (${Date.now() - t0}ms)`,
    );

    const solution = await glpk.solve(model, {
      msglev: glpk.GLP_MSG_ERR,
      tmlim: SOLVER_TIME_LIMIT_SECONDS,
      presol: true,
    });

    const elapsed = Date.now() - t0;

    const statusLabels: Record<number, string> = {
      [glpk.GLP_OPT]: "Optimal",
      [glpk.GLP_FEAS]: "Feasible",
      [glpk.GLP_INFEAS]: "Infeasible",
      [glpk.GLP_NOFEAS]: "No feasible solution",
      [glpk.GLP_UNBND]: "Unbounded",
      [glpk.GLP_UNDEF]: "Undefined",
    };
    const statusLabel =
      statusLabels[solution.result.status] ?? `Unknown(${solution.result.status})`;

    console.log(
      `${LOG_PREFIX} GLPK status: ${statusLabel}, ` +
        `objective: ${solution.result.z} (${elapsed}ms total)`,
    );

    const isAcceptable =
      solution.result.status === glpk.GLP_OPT ||
      solution.result.status === glpk.GLP_FEAS;

    if (!isAcceptable) {
      console.warn(
        `${LOG_PREFIX} Non-optimal status "${statusLabel}". ` +
          "Returning all slots as unfilled.",
      );
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
            reason: `CP solver returned ${statusLabel}`,
          })),
          notes: `CP solver: ${statusLabel}. No feasible solution found.`,
        }));
    }

    return extractSolution(
      solution.result.vars,
      data,
      input,
      statusLabel,
      solution.result.z,
    );
  },
};
