# 07 — AI Orchestrator

> The agentic AI assistant that lives inside the dashboard. This doc
> covers the chat stream, tool registry, RBAC, proposal lifecycle,
> optimistic concurrency, and async tasks. For the deterministic
> schedule solver, see
> [04-schedule-generation.md](./04-schedule-generation.md).

---

## 1. The mental model: propose → confirm → execute

The LLM is never allowed to write to the database directly. Every
mutation goes through three distinct phases so the user can review
exactly what will happen and concurrent edits are detected.

```
  User message
      │
      ▼
  ┌──────────────────────┐
  │ Chat stream          │  tool-calling loop (Vercel AI SDK)
  │ /api/ai/chat         │  gpt-4o + system prompt + allowed tools
  └─────┬────────────────┘
        │ propose_<thing>   (read-only + plan construction)
        ▼
  ┌──────────────────────┐
  │ StoredProposal on    │  embedded in Conversation.messages[]
  │ Conversation doc     │  status = "pending", carries OCC token
  └─────┬────────────────┘
        │ user clicks Confirm in AIAssistantPanel
        ▼
  ┌──────────────────────┐
  │ /api/ai/proposals/   │  re-auth, re-RBAC, re-OCC, service call
  │ :id/resolve          │
  └──────────────────────┘
```

Anything read-only (`get_*`, `resolve_*`) runs synchronously inside the
tool-calling loop and returns data to the model. Anything that mutates
(`propose_*`) stops at the proposal and waits for human confirmation.

---

## 2. Two SDKs, two jobs

The web app uses **both** OpenAI SDKs on purpose.

| SDK | Used for | File |
|-----|----------|------|
| **Vercel AI SDK** (`ai`, `@ai-sdk/openai`) | Multi-turn streaming chat with tool calls | `apps/web/src/app/api/ai/chat/route.ts`, `lib/ai/tools/ai-sdk-adapter.ts` |
| **OpenAI npm package** (`openai`) | Single-turn JSON / narrative calls from services | `lib/ai/openai-client.ts`, `server/services/ai/scheduling-agent.service.ts` |

**Rule:** chat = Vercel SDK, one-shot = `openai-client.ts`. Do not mix
them in a single flow and do not add a third wrapper.

---

## 3. The chat endpoint (`/api/ai/chat`)

A single POST endpoint that returns a UI-message stream. Simplified
outline:

```ts
export async function POST(req: Request) {
  const { userId } = await auth();                       // 1. Clerk auth
  const body = await req.json();
  const { message, conversationId, viewportContext } =
    chatMessageSchema.safeParse(body).data;              // 2. Zod

  await dbConnect();

  const ctx = await buildOrchestratorContext({           // 3. tenant +
    clerkUserId: userId, rawViewportContext: viewportContext,//   RBAC +
    userMessage: message,                                //   viewport verify
  });

  const location = await LocationService.getById(ctx.auth.locationId);
  expirePendingProposals(ctx.auth.orgId, userId, id).catch(log);

  const tools = toAISDKTools(ctx.allowedTools, toolExecutionContext);
  const systemPrompt = buildSystemPrompt(ctx, location.timezone);

  await Conversation.findOneAndUpdate(                    // 4. upsert doc
    { _id: id, clerkUserId: userId },
    { $setOnInsert: { orgId, locationId, clerkUserId, messages: [] } },
    { upsert: true }
  );

  const result = streamText({                             // 5. stream
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: convertToModelMessages(uiMessages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: persistMessages,                            // 6. save turns
  });

  return result.toUIMessageStreamResponse();
}
```

Guarantees:

- `maxDuration = 30` seconds — longer work must be moved to an
  `AsyncTask` (see §8).
- The conversation document always exists before the stream starts —
  proposals persisted mid-stream have something to attach to.
