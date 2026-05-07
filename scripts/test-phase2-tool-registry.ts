/**
 * Phase 2: Bounded Tool Registry — Verification Script
 *
 * Verifies all Phase 2 outputs (pure function tests, no DB required):
 *   1. Sanitization utilities (sanitizeUserText, sanitizeFields)
 *   2. Pagination utility (paginate, hard cap enforcement)
 *   3. Tool schemas (Zod validation for all 6 tools)
 *   4. Tool executor (executeTool — mock handlers)
 *   5. Tool registry wiring (6 tools, RBAC filtering, execute handlers)
 *   6. AI SDK adapter (toAISDKTools mapping)
 *   7. System prompt builder (buildSystemPrompt — all 7 sections)
 *
 * Run: npx tsx scripts/test-phase2-tool-registry.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { z } from "zod";
import { sanitizeUserText, sanitizeFields } from "../src/lib/ai/tools/sanitize";
import { paginate, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../src/lib/ai/tools/pagination";
import { executeTool } from "../src/lib/ai/tools/tool-executor";
import { getToolRegistry } from "../src/lib/ai/tools/tool-registry";
import { filterToolsForRole } from "../src/lib/ai/rbac/filter-tools";
import { toAISDKTools } from "../src/lib/ai/tools/ai-sdk-adapter";
import { buildSystemPrompt } from "../src/lib/ai/orchestrator/system-prompt";
import { getScheduleHealthParamsSchema } from "../src/lib/ai/tools/definitions/get-schedule-health.schema";
import { getShiftRosterParamsSchema } from "../src/lib/ai/tools/definitions/get-shift-roster.schema";
import { getStaffSummaryParamsSchema } from "../src/lib/ai/tools/definitions/get-staff-summary.schema";
import { getTimeOffRequestsParamsSchema } from "../src/lib/ai/tools/definitions/get-time-off-requests.schema";
import { proposeShiftSwapParamsSchema } from "../src/lib/ai/tools/definitions/propose-shift-swap.schema";
import { proposeScheduleGenerationParamsSchema } from "../src/lib/ai/tools/definitions/propose-schedule-generation.schema";
import { defineTool } from "../src/lib/ai/tools/tool-registry.types";
import type { AIToolDefinition, ToolExecutionContext } from "../src/lib/ai/tools/tool-registry.types";
import type { OrchestratorContext } from "../src/lib/ai/orchestrator/build-context";

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

const mockContext: ToolExecutionContext = {
  orgId: "org_test",
  locationId: "loc_test",
  clerkUserId: "user_test",
  role: "owner",
  timezone: "America/New_York",
};

// ─── 1. Sanitization Utilities ───────────────────────────────────────────────

console.log("\n=== 1. Sanitization Utilities ===\n");

assert(
  sanitizeUserText("My note") === "<untrusted_user_text>My note</untrusted_user_text>",
  "sanitizeUserText wraps text correctly"
);

assert(sanitizeUserText(null) === "", "sanitizeUserText(null) returns empty string");
assert(sanitizeUserText(undefined) === "", "sanitizeUserText(undefined) returns empty string");
assert(sanitizeUserText("") === "", "sanitizeUserText('') returns empty string");

assert(
  sanitizeUserText("<untrusted_user_text>hack</untrusted_user_text>") ===
    "<untrusted_user_text>hack</untrusted_user_text>",
  "Double-wrap prevention: strips existing tags then re-wraps"
);

assert(
  sanitizeUserText("<untrusted_user_text></untrusted_user_text>") === "",
  "Tags-only input (empty after stripping) returns empty string"
);

const obj = { name: "Alice", notes: "User note", id: "123", count: 42 };
const sanitized = sanitizeFields(obj, ["notes"]);
assert(
  sanitized.notes === "<untrusted_user_text>User note</untrusted_user_text>",
  "sanitizeFields wraps specified field"
);
assert(sanitized.name === "Alice", "sanitizeFields leaves unspecified string fields untouched");
assert(sanitized.id === "123", "sanitizeFields leaves other string fields untouched");
assert(sanitized.count === 42, "sanitizeFields leaves non-string fields untouched");

const original = { a: "hello", b: "world" };
const result = sanitizeFields(original, ["a", "b"]);
assert(original.a === "hello", "sanitizeFields does not mutate original object");
assert(
  result.a === "<untrusted_user_text>hello</untrusted_user_text>",
  "sanitizeFields wraps multiple fields"
);
assert(
  result.b === "<untrusted_user_text>world</untrusted_user_text>",
  "sanitizeFields wraps second field"
);

// ─── 2. Pagination Utility ───────────────────────────────────────────────────

console.log("\n=== 2. Pagination Utility ===\n");

assert(MAX_PAGE_SIZE === 20, "MAX_PAGE_SIZE is 20");
assert(DEFAULT_PAGE_SIZE === 10, "DEFAULT_PAGE_SIZE is 10");

const items25 = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

const p1 = paginate(items25, { page: 1, pageSize: 10 });
assert(p1.items.length === 10, "Page 1: returns 10 items");
assert(p1.pagination.totalRecords === 25, "Page 1: totalRecords is 25");
assert(p1.pagination.totalPages === 3, "Page 1: totalPages is 3");
assert(p1.pagination.hasNextPage === true, "Page 1: hasNextPage is true");
assert(p1.pagination.page === 1, "Page 1: page is 1");
assert(p1.pagination.pageSize === 10, "Page 1: pageSize is 10");

const p2 = paginate(items25, { page: 2, pageSize: 10 });
assert(p2.items.length === 10, "Page 2: returns 10 items");
assert(p2.pagination.hasNextPage === true, "Page 2: hasNextPage is true");

const p3 = paginate(items25, { page: 3, pageSize: 10 });
assert(p3.items.length === 5, "Page 3: returns 5 items");
assert(p3.pagination.hasNextPage === false, "Page 3: hasNextPage is false");

const p99 = paginate(items25, { page: 99, pageSize: 10 });
assert(p99.items.length === 0, "Page 99: returns 0 items (beyond total)");
assert(p99.pagination.hasNextPage === false, "Page 99: hasNextPage is false");

const pEmpty = paginate([], { page: 1, pageSize: 10 });
assert(pEmpty.items.length === 0, "Empty array: returns 0 items");
assert(pEmpty.pagination.totalRecords === 0, "Empty array: totalRecords is 0");
assert(pEmpty.pagination.totalPages === 0, "Empty array: totalPages is 0");
assert(pEmpty.pagination.hasNextPage === false, "Empty array: hasNextPage is false");

const pCapped = paginate(items25, { page: 1, pageSize: 100 });
assert(pCapped.items.length <= MAX_PAGE_SIZE, "Hard cap: pageSize clamped to MAX_PAGE_SIZE");
assert(pCapped.pagination.pageSize <= MAX_PAGE_SIZE, "Hard cap: pagination.pageSize clamped");

// ─── 3. Tool Schemas (Zod Validation) ───────────────────────────────────────

console.log("\n=== 3. Tool Schemas (Zod Validation) ===\n");

// get_schedule_health
const healthValid = getScheduleHealthParamsSchema.safeParse({ scheduleId: "abc123" });
assert(healthValid.success === true, "get_schedule_health: valid input accepted");

const healthEmpty = getScheduleHealthParamsSchema.safeParse({ scheduleId: "" });
assert(healthEmpty.success === false, "get_schedule_health: empty scheduleId rejected");

const healthMissing = getScheduleHealthParamsSchema.safeParse({});
assert(healthMissing.success === false, "get_schedule_health: missing scheduleId rejected");

// get_shift_roster
const rosterValid = getShiftRosterParamsSchema.safeParse({
  scheduleId: "abc123",
  page: 1,
  pageSize: 5,
});
assert(rosterValid.success === true, "get_shift_roster: valid input accepted");

const rosterDefaults = getShiftRosterParamsSchema.parse({ scheduleId: "abc123" });
assert(rosterDefaults.page === 1, "get_shift_roster: page defaults to 1");
assert(rosterDefaults.pageSize === DEFAULT_PAGE_SIZE, "get_shift_roster: pageSize defaults to 10");

const rosterBadPage = getShiftRosterParamsSchema.safeParse({
  scheduleId: "abc123",
  pageSize: 100,
});
assert(rosterBadPage.success === false, "get_shift_roster: pageSize 100 rejected (exceeds max)");

const rosterFilters = getShiftRosterParamsSchema.safeParse({
  scheduleId: "abc123",
  staffId: "staff_1",
  dayOfWeek: 3,
});
assert(rosterFilters.success === true, "get_shift_roster: optional filters accepted");

const rosterBadDay = getShiftRosterParamsSchema.safeParse({
  scheduleId: "abc123",
  dayOfWeek: 7,
});
assert(rosterBadDay.success === false, "get_shift_roster: dayOfWeek 7 rejected (max 6)");

// get_staff_summary
const staffValid = getStaffSummaryParamsSchema.safeParse({});
assert(staffValid.success === true, "get_staff_summary: empty input accepted (defaults applied)");
if (staffValid.success) {
  assert(staffValid.data.activeOnly === true, "get_staff_summary: activeOnly defaults to true");
}

const staffExplicit = getStaffSummaryParamsSchema.safeParse({ activeOnly: false });
assert(staffExplicit.success === true, "get_staff_summary: explicit activeOnly=false accepted");

// get_time_off_requests
const torValid = getTimeOffRequestsParamsSchema.safeParse({
  startDate: "2026-03-01",
  endDate: "2026-03-31",
});
assert(torValid.success === true, "get_time_off_requests: valid dates accepted");

const torMissing = getTimeOffRequestsParamsSchema.safeParse({ startDate: "2026-03-01" });
assert(torMissing.success === false, "get_time_off_requests: missing endDate rejected");

const torEmpty = getTimeOffRequestsParamsSchema.safeParse({ startDate: "", endDate: "" });
assert(torEmpty.success === false, "get_time_off_requests: empty dates rejected");

const torStatus = getTimeOffRequestsParamsSchema.safeParse({
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  status: "pending",
});
assert(torStatus.success === true, "get_time_off_requests: valid status accepted");

const torBadStatus = getTimeOffRequestsParamsSchema.safeParse({
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  status: "invalid",
});
assert(torBadStatus.success === false, "get_time_off_requests: invalid status rejected");

// propose_shift_swap
const swapValid = proposeShiftSwapParamsSchema.safeParse({
  shiftId: "shift_1",
  targetStaffId: "staff_2",
});
assert(swapValid.success === true, "propose_shift_swap: valid input accepted");

const swapEmpty = proposeShiftSwapParamsSchema.safeParse({
  shiftId: "",
  targetStaffId: "staff_2",
});
assert(swapEmpty.success === false, "propose_shift_swap: empty shiftId rejected");

const swapReason = proposeShiftSwapParamsSchema.safeParse({
  shiftId: "shift_1",
  targetStaffId: "staff_2",
  reason: "Vacation coverage",
});
assert(swapReason.success === true, "propose_shift_swap: optional reason accepted");

const swapLongReason = proposeShiftSwapParamsSchema.safeParse({
  shiftId: "shift_1",
  targetStaffId: "staff_2",
  reason: "x".repeat(201),
});
assert(swapLongReason.success === false, "propose_shift_swap: reason >200 chars rejected");

// propose_schedule_generation
const genValid = proposeScheduleGenerationParamsSchema.safeParse({
  weekStartDate: "2026-03-16",
});
assert(genValid.success === true, "propose_schedule_generation: valid input accepted");

const genEmpty = proposeScheduleGenerationParamsSchema.safeParse({ weekStartDate: "" });
assert(genEmpty.success === false, "propose_schedule_generation: empty weekStartDate rejected");

const genLong = proposeScheduleGenerationParamsSchema.safeParse({
  weekStartDate: "2026-03-16",
  additionalInstructions: "x".repeat(501),
});
assert(genLong.success === false, "propose_schedule_generation: instructions >500 chars rejected");

// ─── 4. Tool Executor ───────────────────────────────────────────────────────

console.log("\n=== 4. Tool Executor (executeTool) ===\n");

const mockToolList: AIToolDefinition[] = [
  defineTool({
    name: "test_tool",
    description: "A test tool",
    requiredPermission: "schedule:read",
    parameters: z.object({ id: z.string().min(1) }),
    execute: async (params, _context) => ({ found: true, id: params.id }),
  }),
  defineTool({
    name: "null_tool",
    description: "Returns null",
    requiredPermission: "schedule:read",
    parameters: z.object({}),
    execute: async (_params, _context) => null,
  }),
  defineTool({
    name: "throwing_tool",
    description: "Throws an error",
    requiredPermission: "schedule:read",
    parameters: z.object({}),
    execute: async (_params, _context) => {
      throw new Error("Something broke");
    },
  }),
  defineTool({
    name: "no_handler_tool",
    description: "Has no execute",
    requiredPermission: "schedule:read",
    parameters: z.object({}),
  }),
];

await (async () => {
  // Unknown tool
  const r1 = await executeTool("nonexistent", {}, mockContext, mockToolList);
  assert(r1.success === false, "Executor: unknown tool returns failure");
  assert(r1.errorCode === "PERMISSION_DENIED", "Executor: unknown tool errorCode is PERMISSION_DENIED");
  assert(
    r1.error!.includes("not available for your role"),
    "Executor: unknown tool error message correct"
  );

  // Valid execution
  const r2 = await executeTool("test_tool", { id: "abc" }, mockContext, mockToolList);
  assert(r2.success === true, "Executor: valid call returns success");
  assert((r2.data as any).found === true, "Executor: valid call returns data");
  assert((r2.data as any).id === "abc", "Executor: valid call passes params through");

  // Zod validation failure
  const r3 = await executeTool("test_tool", { id: "" }, mockContext, mockToolList);
  assert(r3.success === false, "Executor: invalid params returns failure");
  assert(r3.errorCode === "VALIDATION_FAILED", "Executor: invalid params errorCode is VALIDATION_FAILED");
  assert(r3.error!.includes("Invalid parameters"), "Executor: invalid params error message correct");

  // Zod validation failure — missing field
  const r3b = await executeTool("test_tool", {}, mockContext, mockToolList);
  assert(r3b.success === false, "Executor: missing params returns failure");
  assert(r3b.errorCode === "VALIDATION_FAILED", "Executor: missing params errorCode correct");

  // Handler returns null (NOT_FOUND)
  const r4 = await executeTool("null_tool", {}, mockContext, mockToolList);
  assert(r4.success === false, "Executor: null return maps to failure");
  assert(r4.errorCode === "NOT_FOUND", "Executor: null return errorCode is NOT_FOUND");

  // Handler throws
  const r5 = await executeTool("throwing_tool", {}, mockContext, mockToolList);
  assert(r5.success === false, "Executor: thrown error maps to failure (never throws)");
  assert(r5.errorCode === "EXECUTION_FAILED", "Executor: thrown error errorCode is EXECUTION_FAILED");
  assert(r5.error!.includes("Something broke"), "Executor: thrown error message preserved");

  // Missing execute handler
  const r6 = await executeTool("no_handler_tool", {}, mockContext, mockToolList);
  assert(r6.success === false, "Executor: missing handler returns failure");
  assert(r6.errorCode === "EXECUTION_FAILED", "Executor: missing handler errorCode is EXECUTION_FAILED");
})();

// ─── 5. Tool Registry Wiring ─────────────────────────────────────────────────

console.log("\n=== 5. Tool Registry Wiring ===\n");

const registry = getToolRegistry();
assert(registry.length === 6, `Registry has 6 tools (got ${registry.length})`);

const registryNames = registry.map((t) => t.name);
assert(new Set(registryNames).size === registryNames.length, "No duplicate tool names in registry");

const expectedNames = [
  "get_schedule_health",
  "get_shift_roster",
  "get_staff_summary",
  "get_time_off_requests",
  "propose_shift_swap",
  "propose_schedule_generation",
];
for (const name of expectedNames) {
  assert(registryNames.includes(name), `Registry contains '${name}'`);
}

for (const tool of registry) {
  assert(typeof tool.execute === "function", `Tool '${tool.name}' has an execute handler`);
}

assert(Object.isFrozen(registry), "getToolRegistry() returns a frozen array");

// RBAC filtering with real registry
const ownerTools = filterToolsForRole("owner", [...registry]);
assert(ownerTools.length === 6, `Owner gets all 6 tools (got ${ownerTools.length})`);

const managerTools = filterToolsForRole("manager", [...registry]);
assert(managerTools.length === 6, `Manager gets 6 tools (got ${managerTools.length})`);

const shiftLeadTools = filterToolsForRole("shift_lead", [...registry]);
const shiftLeadNames = shiftLeadTools.map((t) => t.name);
assert(
  shiftLeadTools.length === 5,
  `Shift lead gets 5 tools (got ${shiftLeadTools.length})`
);
assert(
  !shiftLeadNames.includes("propose_schedule_generation"),
  "Shift lead excluded from propose_schedule_generation (schedule:generate)"
);
assert(
  shiftLeadNames.includes("get_schedule_health"),
  "Shift lead has get_schedule_health (schedule:read)"
);
assert(
  shiftLeadNames.includes("propose_shift_swap"),
  "Shift lead has propose_shift_swap (shift:swap)"
);

// ─── 6. AI SDK Adapter ──────────────────────────────────────────────────────

console.log("\n=== 6. AI SDK Adapter (toAISDKTools) ===\n");

const sdkTools = toAISDKTools([...registry], mockContext);
const sdkToolNames = Object.keys(sdkTools);

assert(sdkToolNames.length === 6, `SDK adapter produces 6 tools (got ${sdkToolNames.length})`);

for (const name of expectedNames) {
  assert(name in sdkTools, `SDK tools contains '${name}'`);
}

// Invalid tool name handling
const originalWarn = console.warn;
let warnMessages: string[] = [];
console.warn = (...args: unknown[]) => {
  warnMessages.push(args.join(" "));
};

const withInvalid: AIToolDefinition[] = [
  {
    name: "invalid name with spaces",
    description: "Bad",
    requiredPermission: "schedule:read",
    parameters: z.object({}),
    execute: async () => ({}),
  },
];
const invalidResult = toAISDKTools(withInvalid, mockContext);
console.warn = originalWarn;

assert(Object.keys(invalidResult).length === 0, "SDK adapter skips tool with invalid name");
assert(
  warnMessages.some((m) => m.includes("invalid name")),
  "SDK adapter logs warning for invalid tool name"
);

// Manual tool (no execute handler)
warnMessages = [];
console.warn = (...args: unknown[]) => {
  warnMessages.push(args.join(" "));
};

const withNoHandler: AIToolDefinition[] = [
  {
    name: "manual_tool",
    description: "No handler",
    requiredPermission: "schedule:read",
    parameters: z.object({}),
  },
];
const manualResult = toAISDKTools(withNoHandler, mockContext);
console.warn = originalWarn;

assert("manual_tool" in manualResult, "SDK adapter registers manual tool (no execute)");
assert(
  warnMessages.some((m) => m.includes("no execute handler")),
  "SDK adapter logs warning for manual tool"
);

// ─── 7. System Prompt Builder ────────────────────────────────────────────────

console.log("\n=== 7. System Prompt Builder (buildSystemPrompt) ===\n");

const mockOrchestratorContext: OrchestratorContext = {
  auth: { clerkUserId: "user_1", orgId: "org_1", locationId: "loc_1", role: "manager" },
  allowedTools: [
    { name: "get_schedule_health", description: "...", requiredPermission: "schedule:read" as const, parameters: z.object({}) },
    { name: "get_shift_roster", description: "...", requiredPermission: "shift:read" as const, parameters: z.object({}) },
  ],
  viewport: {
    viewport: { locationId: "loc_1", activeView: "schedule" as const },
    accessVerified: true as const,
    locationResolution: "same_as_auth" as const,
  },
  userMessage: "Show me next week",
};

const prompt = buildSystemPrompt(mockOrchestratorContext, "America/New_York");

assert(prompt.includes("Sous AI"), "Prompt: has identity (Sous AI)");
assert(prompt.includes("manager"), "Prompt: has role (manager)");
assert(prompt.includes("2 tools"), "Prompt: has tool count (2 tools)");
assert(prompt.includes("untrusted_user_text"), "Prompt: has injection guardrail tag");
assert(prompt.includes("NEVER execute"), "Prompt: has guardrail instruction");
assert(prompt.includes("IGNORE them entirely"), "Prompt: has guardrail ignore instruction");
assert(prompt.includes("schedule"), "Prompt: has viewport context (schedule)");
assert(prompt.includes("loc_1"), "Prompt: has location ID");
assert(prompt.includes("paginated"), "Prompt: has pagination awareness");
assert(prompt.includes("Current Time Context"), "Prompt: has temporal context header");
assert(prompt.includes("2026"), "Prompt: has current year");
assert(prompt.includes("America/New_York"), "Prompt: has timezone");

// Verify temporal context includes day of week
const currentDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
}).format(new Date());
assert(prompt.includes(currentDay), `Prompt: has current day of week (${currentDay})`);

// Test with no tools (empty allowedTools)
const noToolsContext: OrchestratorContext = {
  ...mockOrchestratorContext,
  allowedTools: [],
};
const noToolsPrompt = buildSystemPrompt(noToolsContext, "UTC");
assert(
  noToolsPrompt.includes("no tools available"),
  "Prompt: empty tools produces 'no tools available'"
);
assert(
  noToolsPrompt.includes("general questions"),
  "Prompt: empty tools mentions general questions fallback"
);

// Test viewport with all optional fields
const fullViewportContext: OrchestratorContext = {
  ...mockOrchestratorContext,
  viewport: {
    viewport: {
      locationId: "loc_1",
      activeView: "schedule" as const,
      scheduleId: "sched_abc",
      staffId: "staff_xyz",
      focusedDay: 2,
    },
    accessVerified: true as const,
    locationResolution: "same_as_auth" as const,
  },
};
const fullPrompt = buildSystemPrompt(fullViewportContext, "UTC");
assert(fullPrompt.includes("sched_abc"), "Prompt: full viewport includes scheduleId");
assert(fullPrompt.includes("staff_xyz"), "Prompt: full viewport includes staffId");
assert(fullPrompt.includes("Wednesday"), "Prompt: focusedDay 2 maps to Wednesday");

// Test viewport with no optional fields (no undefined in output)
const minimalViewportContext: OrchestratorContext = {
  ...mockOrchestratorContext,
  viewport: {
    viewport: { locationId: "loc_minimal" },
    accessVerified: true as const,
    locationResolution: "same_as_auth" as const,
  },
};
const minimalPrompt = buildSystemPrompt(minimalViewportContext, "UTC");
assert(!minimalPrompt.includes("undefined"), "Prompt: minimal viewport has no 'undefined' text");
assert(minimalPrompt.includes("loc_minimal"), "Prompt: minimal viewport includes locationId");

// Test default timezone
const defaultTzPrompt = buildSystemPrompt(mockOrchestratorContext);
assert(defaultTzPrompt.includes("UTC"), "Prompt: defaults to UTC when no timezone given");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`  Phase 2 Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50) + "\n");

process.exit(failed > 0 ? 1 : 0);
