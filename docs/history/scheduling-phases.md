# History — Scheduling Platform Phases

Historical record of how Sous grew from a bare scaffold to a
multi-tenant scheduling platform with a CP-SAT solver. For current
behavior, start at
[`../architecture/`](../architecture/).

---

## Phase 1 — The Digital Kitchen (shipped, January 2026)

**Goal:** Foundation layer — Next.js scaffold, auth, kitchen config,
staff management.

**Delivered:**

- Next.js 16 App Router + React 19 + TypeScript 5 scaffold with
  Tailwind v4 and shadcn/ui.
- Clerk authentication with middleware protection (since renamed to
  `proxy.ts` for Next.js 16).
- `KitchenConfig` model — stations, roles, operating hours.
- `Staff` model + CSV import flow.
- Mongoose singleton connection pattern in `apps/web/src/lib/db.ts`.

---

## Phase 2 — The Scheduler Grid (shipped, January 2026)

**Goal:** Manual scheduling UX with three view modes and full CRUD.

**Delivered:**

- `Schedule` and `Shift` models with overlap detection and the
  DRAFT → PUBLISHED publish workflow.
- Three view modes — Staff View, Time View, Day/Station View.
- Full shift CRUD with optimistic updates via TanStack Query.
- Manager coverage warnings surfaced in the schedule header.

---

## Phase 2.5 — Multi-Location Foundation (shipped, January 2026)

**Goal:** Retrofit multi-tenancy before the user base grew.

**Delivered:**

- New models: `Organization`, `Location`, `OrganizationMember`.
- Every existing model scoped by `orgId` + `locationId` instead of
  `userId`.
- `getLocationContext(userId)` became the canonical multi-tenancy
  enforcer for server actions.
- Auto-create of org + location for a brand-new user so the
  single-location UX stays frictionless.
- `scripts/migrate-to-multi-location.ts` to port pre-refactor data.

**Why this was big:** Every future feature (AI tools, the mobile app,
Stripe billing) assumed `orgId` + `locationId` scoping from day one.
The alternative — retrofitting tenancy after the AI orchestrator had
shipped — would have been significantly harder.

---

## Phase 3 — AI Schedule Generation via CP-SAT (shipped, March 2026)

**Goal:** Generate a feasible weekly schedule from staff, shifts, and
constraints.

**Delivered:**

- Python FastAPI microservice (`solver/`) wrapping Google OR-Tools
  CP-SAT. Runs in Docker locally and in production.
- `CandidateService` pre-filters staff-to-shift candidates
  deterministically (role match, availability, skill level, time-off)
  before the solver runs.
- `CPSolverService` serialises the solve payload, posts to the
  FastAPI service, and deserialises the assignment map.
- `ScheduleValidatorService` re-checks hard constraints after the
  solver returns.
- `SchedulingAgentService` orchestrates the full pipeline and
  persists the resulting shifts.
- UI for labor requirements, staff availabilities, and the
  "Generate Base Schedule" preview grid.

**Deprecated at the same time:** the originally-planned "AI Swap
Optimizer" post-processing step. Managers wanted deterministic,
predictable results, so the optimizer was reimagined as the
interactive AI assistant (see
[`ai-assistant-phases.md`](./ai-assistant-phases.md)).

For how this works today, see
[`../architecture/04-schedule-generation.md`](../architecture/04-schedule-generation.md).
