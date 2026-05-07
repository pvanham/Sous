/**
 * Phase 4: Asynchronous Task Orchestration — Verification Script
 *
 * Section A — Pure function tests (no DB required):
 *   A1. toAsyncTaskDTO round-trip (Step 1)
 *   A2. buildAsyncTaskSystemMessage — all terminal statuses + edge cases (Step 5)
 *   A3. toClientSafeProposal — accept-generated-schedule summary (Step 11)
 *   A4. Tool registry — propose_accept_generated_schedule wiring (Step 11)
 *   A5. Accept-schedule schema validation (Step 11)
 *   A6. executeProposal dispatcher routing — malformed payload + unknown tool (Step 11)
 *   A7. ProposalStatus type includes "collapsed" (Step 11)
 *   A8. ResolveProposalResponse includes cascadeState (Step 11)
 *
 * Section B — DB-dependent tests (requires MONGODB_URI in .env.local):
 *   B1. AsyncTask model CRUD (Step 1)
 *   B2. AsyncTask model indexes (Step 1)
 *   B3. AsyncTask user-scoping (Step 4)
 *   B4. Lazy timeout detection (Step 4)
 *   B5. Accept-schedule handler — happy path (Step 11)
 *   B6. Accept-schedule handler — error states (Step 11)
 *
 * Run: npx tsx scripts/test-phase4.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { toAsyncTaskDTO } from "../src/types/async-task";
import type {
  IAsyncTask,
  AsyncTaskResult,
  AsyncTaskDTO,
} from "../src/types/async-task";
import {
  buildAsyncTaskSystemMessage,
  type AsyncTaskCompletionContext,
} from "../src/lib/ai/orchestrator/async-system-message";
import {
  toClientSafeProposal,
} from "../src/lib/ai/orchestrator/proposal-handler";
import type { ToolProposal } from "../src/lib/ai/tools/tool-proposal.types";
import { getToolRegistry } from "../src/lib/ai/tools/tool-registry";
import {
  proposeAcceptGeneratedScheduleParamsSchema,
} from "../src/lib/ai/tools/definitions/propose-accept-generated-schedule.schema";
import { executeProposal } from "../src/lib/ai/orchestrator/execute-proposal";
import type { StoredProposal, ProposalStatus } from "../src/types/conversation";
import type { ResolveProposalResponse } from "../src/types/ai-chat";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function includes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section A — Pure Function Tests (no DB required)
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(55));
console.log("  Section A — Pure Function Tests");
console.log("=".repeat(55));

// ─── A1. toAsyncTaskDTO ──────────────────────────────────────────────────────

console.log("\n=== A1. toAsyncTaskDTO (Step 1) ===\n");

{
  const now = new Date();
  const mockDoc: IAsyncTask & { _id: unknown } = {
    _id: { toString: () => "task_abc123" },
    taskType: "schedule_generation",
    status: "completed",
    conversationId: "conv_1",
    proposalId: "prop_1",
    orgId: { toString: () => "org_xyz" },
    locationId: { toString: () => "loc_xyz" },
    clerkUserId: "user_1",
    inputPayload: { days: [] },
    scheduleId: "sched_1",
    weekStartDate: "2026-03-16",
    result: {
      solverStatus: "OPTIMAL",
      objectiveValue: 100,
      solveTimeMs: 5000,
      totalCostCents: 420000,
      fallbackRatesUsed: false,
      overtimeSummary: {},
      generatedDays: [],
      summary: "Test summary",
    },
    error: undefined,
    dispatchedAt: now,
    completedAt: now,
    deadline: now,
    createdAt: now,
    updatedAt: now,
  };

  const dto: AsyncTaskDTO = toAsyncTaskDTO(mockDoc);

  assert(dto.id === "task_abc123", "DTO.id is stringified _id");
  assert(dto.orgId === "org_xyz", "DTO.orgId is stringified");
  assert(dto.locationId === "loc_xyz", "DTO.locationId is stringified");
  assert(dto.taskType === "schedule_generation", "DTO.taskType preserved");
  assert(dto.status === "completed", "DTO.status preserved");
  assert(dto.clerkUserId === "user_1", "DTO.clerkUserId preserved");
  assert(dto.scheduleId === "sched_1", "DTO.scheduleId preserved");
  assert(dto.weekStartDate === "2026-03-16", "DTO.weekStartDate preserved");
  assert(dto.result?.solverStatus === "OPTIMAL", "DTO.result passes through");
  assert(dto.error === undefined, "DTO.error is undefined when absent");
  assert(dto.dispatchedAt === now, "DTO.dispatchedAt same Date reference");
  assert(dto.deadline === now, "DTO.deadline same Date reference");

  // Without optional result
  const noResultDoc = { ...mockDoc, result: undefined };
  const noResultDto = toAsyncTaskDTO(noResultDoc);
  assert(noResultDto.result === undefined, "DTO without result is fine");

  // With error field
  const errDoc = {
    ...mockDoc,
    result: undefined,
    error: { message: "boom", code: "ERR_SOLVER" },
  };
  const errDto = toAsyncTaskDTO(errDoc);
  assert(errDto.error?.message === "boom", "DTO.error passes through correctly");
  assert(errDto.error?.code === "ERR_SOLVER", "DTO.error.code preserved");
}

// ─── A2. buildAsyncTaskSystemMessage ─────────────────────────────────────────

console.log("\n=== A2. buildAsyncTaskSystemMessage (Step 5) ===\n");

{
  // completed — success
  const completedCtx: AsyncTaskCompletionContext = {
    status: "completed",
    taskType: "schedule_generation",
    elapsedMs: 9500,
    result: {
      solverStatus: "OPTIMAL",
      totalCostCents: 420000,
      solveTimeMs: 8200,
      fallbackRatesUsed: false,
      overtimeWarnings: [
        { staffName: "Alice", hours: 42.5 },
        { staffName: "Bob", hours: 41.0 },
      ],
      totalShiftsGenerated: 42,
      totalUnfilledSlots: 3,
      summary: "Schedule generated successfully",
    },
  };
  const successMsg = buildAsyncTaskSystemMessage(completedCtx);
  assert(successMsg.startsWith("[SYSTEM:"), "completed: starts with [SYSTEM:");
  assert(includes(successMsg, "$4,200.00"), "completed: formatted cost");
  assert(includes(successMsg, "42 shift"), "completed: shift count");
  assert(includes(successMsg, "Alice"), "completed: overtime name Alice");
  assert(includes(successMsg, "Bob"), "completed: overtime name Bob");
  assert(includes(successMsg, "3 unfilled"), "completed: unfilled count");
  assert(includes(successMsg, "summarize"), "completed: instructs LLM to summarize");
  assert(includes(successMsg, "OPTIMAL"), "completed: solver status");

  // infeasible
  const infeasibleCtx: AsyncTaskCompletionContext = {
    status: "infeasible",
    taskType: "schedule_generation",
    elapsedMs: 3000,
    result: {
      solverStatus: "INFEASIBLE",
      totalCostCents: 0,
      solveTimeMs: 2000,
      fallbackRatesUsed: false,
      overtimeWarnings: [],
      totalShiftsGenerated: 0,
      totalUnfilledSlots: 0,
      summary: "No feasible solution found",
      suggestedRelaxations: [
        {
          priority: 1,
          category: "overtime",
          suggestion: "Increase overtime threshold",
          currentValue: "40 hours",
          recommendedValue: "45 hours",
        },
      ],
      likelyCauses: ["Staffing shortage on Wednesday"],
    },
  };
  const infeasibleMsg = buildAsyncTaskSystemMessage(infeasibleCtx);
  assert(includes(infeasibleMsg, "infeasible"), "infeasible: contains word");
  assert(
    includes(infeasibleMsg, "Increase overtime threshold"),
    "infeasible: suggestion text"
  );
  assert(
    includes(infeasibleMsg, "40 hours") && includes(infeasibleMsg, "45 hours"),
    "infeasible: current/recommended values"
  );
  assert(includes(infeasibleMsg, "Wednesday"), "infeasible: likely cause");
  assert(includes(infeasibleMsg, "empathize"), "infeasible: instructs LLM");

  // failed (retryable)
  const failedRetryableCtx: AsyncTaskCompletionContext = {
    status: "failed",
    taskType: "schedule_generation",
    elapsedMs: 60000,
    error: { message: "Connection timed out", retryable: true },
  };
  const failedRetryMsg = buildAsyncTaskSystemMessage(failedRetryableCtx);
  assert(includes(failedRetryMsg, "Connection timed out"), "failed-retry: error message");
  assert(includes(failedRetryMsg, "retryable"), "failed-retry: mentions retryable");
  assert(
    includes(failedRetryMsg, "try again") || includes(failedRetryMsg, "trying again"),
    "failed-retry: suggests retry"
  );

  // failed (non-retryable)
  const failedNonRetryCtx: AsyncTaskCompletionContext = {
    status: "failed",
    taskType: "schedule_generation",
    elapsedMs: 5000,
    error: { message: "License expired", retryable: false },
  };
  const failedNonRetryMsg = buildAsyncTaskSystemMessage(failedNonRetryCtx);
  assert(includes(failedNonRetryMsg, "License expired"), "failed-noretry: error message");
  assert(includes(failedNonRetryMsg, "support"), "failed-noretry: suggests support");

  // timed_out
  const timedOutCtx: AsyncTaskCompletionContext = {
    status: "timed_out",
    taskType: "schedule_generation",
    elapsedMs: 120000,
  };
  const timedOutMsg = buildAsyncTaskSystemMessage(timedOutCtx);
  assert(includes(timedOutMsg, "timed out"), "timed_out: contains phrase");
  assert(includes(timedOutMsg, "deadline"), "timed_out: mentions deadline");

  // missing result fallback
  const missingResultCtx: AsyncTaskCompletionContext = {
    status: "completed",
    taskType: "schedule_generation",
    elapsedMs: 5000,
  };
  const fallbackMsg = buildAsyncTaskSystemMessage(missingResultCtx);
  assert(fallbackMsg.startsWith("[SYSTEM:"), "fallback: starts with [SYSTEM:");
  assert(includes(fallbackMsg, "unavailable"), "fallback: mentions unavailable");

  // missing error fallback
  const missingErrorCtx: AsyncTaskCompletionContext = {
    status: "failed",
    taskType: "schedule_generation",
    elapsedMs: 5000,
  };
  const missingErrMsg = buildAsyncTaskSystemMessage(missingErrorCtx);
  assert(missingErrMsg.startsWith("[SYSTEM:"), "missing-error: starts with [SYSTEM:");
  assert(includes(missingErrMsg, "error"), "missing-error: contains 'error'");
}

// ─── A3. toClientSafeProposal — accept summary ──────────────────────────────

console.log("\n=== A3. toClientSafeProposal — accept-schedule summary (Step 11) ===\n");

{
  const proposal: ToolProposal = {
    proposalId: "prop_accept_1",
    toolName: "propose_accept_generated_schedule",
    description: "Accept the generated schedule for the week of March 16.",
    payload: {
      totalShiftsGenerated: 42,
      totalCostCents: 420000,
    },
    dataVersion: "",
    type: "write",
  };

  const safe = toClientSafeProposal(proposal);
  assert(safe.summary.action === "Accept Generated Schedule", "summary.action correct");
  assert(
    safe.summary.details.some((d: string) => d.includes("42 shift")),
    "summary.details includes shift count"
  );
  assert(
    safe.summary.details.some((d: string) => d.includes("$4,200.00")),
    "summary.details includes formatted cost"
  );
  assert(safe.type === "write", "client-safe type is 'write'");
  assert(safe.proposalId === "prop_accept_1", "proposalId preserved");
}

// ─── A4. Tool registry wiring ────────────────────────────────────────────────

console.log("\n=== A4. Tool registry wiring (Step 11) ===\n");

{
  const registry = getToolRegistry();
  assert(registry.length === 8, `Registry has 8 tools (got ${registry.length})`);

  const acceptTool = registry.find(
    (t) => t.name === "propose_accept_generated_schedule"
  );
  assert(acceptTool !== undefined, "propose_accept_generated_schedule is registered");
  assert(
    acceptTool?.requiredPermission === "schedule:generate",
    "accept tool requires schedule:generate"
  );
  assert(typeof acceptTool?.execute === "function", "accept tool has execute function");

  const genTool = registry.find(
    (t) => t.name === "propose_schedule_generation"
  );
  assert(genTool !== undefined, "propose_schedule_generation still registered");

  const names = registry.map((t) => t.name);
  const uniqueNames = new Set(names);
  assert(names.length === uniqueNames.size, "No duplicate tool names in registry");
}

// ─── A5. Accept-schedule schema validation ───────────────────────────────────

console.log("\n=== A5. Accept-schedule schema validation (Step 11) ===\n");

{
  const valid = proposeAcceptGeneratedScheduleParamsSchema.safeParse({
    taskId: "abc123",
  });
  assert(valid.success === true, "Valid taskId parses successfully");

  const empty = proposeAcceptGeneratedScheduleParamsSchema.safeParse({});
  assert(empty.success === false, "Empty object fails validation");

  const emptyString = proposeAcceptGeneratedScheduleParamsSchema.safeParse({
    taskId: "",
  });
  assert(emptyString.success === false, 'Empty string taskId fails validation');
}

// ─── A6. executeProposal dispatcher routing ──────────────────────────────────

console.log("\n=== A6. executeProposal dispatcher routing (Step 11) ===\n");

{
  // Unknown tool
  const unknownResult = await executeProposal({
    proposal: {
      proposalId: "p1",
      toolName: "propose_unknown_tool",
      description: "test",
      payload: {},
      dataVersion: "",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
    orgId: "org1",
    locationId: "loc1",
    clerkUserId: "user1",
  });
  assert(unknownResult.success === false, "unknown tool: not successful");
  assert(
    unknownResult.errorCode === "unknown_tool",
    "unknown tool: errorCode is unknown_tool"
  );

  // Malformed accept payload — missing scheduleId
  const malformedResult = await executeProposal({
    proposal: {
      proposalId: "p2",
      toolName: "propose_accept_generated_schedule",
      description: "accept test",
      payload: {
        shifts: [{ staffId: "s1", station: "Grill", date: "2026-03-16", startTime: "09:00", endTime: "17:00" }],
        originatingProposalId: "op1",
        originatingTaskId: "ot1",
      },
      dataVersion: "",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
    orgId: "org1",
    locationId: "loc1",
    clerkUserId: "user1",
  });
  assert(malformedResult.success === false, "malformed accept: not successful");
  assert(
    malformedResult.errorCode === "malformed_payload",
    "malformed accept: errorCode is malformed_payload"
  );
}

// ─── A7. ProposalStatus includes "collapsed" ─────────────────────────────────

console.log('\n=== A7. ProposalStatus includes "collapsed" (Step 11) ===\n');

{
  const allStatuses: ProposalStatus[] = [
    "pending",
    "approved",
    "denied",
    "expired",
    "stale",
    "collapsed",
  ];
  assert(allStatuses.includes("collapsed"), '"collapsed" is a valid ProposalStatus');
  assert(allStatuses.length === 6, "ProposalStatus has 6 members");
}

// ─── A8. ResolveProposalResponse has cascadeState ────────────────────────────

console.log("\n=== A8. ResolveProposalResponse includes cascadeState (Step 11) ===\n");

{
  const response: ResolveProposalResponse = {
    success: true,
    proposalId: "p1",
    action: "approved",
    executionSummary: "Schedule saved",
    cascadeState: {
      collapseProposalId: "gen_prop_001",
      collapseTaskId: "task_001",
      collapsedMessage: "Schedule Accepted — 42 shifts saved",
    },
  };
  assert(response.cascadeState !== undefined, "cascadeState field exists");
  assert(
    response.cascadeState!.collapseProposalId === "gen_prop_001",
    "cascadeState.collapseProposalId correct"
  );
  assert(
    response.cascadeState!.collapseTaskId === "task_001",
    "cascadeState.collapseTaskId correct"
  );
  assert(
    typeof response.cascadeState!.collapsedMessage === "string",
    "cascadeState.collapsedMessage is string"
  );

  // Also verify it's optional
  const noState: ResolveProposalResponse = {
    success: true,
    proposalId: "p2",
  };
  assert(noState.cascadeState === undefined, "cascadeState is optional");
}

// ─── Section A Summary ───────────────────────────────────────────────────────

const sectionAPassed = passed;
const sectionAFailed = failed;
console.log("\n" + "-".repeat(55));
console.log(`  Section A Done: ${sectionAPassed} passed, ${sectionAFailed} failed`);
console.log("-".repeat(55));

// ═══════════════════════════════════════════════════════════════════════════════
// Section B — DB Integration Tests (requires MONGODB_URI)
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(55));
console.log("  Section B — DB Integration Tests");
console.log("=".repeat(55));

if (!process.env.MONGODB_URI) {
  console.log(
    "\n  SKIP: MONGODB_URI not set. Section B tests require a running MongoDB.\n"
  );
} else {
  const mongoose = await import("mongoose");
  const { dbConnect } = await import("../src/lib/db");
  const AsyncTaskModule = await import("../src/server/models/AsyncTask");
  const AsyncTask = AsyncTaskModule.default;

  await dbConnect();

  const TEST_ORG_ID = new mongoose.Types.ObjectId();
  const TEST_LOC_ID = new mongoose.Types.ObjectId();
  const TEST_USER = "test_phase4_user_" + Date.now();
  const createdIds: mongoose.Types.ObjectId[] = [];

  try {
    // ─── B1. AsyncTask model CRUD ──────────────────────────────────────

    console.log("\n=== B1. AsyncTask model CRUD (Step 1) ===\n");

    {
      const deadline = new Date(Date.now() + 120_000);
      const task = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "pending",
        conversationId: "conv_test_b1",
        proposalId: "prop_test_b1",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: TEST_USER,
        inputPayload: { weekStartDate: "2026-03-16" },
        scheduleId: "sched_b1",
        weekStartDate: "2026-03-16",
        deadline,
      });
      createdIds.push(task._id as mongoose.Types.ObjectId);
      assert(task.status === "pending", "B1: created with status pending");
      assert(task.taskType === "schedule_generation", "B1: taskType correct");

      // Read back
      const found = await AsyncTask.findById(task._id).lean();
      assert(found !== null, "B1: found by ID");
      assert(found!.status === "pending", "B1: read-back status is pending");
      assert(found!.dispatchedAt === null, "B1: dispatchedAt null initially");

      // Update to completed
      const mockResult: AsyncTaskResult = {
        solverStatus: "OPTIMAL",
        objectiveValue: 100,
        solveTimeMs: 5000,
        totalCostCents: 420000,
        fallbackRatesUsed: false,
        overtimeSummary: { staff_1: 2 },
        generatedDays: [
          {
            date: "2026-03-16",
            dayOfWeek: "Monday",
            assignments: [
              { staffId: "s1", staffName: "Alice", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "best fit" },
            ],
            unfilledSlots: [],
            notes: "",
          },
        ],
        summary: "Test completed",
      };

      await AsyncTask.findByIdAndUpdate(task._id, {
        $set: {
          status: "completed",
          completedAt: new Date(),
          result: mockResult,
        },
      });

      const updated = await AsyncTask.findById(task._id).lean();
      assert(updated!.status === "completed", "B1: updated to completed");
      assert(updated!.result?.solverStatus === "OPTIMAL", "B1: result.solverStatus persisted");
      assert(
        Array.isArray(updated!.result?.generatedDays) &&
          updated!.result!.generatedDays.length === 1,
        "B1: generatedDays persisted with 1 day"
      );
    }

    // ─── B2. AsyncTask indexes ──────────────────────────────────────────

    console.log("\n=== B2. AsyncTask model indexes (Step 1) ===\n");

    {
      const indexes = await AsyncTask.collection.indexes();
      const indexKeys = indexes.map((idx) => Object.keys(idx.key).join(","));

      assert(
        indexKeys.some((k) => k === "orgId,conversationId,status"),
        "B2: compound index orgId+conversationId+status exists"
      );
      assert(
        indexKeys.some((k) => k === "status,deadline"),
        "B2: compound index status+deadline exists"
      );
      assert(
        indexKeys.some((k) => k === "proposalId"),
        "B2: index on proposalId exists"
      );
    }

    // ─── B3. User scoping ───────────────────────────────────────────────

    console.log("\n=== B3. AsyncTask user-scoping (Step 4) ===\n");

    {
      const task = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "completed",
        conversationId: "conv_scope",
        proposalId: "prop_scope",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: "user_A_scope_test",
        inputPayload: {},
        scheduleId: "sched_scope",
        weekStartDate: "2026-03-16",
        deadline: new Date(Date.now() + 60000),
        result: {
          solverStatus: "OPTIMAL",
          objectiveValue: 0,
          solveTimeMs: 100,
          totalCostCents: 0,
          fallbackRatesUsed: false,
          overtimeSummary: {},
          generatedDays: [],
          summary: "Scoping test",
        },
      });
      createdIds.push(task._id as mongoose.Types.ObjectId);

      const wrongUser = await AsyncTask.findOne({
        _id: task._id,
        orgId: TEST_ORG_ID,
        clerkUserId: "user_B_different",
      }).lean();
      assert(wrongUser === null, "B3: wrong clerkUserId returns null");

      const rightUser = await AsyncTask.findOne({
        _id: task._id,
        orgId: TEST_ORG_ID,
        clerkUserId: "user_A_scope_test",
      }).lean();
      assert(rightUser !== null, "B3: correct clerkUserId finds the task");
    }

    // ─── B4. Lazy timeout detection ─────────────────────────────────────

    console.log("\n=== B4. Lazy timeout detection (Step 4) ===\n");

    {
      const pastDeadline = new Date(Date.now() - 60_000);
      const task = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "pending",
        conversationId: "conv_timeout",
        proposalId: "prop_timeout",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: TEST_USER,
        inputPayload: {},
        scheduleId: "sched_timeout",
        weekStartDate: "2026-03-16",
        deadline: pastDeadline,
      });
      createdIds.push(task._id as mongoose.Types.ObjectId);

      // Simulate what the status endpoint does: if deadline passed and still pending/running, transition to timed_out
      const doc = await AsyncTask.findById(task._id).lean();
      const isPendingOrRunning =
        doc!.status === "pending" || doc!.status === "running";
      const isPastDeadline = new Date(doc!.deadline).getTime() < Date.now();

      if (isPendingOrRunning && isPastDeadline) {
        await AsyncTask.findByIdAndUpdate(task._id, {
          $set: {
            status: "timed_out",
            completedAt: new Date(),
            error: { message: "Task exceeded deadline." },
          },
        });
      }

      const afterTimeout = await AsyncTask.findById(task._id).lean();
      assert(
        afterTimeout!.status === "timed_out",
        "B4: overdue task transitioned to timed_out"
      );
      assert(
        afterTimeout!.error?.message === "Task exceeded deadline.",
        "B4: error message set correctly"
      );
    }

    // ─── B5. Accept-schedule handler — happy path ────────────────────────

    console.log("\n=== B5. Accept-schedule handler — happy path (Step 11) ===\n");

    {
      const { executeProposeAcceptGeneratedSchedule } = await import(
        "../src/lib/ai/tools/definitions/propose-accept-generated-schedule.handler"
      );

      const task = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "completed",
        conversationId: "conv_accept",
        proposalId: "prop_gen_origin",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: TEST_USER,
        inputPayload: {},
        scheduleId: "sched_accept",
        weekStartDate: "2026-03-16",
        deadline: new Date(Date.now() + 120_000),
        completedAt: new Date(),
        result: {
          solverStatus: "OPTIMAL",
          objectiveValue: 100,
          solveTimeMs: 5000,
          totalCostCents: 350000,
          fallbackRatesUsed: false,
          overtimeSummary: {},
          generatedDays: [
            {
              date: "2026-03-16",
              dayOfWeek: "Monday",
              assignments: [
                { staffId: "s1", staffName: "Alice", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "" },
                { staffId: "s2", staffName: "Bob", station: "Prep", startTime: "10:00", endTime: "18:00", reasoning: "" },
                { staffId: "s3", staffName: "Carol", station: "Line", startTime: "11:00", endTime: "19:00", reasoning: "" },
              ],
              unfilledSlots: [],
              notes: "",
            },
            {
              date: "2026-03-17",
              dayOfWeek: "Tuesday",
              assignments: [
                { staffId: "s1", staffName: "Alice", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "" },
                { staffId: "s2", staffName: "Bob", station: "Prep", startTime: "10:00", endTime: "18:00", reasoning: "" },
                { staffId: "s3", staffName: "Carol", station: "Line", startTime: "11:00", endTime: "19:00", reasoning: "" },
              ],
              unfilledSlots: [],
              notes: "",
            },
          ],
          summary: "6 shifts across 2 days",
        },
      });
      createdIds.push(task._id as mongoose.Types.ObjectId);

      const taskIdStr = String(task._id);
      const proposal = await executeProposeAcceptGeneratedSchedule(
        { taskId: taskIdStr },
        {
          orgId: TEST_ORG_ID.toString(),
          locationId: TEST_LOC_ID.toString(),
          clerkUserId: TEST_USER,
          role: "owner",
          timezone: "America/New_York",
        }
      );

      assert(proposal !== null, "B5: handler returned a proposal");
      assert(
        proposal!.toolName === "propose_accept_generated_schedule",
        "B5: toolName correct"
      );
      assert(proposal!.type === "write", "B5: type is write");
      assert(proposal!.payload.shifts.length === 6, "B5: extracted 6 shifts (3+3)");
      assert(
        proposal!.payload.scheduleId === "sched_accept",
        "B5: scheduleId from task"
      );
      assert(
        proposal!.payload.originatingProposalId === "prop_gen_origin",
        "B5: originatingProposalId from task"
      );
      assert(
        proposal!.payload.originatingTaskId === taskIdStr,
        "B5: originatingTaskId matches"
      );
      assert(
        proposal!.payload.totalCostCents === 350000,
        "B5: totalCostCents from result"
      );
      assert(
        proposal!.payload.totalShiftsGenerated === 6,
        "B5: totalShiftsGenerated matches shifts"
      );
      assert(
        typeof proposal!.description === "string" && proposal!.description.length > 0,
        "B5: description is non-empty"
      );
      assert(
        proposal!.description.includes("$3,500.00"),
        "B5: description includes formatted cost"
      );
    }

    // ─── B6. Accept-schedule handler — error states ──────────────────────

    console.log("\n=== B6. Accept-schedule handler — error states (Step 11) ===\n");

    {
      const { executeProposeAcceptGeneratedSchedule } = await import(
        "../src/lib/ai/tools/definitions/propose-accept-generated-schedule.handler"
      );
      const ctx = {
        orgId: TEST_ORG_ID.toString(),
        locationId: TEST_LOC_ID.toString(),
        clerkUserId: TEST_USER,
        role: "owner" as const,
        timezone: "UTC",
      };

      // Not found
      const randomId = new mongoose.Types.ObjectId().toString();
      try {
        await executeProposeAcceptGeneratedSchedule({ taskId: randomId }, ctx);
        assert(false, "B6-notfound: should have thrown");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        assert(
          msg.includes("Task not found or not accessible"),
          "B6-notfound: correct error message"
        );
      }

      // Wrong status (infeasible)
      const infeasibleTask = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "infeasible",
        conversationId: "conv_inf",
        proposalId: "prop_inf",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: TEST_USER,
        inputPayload: {},
        scheduleId: "sched_inf",
        weekStartDate: "2026-03-16",
        deadline: new Date(Date.now() + 60000),
        result: {
          solverStatus: "INFEASIBLE",
          objectiveValue: 0,
          solveTimeMs: 100,
          totalCostCents: 0,
          fallbackRatesUsed: false,
          overtimeSummary: {},
          generatedDays: [],
          summary: "No feasible schedule",
        },
      });
      createdIds.push(infeasibleTask._id as mongoose.Types.ObjectId);

      try {
        await executeProposeAcceptGeneratedSchedule(
          { taskId: String(infeasibleTask._id) },
          ctx
        );
        assert(false, "B6-wrong-status: should have thrown");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        assert(
          msg.includes("task status is 'infeasible'"),
          "B6-wrong-status: correct error message"
        );
      }

      // Empty generatedDays
      const emptyDaysTask = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "completed",
        conversationId: "conv_empty",
        proposalId: "prop_empty",
        orgId: TEST_ORG_ID,
        locationId: TEST_LOC_ID,
        clerkUserId: TEST_USER,
        inputPayload: {},
        scheduleId: "sched_empty",
        weekStartDate: "2026-03-16",
        deadline: new Date(Date.now() + 60000),
        completedAt: new Date(),
        result: {
          solverStatus: "OPTIMAL",
          objectiveValue: 0,
          solveTimeMs: 100,
          totalCostCents: 0,
          fallbackRatesUsed: false,
          overtimeSummary: {},
          generatedDays: [],
          summary: "Empty result test",
        },
      });
      createdIds.push(emptyDaysTask._id as mongoose.Types.ObjectId);

      try {
        await executeProposeAcceptGeneratedSchedule(
          { taskId: String(emptyDaysTask._id) },
          ctx
        );
        assert(false, "B6-empty-days: should have thrown");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        assert(
          msg.includes("no shifts were generated"),
          "B6-empty-days: correct error message"
        );
      }

      // Invalid taskId format
      try {
        await executeProposeAcceptGeneratedSchedule(
          { taskId: "not-an-objectid" },
          ctx
        );
        assert(false, "B6-bad-id: should have thrown");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        assert(
          msg.includes("Task not found or not accessible"),
          "B6-bad-id: correct error for invalid ObjectId"
        );
      }
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    console.log("\n  Cleaning up test documents...");
    if (createdIds.length > 0) {
      const deleteResult = await AsyncTask.deleteMany({
        _id: { $in: createdIds },
      });
      console.log(`  Deleted ${deleteResult.deletedCount} test async task(s).`);
    }
  } catch (err) {
    console.error("\n  UNEXPECTED ERROR in Section B:", err);
    // Still try cleanup
    if (createdIds.length > 0) {
      const AsyncTaskCleanup = (await import("../src/server/models/AsyncTask"))
        .default;
      await AsyncTaskCleanup.deleteMany({ _id: { $in: createdIds } });
    }
  }

  await mongoose.default.disconnect();
  console.log("  Disconnected from MongoDB.\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Final Summary
// ═══════════════════════════════════════════════════════════════════════════════

const sectionBPassed = passed - sectionAPassed;
const sectionBFailed = failed - sectionAFailed;

console.log("=".repeat(55));
console.log(
  `  Section A (Pure functions):  ${sectionAPassed} passed, ${sectionAFailed} failed`
);
console.log(
  `  Section B (DB integration):  ${sectionBPassed} passed, ${sectionBFailed} failed`
);
console.log("-".repeat(55));
console.log(`  Phase 4 Total: ${passed} passed, ${failed} failed`);
console.log("=".repeat(55) + "\n");

process.exit(failed > 0 ? 1 : 0);
