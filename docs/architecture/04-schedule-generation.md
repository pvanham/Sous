# 04 — Schedule Generation (CP-SAT Solver)

> How Sous turns labor requirements, staff availability, and HR
> constraints into an optimal weekly schedule using Google OR-Tools
> CP-SAT. This document covers the **deterministic** generation pipeline
> — for the AI chat orchestrator that *proposes* generations, see
> [07-ai-orchestrator.md](./07-ai-orchestrator.md).

---

## Architecture at a glance

```
Action: schedule-generation.actions.ts
  └─► SchedulingAgentService (orchestrator)
        ├─► CandidateService       (hard-filter per slot, per day)
        ├─► CPSolverService        (HTTP → Python FastAPI microservice)
        │     └─► OR-Tools CP-SAT, returns assignment per day
        └─► ScheduleValidatorService
              ├─ validate()         (hard-constraint re-check)
              ├─ scoreQuality()     (0–100 quality score)
              └─ checkUnderScheduled() (min-hours warnings)

Output: Shifts persisted via ShiftService.createMany()
        + GenerationMetadata (quality, warnings, cost)
```

The whole pipeline is orchestrated from a single Server Action and, in
practice, from the **AI async task** pathway (see below) so it doesn't
block the chat stream.

---

## Step 1 — Candidate pre-filter (`CandidateService`)

For every `(day × station × time-slot)` in the target week, the
`CandidateService` builds a list of staff who can plausibly work that
slot. This is a **hard-filter** (binary accept/reject) step that shrinks
the CP problem before we call the solver.

Filters applied per staff member:

- **Approved time-off** intersecting the slot → reject.
- **StaffAvailability.preference === "unavailable"** for the day → reject.
- **No skill** for the station → reject.
- **Overlapping shift** already on this staff member for the week → reject.
- **Overtime breach** (projected weekly hours exceed `maxHoursPerWeek`)
  → reject.
- **Clopening** (<10h since last end-of-shift) → reject.

Remaining staff are carried into the solver with their preference
weights (`preferred` > `available`) and soft targets
(`preferredStations`, `minHoursPerWeek`, `maxHoursPerWeek`).

---

## Step 2 — CP-SAT solve (`CPSolverService` + `solver/main.py`)

The web app never solves anything in Node. It packages the candidates
and constraints into a JSON payload and POSTs to the Python FastAPI
service at `CP_SOLVER_URL` (default `http://localhost:8000`).

```
POST /solve/week
  ├─ kitchenConfig (stations, hours)
  ├─ laborRequirements (demand)
  ├─ staffAvailability (supply)
  ├─ staff (skills, hourlyRate, min/max hours, preferences)
  ├─ candidatesByDay (pre-filtered)
  └─ weekStartDate

← response
  ├─ solverStatus: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | …
  ├─ objectiveValue
  ├─ solveTimeMs
  ├─ totalCostCents
  ├─ overtimeSummary
  ├─ assignments: [{ dayOfWeek, shifts: [{ staffId, station, start, end }] }]
  └─ suggestedRelaxations (on infeasible)
```

The solver lives in `solver/main.py` and runs in Docker via the
`solver/Dockerfile`. It is a **stateless** service — all context is in
the request body. No DB access.

### Constraints the solver enforces

Hard:

- Every assigned slot respects operating hours and station list from
  `KitchenConfig`.
- Each staff's weekly hours ≤ `maxHoursPerWeek`.
- Approved time-off → no assignment.
- Clopening gap ≥10h.
- At most one shift per staff at any instant.

Soft (objective):

- Prefer staff whose `preferredStations` / skills match.
- Respect `StaffAvailability.preference === "preferred"`.
- Minimize total labor cost (`hourlyRate` × hours).
- Keep everyone above `minHoursPerWeek` (penalty for gap).

### Infeasibility

