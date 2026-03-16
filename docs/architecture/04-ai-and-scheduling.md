# AI and Schedule Generation

Schedule generation is the core automated feature of Sous. It uses the **Google OR-Tools CP-SAT** constraint programming solver via a Python FastAPI microservice. The solver finds globally optimal staff assignments across the entire week, respecting availability, skills, hour limits, and clopening constraints.

*(Note: The previously planned "LLM AI Swap Optimizer" has been deprecated in favor of this pure CP approach, saving costs and latency.)*

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Action Layer                             │
│   schedule-generation.actions.ts                             │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Scheduling Service Layer                       │
│                                                              │
│   SchedulingAgentService (orchestrator)                      │
│     │                                                        │
│     ├─ Phase 1: CandidateService pre-fetch (all 7 days)     │
│     │    └─ Hard-filters candidates per slot                 │
│     │                                                        │
│     ├─ Phase 2: CPSolverService.solveWeek()                  │
│     │    └─ OR-Tools CP-SAT via Python microservice          │
│     │       (globally optimal, ~2-10s)                       │
│     │                                                        │
│     └─ Phase 3: ScheduleValidatorService                     │
│          ├─ validate() — hard constraint checks              │
│          ├─ scoreQuality() — quality scoring                 │
│          └─ checkUnderScheduled() — min-hours warnings       │
│                                                              │
│   CandidateService (hard filter layer)                       │
│     └─ Filters: availability, time-off, skills, overlap,    │
│        clopening (10h gap), overtime                         │
│                                                              │
│   CP Solver Microservice (solver/main.py)                    │
│     └─ FastAPI + OR-Tools CP-SAT, runs in Docker             │
└─────────────────────────────────────────────────────────────┘
```

## Key Services Explained

1. `SchedulingAgentService`: The orchestrator. It pulls data from the DB, runs the `CandidateService` to find who *can* work each shift, packages that data, sends it to the CP solver, and then saves the final shifts back to the DB.
2. `CandidateService`: The hard filter layer. It aggressively filters out staff who cannot work a shift (due to approved time off, lack of skill, complete unavailability, or consecutive shift overlap). This reduces the workload on the CP solver.
3. `CPSolverService`: The HTTP client that communicates with the external Python microservice running OR-Tools CP-SAT.
4. `ScheduleValidatorService`: Reviews the output from the solver. Runs hard validation, calculates a quality score (1-100), and generates UI warnings (e.g., "Staff A is scheduled for 5 hours under their minimum limit").

## Open AI / Assistant Integration (Phase 4)

In Phase 4, Sous will introduce the Agentic AI Scheduling Assistant, which processes SMS messages via Twilio and suggests schedule adjustments. The models and actions for this phase are defined but not yet implemented.

When interacting with the OpenAI API for this future phase, use the established `openai-client.ts` wrapper.

```typescript
// src/lib/ai/openai-client.ts
import { generateJSON } from "@/lib/ai/openai-client";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts/example";

export const ExampleAgentService = {
  async analyze(input: string): Promise<AnalysisResult> {
    const result = await generateJSON<AnalysisResult>(
      SYSTEM_PROMPT,
      buildUserPrompt(input)
    );
    return result;
  },
};
```
