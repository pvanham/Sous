from __future__ import annotations

import time
from typing import Optional

from fastapi import FastAPI
from ortools.sat.python import cp_model
from pydantic import BaseModel

# ============================================================
# OR-Tools CP-SAT Schedule Solver Microservice
# ============================================================
# Receives a weekly scheduling problem via POST /solve and
# returns optimal staff-to-shift assignments using Google
# OR-Tools' CP-SAT constraint programming solver.
#
# Mirrors the same constraint set and objective weights as the
# previous GLPK MILP formulation so results are comparable.
# ============================================================

app = FastAPI(title="Sous CP-SAT Solver")

# ────────────────────────────────────────────────────────────
# Constants (match the GLPK formulation weights)
# ────────────────────────────────────────────────────────────

CLOPENING_THRESHOLD_MINUTES = 600  # 10 hours
SOLVER_TIME_LIMIT_SECONDS = 30

# CP-SAT requires integer coefficients. We scale per-match and
# per-slot weights by 60 so that the fairness term (1 per minute
# of max-min spread) maintains the same relative proportion as
# the original formulation (1 per hour).
SCALE = 60
W_PREFERRED_STATION = 3 * SCALE  # 180
W_PREFERRED_TIME = 2 * SCALE  # 120
W_MIN_SHORTFALL = 1000 * SCALE  # 60 000
W_PREF_SHORTFALL = 10 * SCALE  # 600
W_FAIRNESS = 1  # per minute of max-min hours spread


# ────────────────────────────────────────────────────────────
# Pydantic Models -- Request
# ────────────────────────────────────────────────────────────


class CandidateSkill(BaseModel):
    station: str
    proficiency: int


class Candidate(BaseModel):
    staffId: str
    staffName: str
    skills: list[CandidateSkill]
    preference: str
    currentWeekHours: float
    maxHoursPerWeek: float
    minHoursPerWeek: float
    overtimeWarning: bool
    preferredStations: list[str]
    notes: Optional[str] = None


class SlotDefinition(BaseModel):
    station: str
    startTime: str
    endTime: str
    minStaff: int
    preferredStaff: int
    priority: str


class SlotCandidatesInput(BaseModel):
    slot: SlotDefinition
    candidates: list[Candidate]
    hasSufficientCandidates: bool


class DayInput(BaseModel):
    dayIndex: int
    date: Optional[str] = None
    dateStr: str
    dayOfWeek: int
    dayName: str
    slots: list[SlotCandidatesInput]


class SolveRequest(BaseModel):
    days: list[DayInput]
    maxHoursLookup: dict[str, float]
    minHoursLookup: dict[str, float]
    existingWeekHours: dict[str, float]


# ────────────────────────────────────────────────────────────
# Pydantic Models -- Response
# ────────────────────────────────────────────────────────────


class ShiftAssignment(BaseModel):
    staffId: str
    staffName: str
    station: str
    startTime: str
    endTime: str
    reasoning: str


class UnfilledSlot(BaseModel):
    station: str
    startTime: str
    endTime: str
    needed: int
    assigned: int
    reason: str


class DayResult(BaseModel):
    date: str
    dayOfWeek: str
    assignments: list[ShiftAssignment]
    unfilledSlots: list[UnfilledSlot]
    notes: str


class SolveResponse(BaseModel):
    status: str
    days: list[DayResult]
    objectiveValue: int
    solveTimeMs: int


# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _absolute_minutes(day_index: int, t: str) -> int:
    return day_index * 24 * 60 + _time_to_minutes(t)


def _slot_duration_minutes(start: str, end: str) -> int:
    return _time_to_minutes(end) - _time_to_minutes(start)


# ────────────────────────────────────────────────────────────
# Internal types for the flattened problem
# ────────────────────────────────────────────────────────────


class _FlatSlot:
    __slots__ = (
        "idx",
        "day_index",
        "date_str",
        "day_name",
        "station",
        "start_time",
        "end_time",
        "min_staff",
        "preferred_staff",
        "duration_minutes",
        "candidate_staff_idxs",
    )

    def __init__(
        self,
        idx: int,
        day_index: int,
        date_str: str,
        day_name: str,
        station: str,
        start_time: str,
        end_time: str,
        min_staff: int,
        preferred_staff: int,
        duration_minutes: int,
        candidate_staff_idxs: list[int],
    ):
        self.idx = idx
        self.day_index = day_index
        self.date_str = date_str
        self.day_name = day_name
        self.station = station
        self.start_time = start_time
        self.end_time = end_time
        self.min_staff = min_staff
        self.preferred_staff = preferred_staff
        self.duration_minutes = duration_minutes
        self.candidate_staff_idxs = candidate_staff_idxs


