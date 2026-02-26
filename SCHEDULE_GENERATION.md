# Schedule Generation Architecture

The schedule generation system in Sous utilizes a **hybrid architecture** combining a deterministic Constraint Programming (CP) solver, built with Google OR-Tools in Python, and an AI-based optimizing agent in the Next.js backend. This combination guarantees mathematical feasibility and constraint adherence, while leveraging AI for nuance-based final tweaks.

## High-Level Workflow

The whole generation process occurs across the following phases:

1. **Phase 1: Candidate Pre-fetching (Next.js)**
   The Next.js backend (`CandidateService`) analyzes the labor requirements and existing shifts for a given location, building a filtered list of valid staff candidates for each shift slot. It rules out staff members lacking skills for a station or exceeding hard availability constraints.

2. **Phase 2: Global Deterministic Solve (Python OR-Tools)**
   The backend serializes these candidates and slot requirements into a large `WeekSolverInput` payload, sending it to the isolated python microservice via HTTP POST (`/solve`). The Python microservice formats this as an integer programming problem, solves for the mathematically optimal schedule, and returns the shift assignments back to Next.js.

3. **Phase 3: AI Swap Optimization (Next.js/OpenAI)**
   The generated deterministic schedule ("base schedule") is then passed through an AI agent (`SchedulingAgentService`). The LLM acts as an optimizer by suggesting explicit staff swap operations to further improve soft constraints like time preferences or shift distribution. Each swap is computationally evaluated by a rigid deterministic scoring function (`ScheduleValidatorService.scoreQuality()`), and the system only applies a suggested swap if it mathematically improves the schedule's quality score.

---

## The Python CP-SAT Solver Microservice

Located in the `solver/` directory, this microservice exposes a FastAPI endpoint that acts as a wrapper around [Google OR-Tools' CP-SAT solver](https://developers.google.com/optimization/cp/cp_solver).

### Decision Variables

The core of the integer constraint formulation relies on a fundamental boolean decision variable for every valid combination of staff candidate and slot:
* `x[(staff, slot)] = 1` if staff is assigned to the slot, else `0`

Additionally, it tracks mathematical slack via these variables:
* `smin`: The shortfall below the absolute *minimum* required staff for a slot.
* `spref`: The shortfall below the *preferred* required staff for a slot.
* `h`: Total allocated shift duration (in minutes) for each staff member over the week.

### Hard Constraints

The CP-SAT model mathematically forbids violating the following conditions:

1. **Target Coverage Limits:**
   The sum of assigned staff plus slack variables exactly equals the preferred staff count: `sum(x) + smin + spref == preferred_staff`
2. **Weekly Max Hours:**
   No staff member can exceed their weekly threshold. The variable bounds of the individual's `h` allocation strictly lock the maximum limit for any combination of `x`.
3. **One Shift Per Day:**
   No staff member can be assigned more than one shift per calendar day.
   `sum(x_for_day) <= 1`
4. **Clopening Prevention:**
   Unless explicitly permitted via settings, "clopening" (closing late and opening early the next day) is prohibited. Any two slot assignments crossing day boundaries with an invalid rest window are placed into a mutual conflict set constraint `x_1 + x_2 <= 1`.

### Objective Function (Optimization)

The solver uses a unified objective function to find the optimal arrangement. The goal is to **MAXIMIZE** the overall mathematical score.

The model factors weights against decisions:
* **Penalize Minimum Shortfalls heavily:** `-60,000 * smin` (The solver prioritizes having bare minimum safety coverage at all costs).
* **Penalize Preferred Shortfalls moderately:** `-600 * spref`
* **Reward Station Preferences:** `+180` for assigning a staff member to a station they prefer.
* **Reward Time Preferences:** `+120` for hitting a preferred time slot.
* **Maximize Fairness:** `-(h_max - h_min)`, reducing the variance in total hours distributed across the staff base (aims to allocate hours evenly).

---

## AI Optimization Integration

The Next.js backend ensures that safety features bypass AI hallucination. Rather than having the AI generate shifts out of thin air, the `SchedulingAgentService` only queries the AI for **Swaps** against the already-valid CP schedule. 

If the AI proposes a swap (e.g., Staff A takes Staff B's shift because Staff A prefers mornings), it is run through `ScheduleValidatorService`, scoring the impact precisely utilizing the exact same logic criteria (preferred station hits, time hits, variance, shortfalls). If the AI hallucinated an illegal overlap, clopening constraint, or simply gave a worse suggestion, the swap is aggressively skipped. Only purely mathematically accretive AI suggestions make it into the final saved schedule.