When the solver returns `INFEASIBLE`, the response includes
`suggestedRelaxations` and `likelyCauses`. The orchestrator surfaces
these through `infeasibility-analyzer.ts`, which can ask the LLM to
turn them into a user-readable explanation. This is the **only** place
the schedule generation pipeline touches the LLM.

---

## Step 3 — Validate and score (`ScheduleValidatorService`)

Even on a successful solve the orchestrator runs the solver's output
back through a validator to catch wire-format mistakes and score
quality for the UI:

- `validate()` — re-checks every shift against operating hours, the
  station list, clopening, and overtime. Returns `ValidationError[]`
  (hard, blocks save) and `ValidationWarning[]` (soft, UI surface).
- `scoreQuality()` — returns `{ score: 0..100, breakdown: … }` used
  by `GenerationMetadata`.
- `checkUnderScheduled()` — flags staff below `minHoursPerWeek` so the
  UI can suggest coverage swaps.

---

## Step 4 — Persist (`ShiftService.createMany`)

Accepted assignments are written as a batch of `Shift` documents under
the generated (`DRAFT`) `Schedule`. No writes until step 3 passes
hard validation.

---

## Async execution path

Schedule generation typically takes 2–10 seconds for a single week —
too long for a blocking Server Action and definitely too long for a
chat stream. The AI orchestrator uses an `AsyncTask` wrapper:

1. User asks the AI to "generate next week's schedule".
2. The `propose_schedule_generation` tool enqueues an `AsyncTask`
   (`taskType: "schedule_generation"`) and returns a proposal pointing
   at `taskId`.
3. A background worker (the action handler, effectively) picks up the
   task, runs the full 4-step pipeline above, and writes the result
   onto the task.
4. The client polls `/api/ai/tasks/[taskId]/status`; when
   `status === "completed"`, the UI surfaces a follow-up
   `propose_accept_generated_schedule` proposal.
5. Accepting that proposal creates the shifts via `ShiftService`.

See [07-ai-orchestrator.md](./07-ai-orchestrator.md) for the proposal
and async-task mechanics.

---

## Costing and LLM usage

- `AIUsageLog` captures any LLM calls made during generation (prompts
  for the optimizer narrative and the infeasibility analyzer). These
  count against the org's monthly allotment via `ai-usage.service.ts`.
- Solver costs are **not** LLM costs — they're reported only in
  `AsyncTask.result.totalCostCents` (i.e. the projected **labor** cost
  of the generated schedule).

---

## Files to know

- `apps/web/src/server/actions/schedule-generation.actions.ts`
- `apps/web/src/server/services/ai/scheduling-agent.service.ts`
- `apps/web/src/server/services/candidate.service.ts`
- `apps/web/src/server/services/cp-solver.service.ts`
- `apps/web/src/server/services/schedule-validator.service.ts`
- `apps/web/src/server/services/ai/prompts/schedule-generation.ts`
- `apps/web/src/lib/ai/openai-client.ts`
- `solver/main.py` + `solver/Dockerfile`

---

## Running the solver locally

```bash
# One-time: install Python deps into a venv
cd solver
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload --port 8000
```

Or, via Docker:

```bash
docker build -t sous-solver ./solver
docker run --rm -p 8000:8000 sous-solver
```

Point the web app at it with `WEB_CP_SOLVER_URL=http://localhost:8000`
(materialized via `./setup-agent-envs.sh` — see the `bootstrap-env`
skill).

---

## Deprecated alternatives

An earlier roadmap proposed an **LLM swap optimizer** for week-level
solves. That approach was dropped in favor of CP-SAT for cost and
latency reasons. The LLM retains a role in:

- Narrating the solver's output to the user.
- Analyzing infeasibility and suggesting relaxations.
- Everything in [07-ai-orchestrator.md](./07-ai-orchestrator.md) —
  chat, tool calls, proposal lifecycle.

Do not re-introduce LLM-based solving without an explicit product
decision.