class _StaffEntry:
    __slots__ = ("idx", "staff_id", "staff_name", "max_minutes", "existing_minutes")

    def __init__(
        self,
        idx: int,
        staff_id: str,
        staff_name: str,
        max_minutes: int,
        existing_minutes: int,
    ):
        self.idx = idx
        self.staff_id = staff_id
        self.staff_name = staff_name
        self.max_minutes = max_minutes
        self.existing_minutes = existing_minutes


class _CandidateMeta:
    __slots__ = ("is_preferred_station", "is_preferred_time")

    def __init__(self, is_preferred_station: bool, is_preferred_time: bool):
        self.is_preferred_station = is_preferred_station
        self.is_preferred_time = is_preferred_time


# ────────────────────────────────────────────────────────────
# Step 1 -- Transform request into flat solver structures
# ────────────────────────────────────────────────────────────


def _transform_input(
    req: SolveRequest,
) -> tuple[
    list[_FlatSlot],
    list[_StaffEntry],
    dict[tuple[int, int], _CandidateMeta],
    dict[int, list[int]],
    dict[tuple[int, int], list[int]],
    list[tuple[int, int]],
]:
    flat_slots: list[_FlatSlot] = []
    staff_id_to_idx: dict[str, int] = {}
    staff_entries: list[_StaffEntry] = []
    candidate_meta: dict[tuple[int, int], _CandidateMeta] = {}
    staff_to_slots: dict[int, list[int]] = {}
    staff_slots_per_day: dict[tuple[int, int], list[int]] = {}

    for day in req.days:
        for sc in day.slots:
            slot_idx = len(flat_slots)
            dur = _slot_duration_minutes(sc.slot.startTime, sc.slot.endTime)
            candidate_idxs: list[int] = []

            for cand in sc.candidates:
                if cand.staffId not in staff_id_to_idx:
                    s_idx = len(staff_entries)
                    staff_id_to_idx[cand.staffId] = s_idx
                    staff_entries.append(
                        _StaffEntry(
                            idx=s_idx,
                            staff_id=cand.staffId,
                            staff_name=cand.staffName,
                            max_minutes=int(
                                req.maxHoursLookup.get(cand.staffId, 40) * 60
                            ),
                            existing_minutes=int(
                                req.existingWeekHours.get(cand.staffId, 0) * 60
                            ),
                        )
                    )
                    staff_to_slots[s_idx] = []

                s_idx = staff_id_to_idx[cand.staffId]
                candidate_idxs.append(s_idx)

                candidate_meta[(s_idx, slot_idx)] = _CandidateMeta(
                    is_preferred_station=sc.slot.station in cand.preferredStations,
                    is_preferred_time=cand.preference == "preferred",
                )

                staff_to_slots[s_idx].append(slot_idx)

                day_key = (s_idx, day.dayIndex)
                if day_key not in staff_slots_per_day:
                    staff_slots_per_day[day_key] = []
                staff_slots_per_day[day_key].append(slot_idx)

            flat_slots.append(
                _FlatSlot(
                    idx=slot_idx,
                    day_index=day.dayIndex,
                    date_str=day.dateStr,
                    day_name=day.dayName,
                    station=sc.slot.station,
                    start_time=sc.slot.startTime,
                    end_time=sc.slot.endTime,
                    min_staff=sc.slot.minStaff,
                    preferred_staff=sc.slot.preferredStaff,
                    duration_minutes=dur,
                    candidate_staff_idxs=candidate_idxs,
                )
            )

    # Build clopening conflict pairs
    conflicting_pairs: list[tuple[int, int]] = []
    for i in range(len(flat_slots)):
        for j in range(i + 1, len(flat_slots)):
            a = flat_slots[i]
            b = flat_slots[j]

            end_a = _absolute_minutes(a.day_index, a.end_time)
            start_a = _absolute_minutes(a.day_index, a.start_time)
            end_b = _absolute_minutes(b.day_index, b.end_time)
            start_b = _absolute_minutes(b.day_index, b.start_time)

            gap_ab = (start_b - end_a) if start_b > end_a else float("inf")
            gap_ba = (start_a - end_b) if start_a > end_b else float("inf")

            if (
                gap_ab < CLOPENING_THRESHOLD_MINUTES
                or gap_ba < CLOPENING_THRESHOLD_MINUTES
            ):
                conflicting_pairs.append((i, j))

    return (
        flat_slots,
        staff_entries,
        candidate_meta,
        staff_to_slots,
        staff_slots_per_day,
        conflicting_pairs,
    )


