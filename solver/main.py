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
SCALE = 60

# The coverage weights remain static hard-constraints disguised as soft constraints.
W_MIN_SHORTFALL = 100000000  # 100,000,000
W_PREF_SHORTFALL = 10000000  # 10,000,000
W_MIN_HOURS_SHORTFALL = 5 * SCALE  # 300 -- penalise staff below their weekly minimum


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
    roles: list[str] = []
    hourlyRate: Optional[float] = None
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


class ScheduleSettings(BaseModel):
    allowClopening: bool = False
    clopeningThresholdMinutes: int = 600
    overtimeThresholdHours: int = 40
    overtimePolicy: str = "avoid"
    softConstraintPriority: list[str] = ["preferences", "fairness", "cost"]

class SolveRequest(BaseModel):
    days: list[DayInput]
    maxHoursLookup: dict[str, float]
    minHoursLookup: dict[str, float]
    existingWeekHours: dict[str, float]
    settings: Optional[ScheduleSettings] = None


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
    overtimeSummary: dict[str, int] = {}
    totalCostCents: int = 0
    fallbackRatesUsed: bool = False


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
    __slots__ = ("idx", "staff_id", "staff_name", "max_minutes", "min_minutes", "existing_minutes", "resolved_rate")

    def __init__(
        self,
        idx: int,
        staff_id: str,
        staff_name: str,
        max_minutes: int,
        min_minutes: int,
        existing_minutes: int,
        resolved_rate: float,
    ):
        self.idx = idx
        self.staff_id = staff_id
        self.staff_name = staff_name
        self.max_minutes = max_minutes
        self.min_minutes = min_minutes
        self.existing_minutes = existing_minutes
        self.resolved_rate = resolved_rate


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
    bool,
]:
    flat_slots: list[_FlatSlot] = []
    staff_id_to_idx: dict[str, int] = {}
    staff_entries: list[_StaffEntry] = []
    candidate_meta: dict[tuple[int, int], _CandidateMeta] = {}
    staff_to_slots: dict[int, list[int]] = {}
    staff_slots_per_day: dict[tuple[int, int], list[int]] = {}
    fallback_rates_used = False

    # Pre-process rates
    role_totals: dict[str, dict[str, float]] = {}
    global_sum = 0.0
    global_count = 0
    
    unique_candidates: dict[str, Candidate] = {}
    for day in req.days:
        for sc in day.slots:
            for cand in sc.candidates:
                if cand.staffId not in unique_candidates:
                    unique_candidates[cand.staffId] = cand
                    if cand.hourlyRate is not None and cand.hourlyRate > 0:
                        global_sum += cand.hourlyRate
                        global_count += 1
                        for role in cand.roles:
                            if role not in role_totals:
                                role_totals[role] = {"sum": 0.0, "count": 0}
                            role_totals[role]["sum"] += cand.hourlyRate
                            role_totals[role]["count"] += 1

    global_avg = global_sum / global_count if global_count > 0 else 15.00

    resolved_rates: dict[str, float] = {}
    for cand_id, cand in unique_candidates.items():
        if cand.hourlyRate is None or cand.hourlyRate <= 0:
            fallback_rates_used = True
            rate_to_use = 0.0
            
            # Try to grab highest average role
            role_avgs = []
            for role in cand.roles:
                if role in role_totals and role_totals[role]["count"] > 0:
                    role_avgs.append(role_totals[role]["sum"] / role_totals[role]["count"])
            
            if role_avgs:
                rate_to_use = max(role_avgs)
            else:
                rate_to_use = global_avg
            resolved_rates[cand_id] = rate_to_use
        else:
            resolved_rates[cand_id] = cand.hourlyRate

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
                            min_minutes=int(
                                req.minHoursLookup.get(cand.staffId, 0) * 60
                            ),
                            existing_minutes=int(
                                req.existingWeekHours.get(cand.staffId, 0) * 60
                            ),
                            resolved_rate=resolved_rates[cand.staffId],
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

    # Build clopening conflict pairs (skip entirely when clopening is allowed)
    conflicting_pairs: list[tuple[int, int]] = []
    allow_clopening = req.settings.allowClopening if req.settings else False
    threshold_minutes = (
        req.settings.clopeningThresholdMinutes
        if req.settings
        else CLOPENING_THRESHOLD_MINUTES
    )

    if not allow_clopening:
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
                    gap_ab < threshold_minutes
                    or gap_ba < threshold_minutes
                ):
                    conflicting_pairs.append((i, j))

    return (
        flat_slots,
        staff_entries,
        candidate_meta,
        staff_to_slots,
        staff_slots_per_day,
        conflicting_pairs,
        fallback_rates_used,
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
        overtimeSummary={},
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
        fallback_rates_used,
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

    # ── Overtime Policy Variables ─────────────────────────────
    # Policies: "strict" (hard constraint), "avoid" (high penalty), "allowed" (no penalty)
    ot: dict[int, cp_model.IntVar] = {}
    
    # Safely get settings
    policy = req.settings.overtimePolicy if req.settings else "avoid"
    threshold_minutes = (req.settings.overtimeThresholdHours * 60) if req.settings else (40 * 60)
    
    # 1. Strict Policy -> Enforced via upper bound on existing h variables
    if policy == "strict":
        for staff in staff_entries:
            model.add(h[staff.idx] <= threshold_minutes)
    
    # 2. Avoid Policy -> Soft constraint with a massive penalty
    elif policy == "avoid":
        for staff in staff_entries:
            ot[staff.idx] = model.new_int_var(0, staff.max_minutes, f"ot_{staff.idx}")
            model.add(ot[staff.idx] >= h[staff.idx] - threshold_minutes)

    # Min-hours shortfall slack: under[s] >= min_minutes - h[s]
    under: dict[int, cp_model.IntVar] = {}
    for staff in staff_entries:
        if staff.min_minutes > 0:
            under[staff.idx] = model.new_int_var(
                0, staff.min_minutes, f"under_{staff.idx}"
            )
            model.add(under[staff.idx] >= staff.min_minutes - h[staff.idx])

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

    # ── Ranked Soft Constraints (Preferences, Fairness, Cost) ──
    # User ranks: 1st (x3.0), 2nd (x1.5), 3rd (x0.5)
    ranks = req.settings.softConstraintPriority if req.settings else ["preferences", "fairness", "cost"]
    
    # Safely handle missing/malformed arrays
    if not ranks or len(ranks) != 3:
        ranks = ["preferences", "fairness", "cost"]
        
    multipliers = {
        ranks[0]: 3.0,
        ranks[1]: 1.5,
        ranks[2]: 0.5
    }
    
    obj_terms: list = []

    # 1. Preferences (Base: 4,000 station + 2,500 time match)
    pref_mult = multipliers.get("preferences", 1)
    
    for slot in flat_slots:
        for s_idx in slot.candidate_staff_idxs:
            meta = candidate_meta[(s_idx, slot.idx)]
            coeff = 0
            if meta.is_preferred_station:
                coeff += 4000 * pref_mult
            if meta.is_preferred_time:
                coeff += 2500 * pref_mult
            if coeff > 0:
                obj_terms.append(coeff * x[(s_idx, slot.idx)])

    # 2. Fairness (Base: -10 per minute of spread ≈ -600 per hour)
    fair_mult = multipliers.get("fairness", 1)
    fairness_penalty_per_min = 10 * fair_mult
    
    if staff_entries:
        obj_terms.append(-fairness_penalty_per_min * h_max)
        obj_terms.append(fairness_penalty_per_min * h_min)

    # 3. Labor Cost (Base: -100 per $1)
    # Important: Cost should only penalize NEWLY ASSIGNED hours, not existing hours!
    cost_mult = multipliers.get("cost", 1)
    
    new_h: dict[int, cp_model.IntVar] = {}
    for staff in staff_entries:
        slot_idxs = staff_to_slots.get(staff.idx, [])
        hour_terms = [
            flat_slots[t].duration_minutes * x[(staff.idx, t)] for t in slot_idxs
        ]
        
        # Track only newly assigned minutes for this staff member
        new_h[staff.idx] = model.new_int_var(0, staff.max_minutes, f"new_h_{staff.idx}")
        model.add(new_h[staff.idx] == sum(hour_terms))
        
        # staff.resolved_rate is $/hr. Cost per minute is rate / 60.
        # Base penalty is -100 per $1.
        # Penalty per minute = (rate / 60) * 100 * cost_mult
        cost_penalty_per_min = int((staff.resolved_rate * 100 / 60) * cost_mult)
        if cost_penalty_per_min > 0:
            obj_terms.append(-cost_penalty_per_min * new_h[staff.idx])

    # ── Hard Coverage & Min-Hours Constraints (Massive Penalties) ──
    
    for slot in flat_slots:
        obj_terms.append(-W_MIN_SHORTFALL * smin[slot.idx])
        obj_terms.append(-W_PREF_SHORTFALL * spref[slot.idx])

    # Min-hours shortfall penalty
    for staff in staff_entries:
        if staff.idx in under:
            obj_terms.append(-W_MIN_HOURS_SHORTFALL * under[staff.idx])

    # Overtime "Avoid" Policy penalty (5,000 per OT minute)
    # An 8 hour overtime shift = 480 mins * 5,000 = 2,400,000 penalty.
    # High enough to deter, but not so high it breaks solver coverage weights.
    if policy == "avoid":
        for staff in staff_entries:
            obj_terms.append(-5000 * ot[staff.idx])

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

    overtime_summary: dict[str, int] = {}
    total_cost_cents = 0

    for staff in staff_entries:
        val = solver.value(h[staff.idx])
        overtime_summary[staff.staff_id] = max(0, val - threshold_minutes)
        # Calculate final cost
        total_cost_cents += int((val / 60) * staff.resolved_rate * 100)

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
        overtimeSummary=overtime_summary,
        totalCostCents=total_cost_cents,
        fallbackRatesUsed=fallback_rates_used,
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
