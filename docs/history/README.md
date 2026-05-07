# History

Historical summaries of implementation phases that have shipped.
Kept for context — not for execution. If you need to understand how a
feature came to be, start here. If you need to understand how it
works today, start at
[`../architecture/`](../architecture/).

## Contents

- [`ai-assistant-phases.md`](./ai-assistant-phases.md) —
  Five-phase rollout of the agentic AI assistant (RBAC, tool registry,
  HITL, async tasks, telemetry). Phases 1–4 shipped; Phase 5 (audit
  logging) never shipped and is not currently planned.
- [`scheduling-phases.md`](./scheduling-phases.md) —
  Foundation, scheduler grid, multi-location scoping, and CP-SAT
  schedule generation. All shipped.

## Rules

- Do not modify these files to describe current behavior. Use the
  architecture docs instead.
- If we revisit one of these features (e.g., add per-tool quotas),
  document the new work in the architecture docs and leave the
  history file alone.
- Delete a history file only if its feature was fully removed from
  the codebase.