# ────────────────────────────────────────────────────────────
# Step 2 -- Build and solve the CP-SAT model
# ────────────────────────────────────────────────────────────


def _build_empty_response(
    req: SolveRequest,
    status: str,
    elapsed_ms: int,
    include_unfilled: bool = False,
) -> SolveResponse:
    sorted_days = sorted(req.days, key=lambda d: d.dayIndex)
    days: list[DayResult] = []
    for day in sorted_days:
        unfilled: list[UnfilledSlot] = []
        if include_unfilled:
            for sc in day.slots:
                unfilled.append(
                    UnfilledSlot(
                        station=sc.slot.station,
                        startTime=sc.slot.startTime,
                        endTime=sc.slot.endTime,
                        needed=sc.slot.preferredStaff,
                        assigned=0,
                        reason=f"CP-SAT solver returned {status}",
                    )
                )
        days.append(
            DayResult(
                date=day.dateStr,
                dayOfWeek=day.dayName,
                assignments=[],
                unfilledSlots=unfilled,
                notes=f"CP-SAT solver: {status}. No feasible solution found."
                if include_unfilled
                else "CP-SAT solver: no slots to fill.",
            )
        )
    return SolveResponse(
        status=status,
        days=days,
        objectiveValue=0,
        solveTimeMs=elapsed_ms,
    )