- Stale proposals from earlier turns are expired at the start of every
  new turn (fire-and-forget so it doesn't slow the happy path).

---

## 4. Orchestrator context (`lib/ai/orchestrator/build-context.ts`)

The `OrchestratorContext` is the single object every tool handler
receives. It captures:

- **Auth**: `{ clerkUserId, orgId, locationId, role }` — verified
  server-side, never from the client.
- **RBAC**: `allowedTools` — the tool-registry subset the current
  `role` may call (see §6).
- **Viewport**: the page the user is looking at, verified against
  tenant ACLs by `verify-viewport-access.ts`. A claim of "I'm on
  schedule X" must survive a fresh access check — the LLM cannot
  forge viewport.
- **User message**: the raw latest user message, used for logging and
  certain tool routers.

`viewportContext` is shaped by `packages/types/src/validations/viewport-context.schema.ts`
so the web client and the orchestrator speak the same language.

---

## 5. The tool registry (`lib/ai/tools/`)

```
lib/ai/tools/
├── tool-registry.ts          — flat AIToolDefinition[] (all tools)
├── tool-registry.types.ts    — defineTool helper
├── tool-result.types.ts      — discriminated result unions
├── tool-proposal.types.ts    — per-tool proposal shapes
├── tool-executor.ts          — shared execution wrapper (timing, errors)
├── ai-sdk-adapter.ts         — AIToolDefinition → Vercel AI SDK tool
├── pagination.ts             — shared list truncation
├── sanitize.ts               — strip unsafe content from args/results
└── definitions/
    ├── <tool>.schema.ts      — Zod parameter schema
    ├── <tool>.handler.ts     — execute() implementation
    └── index.ts              — barrel export
```

### Read-only tools (`get_*`, `resolve_*`)

Execute synchronously inside the tool-calling loop and return
structured data. Current set:

- `resolve_schedule(date)` — date → `scheduleId` for the containing
  week. **Always call this before** `get_shift_roster` or
  `get_schedule_health`.
- `get_schedule_health(scheduleId?)` — totals, overtime risks, manager
  coverage gaps, unscheduled staff.
- `get_shift_roster(scheduleId?, staffId?, dayOfWeek?)` — paginated
  shifts. Omit `staffId` for all staff, omit `dayOfWeek` for all days.
- `get_staff_summary()` — role distribution, station coverage, hours.
- `get_time_off_requests(range, status?, staffId?)` — paginated PTO.
  Always use a wide range unless the user specifies one.

### Mutation tools (`propose_*`)

**Never mutate.** They:

1. Validate the plan (dry-run through the service layer where
   possible).
2. Compute an OCC `dataVersion` for the target aggregate.
3. Create a `StoredProposal` embedded on the `Conversation` doc.
4. Return a proposal summary to the model.

Current set:

- `propose_shift_swap` — reassign a shift to a different staff
  member.
- `propose_schedule_generation` — enqueue an `AsyncTask` for CP-SAT
  generation.
- `propose_accept_generated_schedule` — materialize a completed
  `AsyncTask` result into real shifts.

Adding a new `propose_*` tool always touches three places:

- The tool handler (`definitions/<name>.handler.ts`).
- The execution branch in `lib/ai/orchestrator/execute-proposal.ts`.
- The tool result / proposal type in `tool-proposal.types.ts`.

---

## 6. RBAC (`lib/ai/rbac/`)

- `permissions.ts` defines `AIPermission` (`schedule:read`,
  `schedule:write`, `schedule:generate`, `staff:read`, `staff:write`,
  `shift:*`, `config:*`, `cost:*`) and `ROLE_PERMISSIONS` (frozen
  per-role allow-lists).
- `filter-tools.ts` narrows the registry to the subset the current
  role may call. This runs once per turn, inside `buildOrchestratorContext`.
- `/api/ai/proposals/:id/resolve` re-checks permissions at confirm
  time — a role change between propose and confirm invalidates the
  proposal.

Adding a new `AIPermission` requires updating **every** role in
`ROLE_PERMISSIONS` (owner usually gets it, staff almost never does).
Forgetting a role silently denies access for that role.

---

## 7. Proposals (`lib/ai/orchestrator/`)

`StoredProposal` (see [01-data-models.md](./01-data-models.md#conversation-conversationts))
carries everything the confirm endpoint needs to replay the action:

- `proposalId` (uuid) — client handle.
- `toolName` — which `propose_*` created it.
- `description` — human-readable summary for the confirmation card.
- `payload` — execution-ready args (staff id, shift id, weekStartDate,
  etc.).
- `dataVersion` — OCC token captured at propose time.
- `status` — `pending` → `approved` / `denied` / `expired` / `stale`.
- `createdAt`, `resolvedAt`, `resolvedBy`.

### OCC (`lib/ai/orchestrator/occ.ts`)

Every mutation proposal captures an aggregate version:

- For shifts: the shift document's `updatedAt`.
- For schedules: the schedule's `updatedAt` plus shift-set hash (so
  two independent edits on the same schedule collide).

At confirm time we re-read the aggregate and compare. Mismatch →
`status = "stale"` and the UI asks the user to re-issue the request
with the latest state.

### Expiry (`expire-proposals.ts` + `constants.ts`)

`PROPOSAL_TTL_MINUTES` is 15 min. Every new chat turn lazily marks
`pending` proposals older than the TTL as `expired`. The confirm
endpoint also re-checks expiry before executing.

### Execution (`execute-proposal.ts`)

`executeProposal(proposalId, actor)` is the single funnel:

1. Load the proposal + its parent conversation.
2. Re-auth the actor against the tenant (`getLocationContext`).
3. Re-check RBAC for the tool's required permission.
4. Re-check OCC.
5. Dispatch to the matching service call based on `toolName`.
6. Write `{ status, resolvedAt, resolvedBy, executionResult }` back
   onto the proposal.

This is the **only** code path that materializes an AI-authored
mutation. There is no other.

---

## 8. Async tasks (`AsyncTask` + `async-task.service.ts`)

Some proposals — schedule generation in particular — take longer than
the 30-second chat `maxDuration`. These use the `AsyncTask` model.

Flow:

1. `propose_schedule_generation` handler creates an `AsyncTask`
   (`status: "pending"`, `taskType: "schedule_generation"`).
2. The proposal returned to the model contains `taskId`.
3. `async-task.service.ts` picks up the task (via an action invoked
   by the confirm endpoint) and runs the full
   [schedule-generation pipeline](./04-schedule-generation.md), writing
   the result onto `AsyncTask.result`.
4. The client polls `/api/ai/tasks/[taskId]/status` via
   `lib/ai/client/poll-task-status.ts`.
5. On `completed`, the UI surfaces a follow-up
   `propose_accept_generated_schedule` proposal.
6. `async-system-message.ts` injects a short system message into the
   next chat turn so the LLM knows the background work finished.

Timeouts are enforced via `AsyncTask.deadline` plus a `(status, deadline)`
index that lets the worker mark overdue tasks as `timed_out`.

---

## 9. Persistence: `Conversation` is the hub

The `Conversation` Mongoose document holds everything about a session
— messages, tool calls, proposals — so the orchestrator needs a
single-document `$push` / `$setOnInsert` to persist. This is
intentional; a relational schema here would slow down every chat turn.

Chat turns persist inside `onFinish` of the `streamText` result (so
partial streams that crash don't pollute history). Proposals persist
mid-stream from inside `proposal-handler.ts`.

---

## 10. Usage accounting

- **One-shot LLM calls** (schedule generation, infeasibility narratives)
  flow through `openai-client.ts` which extracts `response.usage` and
  writes an `AIUsageLog` + updates `ai-usage.service.ts`. Organisations
  have monthly limits; exceeding them throws `AILimitExceededError`.
- **Chat usage is not metered yet.** The Vercel AI SDK's `onFinish`
  callback exposes usage — wiring it into `ai-usage.service.ts` is a
  known follow-up. When you touch chat accounting, update **both**
  metering points so limits don't drift between flows.

---

## 11. UI surface (`components/ai-chat/` + `AIAssistantPanel`)

The dashboard layout mounts `<AIAssistantPanel>` globally so the user
can converse from any page. The panel:

- Uses the Vercel AI SDK React hook (`useChat`) against
  `/api/ai/chat`.
- Renders proposal cards via `ConfirmationCard.tsx` — each card posts
  to `/api/ai/proposals/:id/resolve`.
- Shows async task progress via `AsyncTaskIndicator.tsx`, polling
  `/api/ai/tasks/:id/status`.
- Sends the current `viewportContext` with every message so the
  orchestrator can tailor suggestions to the page.

See `apps/web/src/components/ai-chat/` for the current chat UI
components.

---

## 12. Files to know

- `apps/web/src/app/api/ai/chat/route.ts`
- `apps/web/src/app/api/ai/proposals/[proposalId]/resolve/route.ts`
- `apps/web/src/app/api/ai/tasks/[taskId]/status/route.ts`
- `apps/web/src/lib/ai/openai-client.ts`
- `apps/web/src/lib/ai/constants.ts`
- `apps/web/src/lib/ai/rbac/permissions.ts`
- `apps/web/src/lib/ai/rbac/filter-tools.ts`
- `apps/web/src/lib/ai/tools/**`
- `apps/web/src/lib/ai/orchestrator/**`
- `apps/web/src/server/models/Conversation.ts`
- `apps/web/src/server/models/AsyncTask.ts`
- `apps/web/src/server/models/AIUsageLog.ts`
- `apps/web/src/server/services/ai-usage.service.ts`
- `apps/web/src/server/services/async-task.service.ts`
- `apps/web/src/components/ai-chat/*`
- `apps/web/src/components/shared/AIAssistantPanel.tsx`
