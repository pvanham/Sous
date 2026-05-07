# History — AI Assistant Phases

Historical record of the five-phase plan for the agentic AI
scheduling assistant. Phases 1–4 shipped between January and April
2026. Phase 5 (audit logging) was scoped in detail but never
implemented; it is not currently on the roadmap.

For how the system works today, see
[`../architecture/07-ai-orchestrator.md`](../architecture/07-ai-orchestrator.md)
and the `.cursor/rules/web-ai-orchestrator.mdc` rule.

---

## Phase 1 — Security, Identity, and Context Boundaries (shipped)

**Goal:** Ensure the AI acts only within the current user's
permissions, and that viewport context streamed from the frontend is
never trusted for authorization.

**Delivered:**

- Expanded `MemberRole` to `owner | manager | shift_lead | staff`.
- Introduced `AIPermission` union and `ROLE_PERMISSIONS` map in
  `apps/web/src/lib/ai/rbac/permissions.ts`.
- `filterToolsForRole()` dynamically prunes the tool registry at the
  start of every chat turn.
- Zero-trust viewport verification via
  `lib/ai/orchestrator/verify-viewport-access.ts` — a claim like "I
  am looking at schedule X" is re-verified against tenant ACLs.
- `buildOrchestratorContext()` unifies auth, RBAC, and viewport into
  a single `OrchestratorContext` object passed to every tool handler.

**Current home:** `apps/web/src/lib/ai/rbac/`, `apps/web/src/lib/ai/orchestrator/`.

---

## Phase 2 — The Bounded Tool Registry (shipped)

**Goal:** Give the LLM strict, schematized, aggregated data-gathering
tools so the context window stays small and prompt injection stays
contained.

**Delivered:**

- Flat `AIToolDefinition[]` registry in
  `apps/web/src/lib/ai/tools/tool-registry.ts`, with per-tool Zod
  parameter schemas and typed result envelopes.
- Read tools: `resolve_schedule`, `get_schedule_health`,
  `get_shift_roster`, `get_staff_summary`, `get_time_off_requests`.
- Data minimisation: tools aggregate into summaries rather than
  returning raw Mongoose documents; pagination is enforced via
  `lib/ai/tools/pagination.ts`.
- Prompt-injection sanitisation wraps user-generated text (shift
  notes, time-off reasons) in XML delimiters via
  `lib/ai/tools/sanitize.ts` before it hits the LLM.
- `ai-sdk-adapter.ts` bridges the internal tool registry to the
  Vercel AI SDK's tool-calling format.

**Current home:** `apps/web/src/lib/ai/tools/`.

---

## Phase 3 — Generative UI & Human-in-the-Loop (shipped)

**Goal:** Detach the AI's *intention to mutate* from the actual
mutation. No DB write without human confirmation; no stale approvals.

**Delivered:**

- `Conversation` Mongoose model embeds `messages[]` and
  `StoredProposal`s on a single document.
- Write tools (`propose_*`) return proposal payloads instead of
  writing. The proposal carries an OCC `dataVersion` captured at
  propose time.
- `/api/ai/chat/route.ts` streams chat turns via the Vercel AI SDK;
  `/api/ai/proposals/[proposalId]/resolve/route.ts` is the **only**
  code path that executes a proposal.
- Re-auth + re-RBAC + OCC check at confirm time; mismatches mark the
  proposal `stale` and the UI asks the user to re-issue.
- Client hook `hooks/use-ai-chat.ts` renders `ConfirmationCard`s
  inline in the chat history and expires cards older than
  `PROPOSAL_TTL_MINUTES` (15 min).

**Current home:** `apps/web/src/lib/ai/orchestrator/`,
`apps/web/src/app/api/ai/`, `apps/web/src/components/ai-chat/`.

---

## Phase 4 — Asynchronous Task Orchestration (shipped)

**Goal:** Let the assistant trigger long-running compute (schedule
generation) without holding a serverless request open for 60+
seconds.

**Delivered:**

- `AsyncTask` Mongoose model with status lifecycle
  (`pending → running → completed | failed | infeasible | timed_out`).
- `propose_schedule_generation` tool enqueues an `AsyncTask` rather
  than calling the solver inline.
- `async-task.service.ts` runs the full CP-SAT pipeline (see
  [`../architecture/04-schedule-generation.md`](../architecture/04-schedule-generation.md))
  and writes results onto the task document.
- Client polls `/api/ai/tasks/[taskId]/status` via
  `lib/ai/client/poll-task-status.ts`; on completion the UI
  surfaces a `propose_accept_generated_schedule` proposal.
- `async-system-message.ts` injects a short system message into the
  next chat turn so the LLM knows background work finished and can
  narrate the outcome.

**Current home:** `apps/web/src/server/models/AsyncTask.ts`,
`apps/web/src/server/services/async-task.service.ts`,
`apps/web/src/lib/ai/orchestrator/`,
`apps/web/src/app/api/ai/tasks/[taskId]/status/`.

---

## Phase 5 — Telemetry, Observability, and Audit Logging (not shipped)

**Goal (original):** Immutable paper trail of every AI-originated
mutation (who approved, which tool, exact payload, conversation id);
structured logging of step-limit failures and solver performance.

**Status:** Not implemented. No `AuditLog` model exists in
`apps/web/src/server/models/`. Chat usage accounting is partial —
one-shot LLM calls flow through `AIUsageLog`, but the Vercel AI SDK
chat path does not yet write usage.

**Why:** Scope was deferred in favour of shipping the mobile app
first. An audit trail is still worth building before a paid launch;
it just hasn't been prioritised.

**If you pick this up:**

- Start by reading `apps/web/src/lib/ai/orchestrator/execute-proposal.ts`
  — the single funnel for AI-originated mutations. Every audit event
  has a natural insertion point there.
- `apps/web/src/server/services/ai-usage.service.ts` is the obvious
  sibling service for usage accounting.
- `Conversation.messages[]` already stores proposal lifecycle states;
  a separate `AuditLog` collection is needed only if you need query
  patterns a Mongoose subdocument array can't serve.