def _solve_schedule(req: SolveRequest) -> SolveResponse:
    t0 = time.time()

    (
        flat_slots,
        staff_entries,
        candidate_meta,
        staff_to_slots,
        staff_slots_per_day,
        conflicting_pairs,
    ) = _transform_input(req)

    elapsed = lambda: int((time.time() - t0) * 1000)

    if not flat_slots:
        return _build_empty_response(req, "OPTIMAL", elapsed())

    # ── Build CP-SAT model ────────────────────────────────────

    model = cp_model.CpModel()

    # Decision variables: x[(s, t)] = 1 iff staff s assigned to slot t
    x: dict[tuple[int, int], cp_model.IntVar] = {}
    for slot in flat_slots:
        for s_idx in slot.candidate_staff_idxs:
            x[(s_idx, slot.idx)] = model.new_bool_var(f"x_s{s_idx}_t{slot.idx}")

    # Slack variables for coverage shortfall
    smin: dict[int, cp_model.IntVar] = {}
    spref: dict[int, cp_model.IntVar] = {}
    for slot in flat_slots:
        smin[slot.idx] = model.new_int_var(0, slot.min_staff, f"smin_{slot.idx}")
        pref_range = max(0, slot.preferred_staff - slot.min_staff)
        spref[slot.idx] = model.new_int_var(0, pref_range, f"spref_{slot.idx}")

    # Total hours per staff (in minutes) for fairness tracking
    h: dict[int, cp_model.IntVar] = {}
    for staff in staff_entries:
        h[staff.idx] = model.new_int_var(0, staff.max_minutes, f"h_{staff.idx}")

    # ── Constraints ───────────────────────────────────────────

    # 1) Coverage: assigned + slack = preferredStaff
    for slot in flat_slots:
        assigned_vars = [x[(s, slot.idx)] for s in slot.candidate_staff_idxs]
        model.add(
            sum(assigned_vars) + smin[slot.idx] + spref[slot.idx]
            == slot.preferred_staff
        )

    # 2) Hours tracking: h[s] = existingMinutes + sum(duration * x[s,t])
    for staff in staff_entries:
        slot_idxs = staff_to_slots.get(staff.idx, [])
        hour_terms = [
            flat_slots[t].duration_minutes * x[(staff.idx, t)] for t in slot_idxs
        ]
        model.add(h[staff.idx] == staff.existing_minutes + sum(hour_terms))

    # 3) Max hours: enforced by h variable domain upper bound

    # 4) One shift per staff per day
    for (s_idx, _day_idx), slot_idxs in staff_slots_per_day.items():
        if len(slot_idxs) <= 1:
            continue
        model.add(sum(x[(s_idx, t)] for t in slot_idxs) <= 1)

    # 5) Clopening prevention: conflicting slot pairs can't share a staff member
    for i, j in conflicting_pairs:
        set_a = set(flat_slots[i].candidate_staff_idxs)
        for s_idx in flat_slots[j].candidate_staff_idxs:
            if s_idx in set_a:
                model.add(x[(s_idx, i)] + x[(s_idx, j)] <= 1)

    # 6) Fairness: track max and min hours across all staff
    if staff_entries:
        max_possible = max(s.max_minutes for s in staff_entries)
        h_max = model.new_int_var(0, max_possible, "h_max")
        h_min = model.new_int_var(0, max_possible, "h_min")
        model.add_max_equality(h_max, [h[s.idx] for s in staff_entries])
        model.add_min_equality(h_min, [h[s.idx] for s in staff_entries])

    # ── Objective ─────────────────────────────────────────────

    obj_terms: list = []

    for slot in flat_slots:
        for s_idx in slot.candidate_staff_idxs:
            meta = candidate_meta[(s_idx, slot.idx)]
            coeff = 0
            if meta.is_preferred_station:
                coeff += W_PREFERRED_STATION
            if meta.is_preferred_time:
                coeff += W_PREFERRED_TIME
            if coeff > 0:
                obj_terms.append(coeff * x[(s_idx, slot.idx)])

    for slot in flat_slots:
        obj_terms.append(-W_MIN_SHORTFALL * smin[slot.idx])
        obj_terms.append(-W_PREF_SHORTFALL * spref[slot.idx])

    if staff_entries:
        obj_terms.append(-W_FAIRNESS * h_max)
        obj_terms.append(W_FAIRNESS * h_min)

    model.maximize(sum(obj_terms))

    # ── Solve ─────────────────────────────────────────────────

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = SOLVER_TIME_LIMIT_SECONDS
    solver.parameters.num_workers = 4
    status = solver.solve(model)

    status_labels = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN",
    }
    status_label = status_labels.get(status, f"UNKNOWN({status})")
    is_acceptable = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    if not is_acceptable:
        return _build_empty_response(
            req, status_label, elapsed(), include_unfilled=True
        )

    # ── Extract solution ──────────────────────────────────────

    day_assignments: dict[int, list[ShiftAssignment]] = {
        day.dayIndex: [] for day in req.days
    }
    day_unfilled: dict[int, list[UnfilledSlot]] = {
        day.dayIndex: [] for day in req.days
    }

    for slot in flat_slots:
        filled = 0
        for s_idx in slot.candidate_staff_idxs:
            if solver.value(x[(s_idx, slot.idx)]) == 1:
                staff = staff_entries[s_idx]
                meta = candidate_meta[(s_idx, slot.idx)]

                parts: list[str] = []
                if meta.is_preferred_station:
                    parts.append("preferred station")
                if meta.is_preferred_time:
                    parts.append("preferred time")
                if not parts:
                    parts.append("optimal assignment")

                day_assignments[slot.day_index].append(
                    ShiftAssignment(
                        staffId=staff.staff_id,
                        staffName=staff.staff_name,
                        station=slot.station,
                        startTime=slot.start_time,
                        endTime=slot.end_time,
                        reasoning=f"CP-SAT solver: {', '.join(parts)}",
                    )
                )
                filled += 1

        if filled < slot.preferred_staff:
            reason = (
                f"Only {filled} of {slot.min_staff} minimum positions filled"
                if filled < slot.min_staff
                else f"{filled} of {slot.preferred_staff} preferred positions filled"
            )
            day_unfilled[slot.day_index].append(
                UnfilledSlot(
                    station=slot.station,
                    startTime=slot.start_time,
                    endTime=slot.end_time,
                    needed=slot.preferred_staff,
                    assigned=filled,
                    reason=reason,
                )
            )

    obj_value = int(solver.objective_value)
    sorted_days = sorted(req.days, key=lambda d: d.dayIndex)

    return SolveResponse(
        status=status_label,
        days=[
            DayResult(
                date=day.dateStr,
                dayOfWeek=day.dayName,
                assignments=day_assignments[day.dayIndex],
                unfilledSlots=day_unfilled[day.dayIndex],
                notes=(
                    f"CP-SAT solver ({status_label}): "
                    f"{len(day_assignments[day.dayIndex])} assignments, "
                    f"{len(day_unfilled[day.dayIndex])} unfilled. "
                    f"Objective: {obj_value}."
                ),
            )
            for day in sorted_days
        ],
        objectiveValue=obj_value,
        solveTimeMs=elapsed(),
    )


# ────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest) -> SolveResponse:
    return _solve_schedule(req)
