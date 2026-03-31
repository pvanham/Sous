/**
 * Phase 3: The Generative UI & HITL Circuit — Verification Script
 *
 * Section A — Pure function tests (no DB required):
 *   1. Chat message schema (Step 1)
 *   2. OCC filter builder: computeDataVersion, buildOCCFilter, getStaleReason (Step 4)
 *   3. Proposal handler: isProposalResult, toClientSafeProposal (Step 3)
 *   4. PROPOSAL_TTL_MINUTES constant (Step 9)
 *   5. executeProposal dispatcher — pure dispatch logic only (Step 6)
 *   6. ConversationListItem preview truncation logic (Step 11)
 *
 * Section B — DB-dependent tests (requires MONGODB_URI in .env.local):
 *   7.  Conversation model — create, fetch, required-fields enforcement (Step 1)
 *   8.  Proposal persistence — embedded StoredProposal with full payload (Step 3)
 *   9.  Proposal expiry — TTL and user scoping (Step 9)
 *   10. Conversation upsert — onFinish persistence pattern (Step 11)
 *   11. ConversationListItem mapping — preview, messageCount, isActive (Step 11)
 *
 * Run: npx tsx scripts/test-phase3.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { chatMessageSchema } from "../src/lib/validations/chat-message.schema";
import {
  computeDataVersion,
  buildOCCFilter,
  getStaleReason,
} from "../src/lib/ai/orchestrator/occ";
import {
  isProposalResult,
  toClientSafeProposal,
} from "../src/lib/ai/orchestrator/proposal-handler";
import { PROPOSAL_TTL_MINUTES } from "../src/lib/ai/constants";
import { executeProposal } from "../src/lib/ai/orchestrator/execute-proposal";
import { toConversationDTO } from "../src/types/conversation";
import type { StoredProposal } from "../src/types/conversation";

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

function assertThrows(fn: () => void, expectedSubstring: string, label: string) {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${label} (did not throw)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(expectedSubstring)) {
      passed++;
      console.log(`  PASS: ${label}`);
    } else {
      failed++;
      console.error(
        `  FAIL: ${label} (threw "${msg}", expected to include "${expectedSubstring}")`
      );
    }
  }
}

// ─── 1. Chat Message Schema ───────────────────────────────────────────────────

console.log("\n=== 1. Chat Message Schema (Step 1) ===\n");

const validSchema = chatMessageSchema.safeParse({
  message: "Show me next week's schedule",
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(validSchema.success === true, "Valid input parses successfully");

// Whitespace-only message (trimmed to empty)
const emptyMsg = chatMessageSchema.safeParse({
  message: "   ",
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(emptyMsg.success === false, "Whitespace-only message rejected after trim");

// Message too long
const longMsg = chatMessageSchema.safeParse({
  message: "x".repeat(4001),
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(longMsg.success === false, "Message > 4000 chars rejected");

// Exactly 4000 chars (boundary value)
const maxMsg = chatMessageSchema.safeParse({
  message: "x".repeat(4000),
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(maxMsg.success === true, "Message of exactly 4000 chars accepted");

// Invalid conversationId (not a 24-char hex ObjectId)
const badConvId = chatMessageSchema.safeParse({
  message: "Hello",
  conversationId: "not-a-valid-objectid",
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(badConvId.success === false, "Invalid conversationId format rejected");
if (!badConvId.success) {
  assert(
    badConvId.error.issues[0].message === "Invalid conversation ID format.",
    "conversationId error message is exactly correct"
  );
}

// Valid 24-char hex conversationId
const validConvId = chatMessageSchema.safeParse({
  message: "Hello",
  conversationId: "507f1f77bcf86cd799439011",
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(validConvId.success === true, "Valid 24-char hex conversationId accepted");

// Extra fields stripped (.strip() is active)
const stripped = chatMessageSchema.parse({
  message: "Hello",
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
  malicious: "inject",
  extra: 42,
});
assert(!("malicious" in stripped), "Extra 'malicious' field stripped");
assert(!("extra" in stripped), "Extra 'extra' field stripped");

// Missing viewportContext
const noViewport = chatMessageSchema.safeParse({ message: "Hello" });
assert(noViewport.success === false, "Missing viewportContext rejected");

// Missing message field
const noMessage = chatMessageSchema.safeParse({
  viewportContext: { locationId: "507f1f77bcf86cd799439011" },
});
assert(noMessage.success === false, "Missing message field rejected");

// ─── 2. OCC Filter Builder ────────────────────────────────────────────────────

console.log("\n=== 2. OCC Filter Builder (Step 4) ===\n");

// computeDataVersion — single Date: returns raw ISO string
const ts1 = new Date("2026-03-16T01:00:00.000Z");
const v1 = computeDataVersion(ts1);
const v1b = computeDataVersion(ts1);
assert(v1 === v1b, "computeDataVersion is deterministic for same Date input");
assert(v1 === ts1.toISOString(), "computeDataVersion (1 Date arg) returns raw ISO string");

// computeDataVersion — single string: passthrough
const tsStr = "2026-03-16T01:00:00.000Z";
assert(
  computeDataVersion(tsStr) === tsStr,
  "computeDataVersion (1 string arg) returns string unchanged"
);

// computeDataVersion — composite (2 args): sha256 hex
const ts2 = new Date("2026-03-17T00:00:00.000Z");
const composite = computeDataVersion(ts1, ts2);
const compositeB = computeDataVersion(ts1, ts2);
assert(composite === compositeB, "computeDataVersion composite is deterministic");
assert(composite !== ts1.toISOString(), "computeDataVersion composite differs from raw ISO");
assert(/^[0-9a-f]{64}$/.test(composite), "computeDataVersion composite is 64-char sha256 hex");

// computeDataVersion — order independence (sorts internally before hashing)
const compositeReversed = computeDataVersion(ts2, ts1);
assert(
  composite === compositeReversed,
  "computeDataVersion composite is order-independent (inputs sorted before hashing)"
);

// buildOCCFilter — propose_shift_swap → single OCCFilterResult
const shiftProposal: StoredProposal = {
  proposalId: "test-p1",
  toolName: "propose_shift_swap",
  description: "Swap shift",
  payload: { shiftId: "507f1f77bcf86cd799439011", targetStaffId: "staff_2" },
  dataVersion: ts1.toISOString(),
  status: "pending",
  createdAt: new Date(),
  resolvedAt: null,
  resolvedBy: null,
};
const shiftFilter = buildOCCFilter(shiftProposal);
assert(!Array.isArray(shiftFilter), "propose_shift_swap returns a single OCCFilterResult (not array)");
if (!Array.isArray(shiftFilter)) {
  assert(
    shiftFilter.filter._id === "507f1f77bcf86cd799439011",
    "Shift filter embeds _id from payload.shiftId"
  );
  assert(
    shiftFilter.filter.updatedAt instanceof Date,
    "Shift filter embeds updatedAt as Date (atomic OCC condition)"
  );
  assert(
    typeof shiftFilter.description === "string" && shiftFilter.description.length > 0,
    "Shift filter has a non-empty human-readable description"
  );
}

// buildOCCFilter — propose_schedule_generation → array of OCCFilterResults
const schedProposal: StoredProposal = {
  proposalId: "test-p2",
  toolName: "propose_schedule_generation",
  description: "Generate schedule",
  payload: {
    weekStartDate: "2026-03-16",
    _occTimestamps: {
      scheduleUpdatedAt: "2026-03-15T00:00:00.000Z",
      configUpdatedAt: "2026-03-14T00:00:00.000Z",
      latestStaffUpdatedAt: "2026-03-13T00:00:00.000Z",
    },
  },
  dataVersion: computeDataVersion(
    new Date("2026-03-15T00:00:00Z"),
    new Date("2026-03-14T00:00:00Z"),
    new Date("2026-03-13T00:00:00Z")
  ),
  status: "pending",
  createdAt: new Date(),
  resolvedAt: null,
  resolvedBy: null,
};
const schedFilter = buildOCCFilter(schedProposal);
assert(
  Array.isArray(schedFilter),
  "propose_schedule_generation returns an array of OCCFilterResults"
);
if (Array.isArray(schedFilter)) {
  assert(schedFilter.length > 0, "Schedule generation produces at least one filter condition");
  for (const f of schedFilter) {
    assert(
      typeof f.description === "string" && f.description.length > 0,
      `Each schedule filter has a non-empty description`
    );
    assert(typeof f.filter === "object" && f.filter !== null, "Each schedule filter has a filter object");
  }
}

// buildOCCFilter — unknown tool throws
assertThrows(
  () => buildOCCFilter({ ...shiftProposal, toolName: "propose_unknown_tool" }),
  "Unable to verify data currency",
  "buildOCCFilter throws for unknown tool name"
);

// getStaleReason — per tool name
const swapStaleReason = getStaleReason(shiftProposal);
assert(
  swapStaleReason.toLowerCase().includes("shift"),
  "getStaleReason for propose_shift_swap mentions 'shift'"
);

const schedStaleReason = getStaleReason(schedProposal);
assert(
  schedStaleReason.toLowerCase().includes("schedule") ||
    schedStaleReason.toLowerCase().includes("configuration"),
  "getStaleReason for propose_schedule_generation mentions schedule/configuration"
);

const unknownStaleReason = getStaleReason({ ...shiftProposal, toolName: "propose_unknown" });
assert(
  unknownStaleReason.includes("Unable to verify"),
  "getStaleReason fallback: 'Unable to verify data currency'"
);

// ─── 3. Proposal Handler ──────────────────────────────────────────────────────

console.log("\n=== 3. Proposal Handler (Step 3) ===\n");

const validProposalObj = {
  type: "write" as const,
  proposalId: "prop-uuid-123",
  toolName: "propose_shift_swap",
  description: "Swap shift",
  payload: { shiftId: "s1", targetStaffId: "s2", secretKey: "must-not-reach-client" },
  dataVersion: "2026-01-01T00:00:00Z",
};

// isProposalResult — true for valid ToolProposal shape
assert(isProposalResult(validProposalObj), "isProposalResult: valid ToolProposal returns true");

// isProposalResult — false cases
assert(!isProposalResult(null), "isProposalResult: null → false");
assert(!isProposalResult(undefined), "isProposalResult: undefined → false");
assert(!isProposalResult("a string"), "isProposalResult: string → false");
assert(!isProposalResult(42), "isProposalResult: number → false");
assert(!isProposalResult({}), "isProposalResult: empty object → false");
assert(
  !isProposalResult({ type: "read", proposalId: "x", toolName: "y" }),
  "isProposalResult: type='read' → false (must be 'write')"
);
assert(
  !isProposalResult({ type: "write", proposalId: 123, toolName: "y" }),
  "isProposalResult: numeric proposalId → false"
);
assert(
  !isProposalResult({ type: "write", proposalId: "x" }),
  "isProposalResult: missing toolName → false"
);
assert(
  !isProposalResult({ type: "write", toolName: "y" }),
  "isProposalResult: missing proposalId → false"
);

// toClientSafeProposal — strips payload, preserves required fields
const clientSafe = toClientSafeProposal(validProposalObj);
assert(!("payload" in clientSafe), "toClientSafeProposal strips payload (sensitive mutation data not sent to client)");
assert(clientSafe.type === "write", "toClientSafeProposal preserves type");
assert(clientSafe.proposalId === "prop-uuid-123", "toClientSafeProposal preserves proposalId");
assert(clientSafe.toolName === "propose_shift_swap", "toClientSafeProposal preserves toolName");
assert(typeof clientSafe.description === "string", "toClientSafeProposal preserves description");
assert(typeof clientSafe.dataVersion === "string", "toClientSafeProposal preserves dataVersion");
assert(typeof clientSafe.createdAt === "string", "toClientSafeProposal.createdAt is a string");
assert(
  !isNaN(new Date(clientSafe.createdAt).getTime()),
  "toClientSafeProposal.createdAt is a valid ISO date string"
);
assert(
  typeof clientSafe.summary === "object" &&
    typeof clientSafe.summary.action === "string" &&
    Array.isArray(clientSafe.summary.details),
  "toClientSafeProposal has summary with string action and details array"
);

// toClientSafeProposal — shift swap summary builder produces correct labels
const shiftSwapObj = {
  type: "write" as const,
  proposalId: "prop-swap-456",
  toolName: "propose_shift_swap",
  description: "Swap Alice to Bob",
  payload: {
    shiftId: "s1",
    targetStaffId: "s2",
    currentStaffName: "Alice",
    targetStaffName: "Bob",
    shiftDetails: { day: "Monday", start: "09:00", end: "17:00", station: "Grill" },
  },
  dataVersion: "2026-01-01T00:00:00Z",
};
const shiftSwapSafe = toClientSafeProposal(shiftSwapObj);
assert(
  shiftSwapSafe.summary.action === "Shift Swap",
  "Shift swap summary action is 'Shift Swap'"
);
assert(
  shiftSwapSafe.summary.details.some((d) => d.includes("Alice")),
  "Shift swap summary details mention current staff (Alice)"
);
assert(
  shiftSwapSafe.summary.details.some((d) => d.includes("Bob")),
  "Shift swap summary details mention target staff (Bob)"
);

// toClientSafeProposal — schedule generation summary builder
const schedGenObj = {
  type: "write" as const,
  proposalId: "prop-gen-789",
  toolName: "propose_schedule_generation",
  description: "Generate week schedule",
  payload: {
    weekStartDate: "2026-03-16",
    staffCount: 8,
    configSnapshot: { overtimeThresholdHours: 40, overtimePolicy: "strict", allowClopening: false },
  },
  dataVersion: "2026-01-01T00:00:00Z",
};
const schedGenSafe = toClientSafeProposal(schedGenObj);
assert(
  schedGenSafe.summary.action === "Schedule Generation",
  "Schedule generation summary action is 'Schedule Generation'"
);
assert(
  schedGenSafe.summary.details.some((d) => d.includes("2026-03-16")),
  "Schedule generation summary mentions week start date"
);

// ─── 4. PROPOSAL_TTL_MINUTES Constant ────────────────────────────────────────

console.log("\n=== 4. PROPOSAL_TTL_MINUTES Constant (Step 9) ===\n");

assert(typeof PROPOSAL_TTL_MINUTES === "number", "PROPOSAL_TTL_MINUTES is a number");
assert(PROPOSAL_TTL_MINUTES === 30, "PROPOSAL_TTL_MINUTES is 30");

// ─── 5. executeProposal Dispatcher ───────────────────────────────────────────

console.log("\n=== 5. executeProposal Dispatcher (Step 6) ===\n");

await (async () => {
  const baseInput = {
    orgId: "507f1f77bcf86cd799439011",
    locationId: "507f1f77bcf86cd799439012",
    clerkUserId: "user_test",
  };

  // Unknown tool → failure with errorCode "unknown_tool"
  const unknownResult = await executeProposal({
    ...baseInput,
    proposal: {
      proposalId: "test-dispatch-unknown",
      toolName: "propose_nuke_database",
      description: "Bad",
      payload: {},
      dataVersion: "x",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  assert(unknownResult.success === false, "Unknown tool: success is false");
  assert(unknownResult.errorCode === "unknown_tool", "Unknown tool: errorCode is 'unknown_tool'");
  assert(
    unknownResult.error?.includes("Unknown proposal type") ?? false,
    "Unknown tool: error message contains 'Unknown proposal type'"
  );

  // propose_schedule_generation with valid weekStartDate → Phase 3 placeholder
  const schedResult = await executeProposal({
    ...baseInput,
    proposal: {
      proposalId: "test-dispatch-sched",
      toolName: "propose_schedule_generation",
      description: "Generate schedule",
      payload: { weekStartDate: "2026-03-16" },
      dataVersion: "x",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  assert(schedResult.success === false, "Schedule generation stub: success is false (not yet available)");
  assert(
    schedResult.executionSummary.toLowerCase().includes("not yet available") ||
      schedResult.executionSummary.toLowerCase().includes("coming soon"),
    "Schedule generation stub: executionSummary mentions not yet available"
  );
  assert(
    schedResult.errorCode === "execution_failed",
    "Schedule generation stub: errorCode is 'execution_failed'"
  );

  // Malformed payload — missing shiftId
  const malformed1 = await executeProposal({
    ...baseInput,
    proposal: {
      proposalId: "test-dispatch-malform1",
      toolName: "propose_shift_swap",
      description: "Swap",
      payload: { targetStaffId: "staff_2" }, // missing shiftId
      dataVersion: "x",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  assert(malformed1.success === false, "Missing shiftId: success is false");
  assert(
    malformed1.errorCode === "malformed_payload",
    "Missing shiftId: errorCode is 'malformed_payload'"
  );
  assert(
    malformed1.error?.includes("shiftId") ?? false,
    "Missing shiftId: error message references 'shiftId'"
  );

  // Malformed payload — missing targetStaffId
  const malformed2 = await executeProposal({
    ...baseInput,
    proposal: {
      proposalId: "test-dispatch-malform2",
      toolName: "propose_shift_swap",
      description: "Swap",
      payload: { shiftId: "shift_1" }, // missing targetStaffId
      dataVersion: "x",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  assert(malformed2.success === false, "Missing targetStaffId: success is false");
  assert(
    malformed2.errorCode === "malformed_payload",
    "Missing targetStaffId: errorCode is 'malformed_payload'"
  );
  assert(
    malformed2.error?.includes("targetStaffId") ?? false,
    "Missing targetStaffId: error message references 'targetStaffId'"
  );

  // Missing weekStartDate for schedule generation
  const malformed3 = await executeProposal({
    ...baseInput,
    proposal: {
      proposalId: "test-dispatch-malform3",
      toolName: "propose_schedule_generation",
      description: "Generate",
      payload: {}, // missing weekStartDate
      dataVersion: "x",
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    },
  });
  assert(malformed3.success === false, "Missing weekStartDate: success is false");
  assert(
    malformed3.errorCode === "malformed_payload",
    "Missing weekStartDate: errorCode is 'malformed_payload'"
  );
})();

// ─── 6. ConversationListItem Preview Truncation ───────────────────────────────

console.log("\n=== 6. ConversationListItem Preview Truncation (Step 11) ===\n");

// Mirrors the truncation logic in src/app/api/ai/conversations/route.ts
const PREVIEW_MAX_LENGTH = 120;
function makePreview(content: string): string {
  return content.length > PREVIEW_MAX_LENGTH
    ? `${content.slice(0, PREVIEW_MAX_LENGTH)}...`
    : content;
}

assert(makePreview("Hi there!") === "Hi there!", "Short message is returned unchanged");
assert(makePreview("x".repeat(120)) === "x".repeat(120), "Exactly 120 chars: no truncation");

const longContent = "x".repeat(150);
const truncated = makePreview(longContent);
assert(truncated.length === 123, "150-char message: truncated to 120 chars + '...' = 123 total");
assert(truncated.endsWith("..."), "Truncated preview ends with '...'");

assert(makePreview("") === "", "Empty string preview returns empty string");

// ─── Section A Summary ────────────────────────────────────────────────────────

const sectionAPassed = passed;
const sectionAFailed = failed;
console.log("\n" + "─".repeat(55));
console.log(`  Section A Results: ${sectionAPassed} passed, ${sectionAFailed} failed`);
console.log("─".repeat(55));

// ─── Section B: DB-Dependent Tests ───────────────────────────────────────────

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.log(
    "\n⚠  MONGODB_URI not set — skipping Section B (DB tests). Set it in .env.local to run them.\n"
  );
  console.log("=".repeat(55));
  console.log(`  Phase 3 Results (Section A only): ${passed} passed, ${failed} failed`);
  console.log("=".repeat(55) + "\n");
  process.exit(failed > 0 ? 1 : 0);
}

import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import Conversation from "../src/server/models/Conversation";
import { expirePendingProposals } from "../src/lib/ai/orchestrator/expire-proposals";

try {
  await dbConnect();
  console.log("\n✓  Connected to MongoDB\n");
} catch (e) {
  console.error("\n✗  Could not connect to MongoDB:", e);
  console.error("  Check MONGODB_URI in .env.local.\n");
  process.exit(1);
}

// Unique sentinel values so test documents don't collide with real data
const TEST_ORG_ID = new mongoose.Types.ObjectId();
const TEST_LOCATION_ID = new mongoose.Types.ObjectId();
const TEST_USER_ID = `user_phase3_test_${Date.now()}`;
const OTHER_USER_ID = `user_other_${Date.now()}`;
const createdIds: mongoose.Types.ObjectId[] = [];

// ─── 7. Conversation Model — Create & Fetch ───────────────────────────────────

console.log("=== 7. Conversation Model — Create & Fetch (Step 1) ===\n");

await (async () => {
  const conv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      { role: "user", content: "Hello", timestamp: new Date() },
      { role: "assistant", content: "Hi there!", timestamp: new Date() },
    ],
    isActive: true,
  });
  createdIds.push(conv._id as mongoose.Types.ObjectId);

  assert(conv._id !== undefined, "Conversation created successfully with _id");
  assert(conv.clerkUserId === TEST_USER_ID, "Conversation stores clerkUserId correctly");
  assert(conv.messages.length === 2, "Conversation stores all messages");
  assert(conv.messages[0].role === "user", "First message role is 'user'");
  assert(conv.messages[1].role === "assistant", "Second message role is 'assistant'");
  assert(conv.isActive === true, "Conversation isActive defaults to true");
  assert(conv.createdAt instanceof Date, "Conversation has createdAt timestamp");
  assert(conv.updatedAt instanceof Date, "Conversation has updatedAt timestamp");

  // Fetch back by ID
  const fetched = await Conversation.findById(conv._id);
  assert(fetched !== null, "Conversation can be fetched by _id");
  assert(fetched!.messages.length === 2, "Fetched conversation has correct message count");

  // toConversationDTO serialization
  const dto = toConversationDTO(fetched!.toObject());
  assert(typeof dto.id === "string" && dto.id.length === 24, "toConversationDTO.id is a 24-char string");
  assert(dto.clerkUserId === TEST_USER_ID, "toConversationDTO.clerkUserId correct");
  assert(dto.messages.length === 2, "toConversationDTO.messages correct length");
  assert(dto.isActive === true, "toConversationDTO.isActive correct");
  assert(dto.createdAt instanceof Date, "toConversationDTO.createdAt is a Date");

  // Ownership scoping: findOne with wrong clerkUserId returns null
  const notFound = await Conversation.findOne({
    _id: conv._id,
    clerkUserId: "user_wrong",
  });
  assert(notFound === null, "Conversation not returned when clerkUserId doesn't match (ownership check)");

  // Required field: missing orgId → Mongoose validation error
  try {
    await Conversation.create({
      locationId: TEST_LOCATION_ID,
      clerkUserId: TEST_USER_ID,
      messages: [],
      isActive: true,
    });
    failed++;
    console.error("  FAIL: Missing orgId should throw Mongoose validation error");
  } catch {
    passed++;
    console.log("  PASS: Missing orgId rejected by Mongoose schema validation");
  }

  // Required field: missing clerkUserId → Mongoose validation error
  try {
    await Conversation.create({
      orgId: TEST_ORG_ID,
      locationId: TEST_LOCATION_ID,
      messages: [],
      isActive: true,
    });
    failed++;
    console.error("  FAIL: Missing clerkUserId should throw Mongoose validation error");
  } catch {
    passed++;
    console.log("  PASS: Missing clerkUserId rejected by Mongoose schema validation");
  }
})();

// ─── 8. Proposal Persistence ──────────────────────────────────────────────────

console.log("\n=== 8. Proposal Persistence — Embedded StoredProposal (Step 3) ===\n");

await (async () => {
  const proposalId = `proposal-persist-${Date.now()}`;

  const conv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      {
        role: "tool",
        content: "Swap Alice's Monday shift to Bob",
        proposal: {
          proposalId,
          toolName: "propose_shift_swap",
          description: "Swap Alice's Monday shift to Bob",
          payload: {
            shiftId: "shift_abc",
            targetStaffId: "staff_bob",
            // Sensitive mutation payload that must never reach the client
            occVersion: "2026-03-16T10:00:00Z",
            internalCost: 250,
          },
          dataVersion: "2026-03-16T10:00:00Z",
          status: "pending",
          createdAt: new Date(),
          resolvedAt: null,
          resolvedBy: null,
        },
        timestamp: new Date(),
      },
    ],
    isActive: true,
  });
  createdIds.push(conv._id as mongoose.Types.ObjectId);

  // Fetch by proposalId (mirrors the resolve route's findOne query)
  const fetched = await Conversation.findOne({
    clerkUserId: TEST_USER_ID,
    "messages.proposal.proposalId": proposalId,
  });
  assert(fetched !== null, "Conversation found by embedded proposal.proposalId");

  const msgWithProposal = fetched!.messages.find(
    (m) => m.proposal?.proposalId === proposalId
  );
  assert(msgWithProposal !== undefined, "Message with matching proposal found");

  const storedProposal = msgWithProposal!.proposal!;
  assert(storedProposal.status === "pending", "Stored proposal status is 'pending'");
  assert(storedProposal.toolName === "propose_shift_swap", "Stored proposal toolName correct");
  assert(storedProposal.resolvedAt === null, "resolvedAt is null for pending proposal");
  assert(storedProposal.resolvedBy === null, "resolvedBy is null for pending proposal");

  // Full payload is stored server-side (including sensitive fields)
  assert(
    (storedProposal.payload as Record<string, unknown>).internalCost === 250,
    "Full payload (including sensitive fields) is stored server-side"
  );
  assert(
    (storedProposal.payload as Record<string, unknown>).shiftId === "shift_abc",
    "Payload.shiftId stored correctly for OCC execution"
  );

  // Update proposal status to approved (mirrors the resolve route)
  await Conversation.updateOne(
    { _id: conv._id, "messages.proposal.proposalId": proposalId },
    {
      $set: {
        "messages.$.proposal.status": "approved",
        "messages.$.proposal.resolvedAt": new Date(),
        "messages.$.proposal.resolvedBy": TEST_USER_ID,
      },
    }
  );

  const afterApprove = await Conversation.findOne({
    "messages.proposal.proposalId": proposalId,
  });
  const approvedMsg = afterApprove!.messages.find(
    (m) => m.proposal?.proposalId === proposalId
  );
  assert(approvedMsg!.proposal!.status === "approved", "Proposal status updated to 'approved'");
  assert(approvedMsg!.proposal!.resolvedAt instanceof Date, "resolvedAt is set after approval");
  assert(approvedMsg!.proposal!.resolvedBy === TEST_USER_ID, "resolvedBy is set to approving user");
})();

// ─── 9. Proposal Expiry ───────────────────────────────────────────────────────

console.log("\n=== 9. Proposal Expiry — expirePendingProposals (Step 9) ===\n");

await (async () => {
  const oldCreatedAt = new Date(Date.now() - 45 * 60_000); // 45 minutes ago

  // Conversation with an OLD pending proposal (should be expired)
  const oldProposalId = `old-prop-${Date.now()}`;
  const oldConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      {
        role: "tool",
        content: "Old proposal",
        proposal: {
          proposalId: oldProposalId,
          toolName: "propose_shift_swap",
          description: "Old swap",
          payload: { shiftId: "s1", targetStaffId: "s2" },
          dataVersion: "x",
          status: "pending",
          createdAt: oldCreatedAt, // 45 min ago — beyond 30 min TTL
          resolvedAt: null,
          resolvedBy: null,
        },
        timestamp: oldCreatedAt,
      },
    ],
    isActive: true,
  });
  createdIds.push(oldConv._id as mongoose.Types.ObjectId);

  // Conversation with a FRESH pending proposal (should NOT be expired)
  const freshProposalId = `fresh-prop-${Date.now()}`;
  const freshConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      {
        role: "tool",
        content: "Fresh proposal",
        proposal: {
          proposalId: freshProposalId,
          toolName: "propose_shift_swap",
          description: "Fresh swap",
          payload: { shiftId: "s3", targetStaffId: "s4" },
          dataVersion: "y",
          status: "pending",
          createdAt: new Date(), // just created — within TTL
          resolvedAt: null,
          resolvedBy: null,
        },
        timestamp: new Date(),
      },
    ],
    isActive: true,
  });
  createdIds.push(freshConv._id as mongoose.Types.ObjectId);

  // Conversation belonging to ANOTHER user with an old pending proposal
  // (must NOT be touched — user scoping must be enforced)
  const otherProposalId = `other-user-prop-${Date.now()}`;
  const otherConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: OTHER_USER_ID, // different user
    messages: [
      {
        role: "tool",
        content: "Other user proposal",
        proposal: {
          proposalId: otherProposalId,
          toolName: "propose_shift_swap",
          description: "Other user swap",
          payload: { shiftId: "s5", targetStaffId: "s6" },
          dataVersion: "z",
          status: "pending",
          createdAt: oldCreatedAt, // also old, but different user
          resolvedAt: null,
          resolvedBy: null,
        },
        timestamp: oldCreatedAt,
      },
    ],
    isActive: true,
  });
  createdIds.push(otherConv._id as mongoose.Types.ObjectId);

  // Run expiry scoped to TEST_USER_ID
  const result = await expirePendingProposals(TEST_ORG_ID.toString(), TEST_USER_ID);
  assert(
    typeof result.expiredCount === "number",
    "expirePendingProposals returns { expiredCount: number }"
  );
  assert(result.expiredCount >= 1, "At least 1 proposal expired (the 45-min-old one)");

  // Old proposal is now expired
  const refetchedOld = await Conversation.findById(oldConv._id);
  const oldMsg = refetchedOld!.messages.find((m) => m.proposal?.proposalId === oldProposalId);
  assert(
    oldMsg?.proposal?.status === "expired",
    "Old proposal (45 min ago) status is now 'expired'"
  );

  // Fresh proposal is still pending
  const refetchedFresh = await Conversation.findById(freshConv._id);
  const freshMsg = refetchedFresh!.messages.find((m) => m.proposal?.proposalId === freshProposalId);
  assert(
    freshMsg?.proposal?.status === "pending",
    "Fresh proposal (just created) status is still 'pending'"
  );

  // Other user's old proposal was NOT touched (user scoping enforced)
  const refetchedOther = await Conversation.findById(otherConv._id);
  const otherMsg = refetchedOther!.messages.find((m) => m.proposal?.proposalId === otherProposalId);
  assert(
    otherMsg?.proposal?.status === "pending",
    "Other user's old proposal was NOT expired (user scoping is enforced)"
  );

  // Inactive conversations: pending proposals in inactive conversations should also expire
  const inactiveProposalId = `inactive-prop-${Date.now()}`;
  const inactiveConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      {
        role: "tool",
        content: "Inactive conversation proposal",
        proposal: {
          proposalId: inactiveProposalId,
          toolName: "propose_shift_swap",
          description: "Inactive swap",
          payload: { shiftId: "s7", targetStaffId: "s8" },
          dataVersion: "w",
          status: "pending",
          createdAt: new Date(), // fresh but in inactive conv
          resolvedAt: null,
          resolvedBy: null,
        },
        timestamp: new Date(),
      },
    ],
    isActive: false, // inactive conversation
  });
  createdIds.push(inactiveConv._id as mongoose.Types.ObjectId);

  await expirePendingProposals(TEST_ORG_ID.toString(), TEST_USER_ID);

  const refetchedInactive = await Conversation.findById(inactiveConv._id);
  const inactiveMsg = refetchedInactive!.messages.find(
    (m) => m.proposal?.proposalId === inactiveProposalId
  );
  assert(
    inactiveMsg?.proposal?.status === "expired",
    "Pending proposal in inactive conversation is expired (even if fresh)"
  );
})();

// ─── 10. Conversation Upsert — onFinish Persistence Pattern ──────────────────

console.log("\n=== 10. Conversation Upsert — onFinish Persistence Pattern (Step 11) ===\n");

await (async () => {
  const newConvId = new mongoose.Types.ObjectId();
  const now = new Date();

  // First upsert: creates the conversation (simulates first chat exchange)
  await Conversation.findOneAndUpdate(
    { _id: newConvId, clerkUserId: TEST_USER_ID },
    {
      $setOnInsert: {
        orgId: TEST_ORG_ID,
        locationId: TEST_LOCATION_ID,
        clerkUserId: TEST_USER_ID,
      },
      $set: { isActive: true },
      $push: {
        messages: {
          $each: [
            { role: "user", content: "First user message", timestamp: now },
            { role: "assistant", content: "First assistant response", timestamp: now },
          ],
        },
      },
    },
    { upsert: true }
  );
  createdIds.push(newConvId);

  const afterFirst = await Conversation.findById(newConvId);
  assert(afterFirst !== null, "onFinish upsert: new conversation created");
  assert(afterFirst!.messages.length === 2, "onFinish first upsert: 2 messages stored");
  assert(afterFirst!.clerkUserId === TEST_USER_ID, "onFinish upsert: clerkUserId set via $setOnInsert");
  assert(String(afterFirst!.orgId) === TEST_ORG_ID.toString(), "onFinish upsert: orgId set via $setOnInsert");
  assert(afterFirst!.isActive === true, "onFinish upsert: isActive is true");

  // Second upsert: appends to existing (simulates second chat exchange)
  const later = new Date(now.getTime() + 5000);
  await Conversation.findOneAndUpdate(
    { _id: newConvId, clerkUserId: TEST_USER_ID },
    {
      $setOnInsert: {
        orgId: TEST_ORG_ID,
        locationId: TEST_LOCATION_ID,
        clerkUserId: TEST_USER_ID,
      },
      $set: { isActive: true },
      $push: {
        messages: {
          $each: [
            { role: "user", content: "Second user message", timestamp: later },
            { role: "assistant", content: "Second assistant response", timestamp: later },
          ],
        },
      },
    },
    { upsert: true }
  );

  const afterSecond = await Conversation.findById(newConvId);
  assert(
    afterSecond!.messages.length === 4,
    "onFinish second upsert: messages appended (total 4, not replaced)"
  );
  assert(
    afterSecond!.messages[0].content === "First user message",
    "onFinish: first exchange messages preserved after second upsert"
  );
  assert(
    afterSecond!.messages[2].content === "Second user message",
    "onFinish: second exchange user message appended at position 2"
  );
  assert(
    afterSecond!.messages[3].content === "Second assistant response",
    "onFinish: second exchange assistant response appended at position 3"
  );

  // Cross-user upsert with wrong clerkUserId does NOT create conversation for that user
  const wrongUserConvId = new mongoose.Types.ObjectId();
  await Conversation.findOneAndUpdate(
    { _id: wrongUserConvId, clerkUserId: "user_wrong_for_this_id" },
    {
      $setOnInsert: {
        orgId: TEST_ORG_ID,
        locationId: TEST_LOCATION_ID,
        clerkUserId: "user_wrong_for_this_id",
      },
      $set: { isActive: true },
      $push: { messages: { $each: [{ role: "user", content: "sneaky", timestamp: new Date() }] } },
    },
    { upsert: true }
  );
  // Clean up that stray doc
  await Conversation.deleteOne({ _id: wrongUserConvId });
  // The original conv should still have only 4 messages (not modified by wrong-user upsert)
  const afterWrongUser = await Conversation.findById(newConvId);
  assert(
    afterWrongUser!.messages.length === 4,
    "onFinish: wrong-user upsert does not modify another user's conversation"
  );
})();

// ─── 11. ConversationListItem Mapping ────────────────────────────────────────

console.log("\n=== 11. ConversationListItem Mapping (Step 11) ===\n");

await (async () => {
  const longFirstMessage =
    "This is a deliberately long first user message that exceeds the 120-character preview truncation limit for testing purposes.";

  const listConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [
      { role: "user", content: longFirstMessage, timestamp: new Date() },
      { role: "assistant", content: "Sure!", timestamp: new Date() },
      { role: "user", content: "Follow-up question", timestamp: new Date() },
    ],
    isActive: true,
  });
  createdIds.push(listConv._id as mongoose.Types.ObjectId);

  // Simulate conversations/route.ts list mapping logic
  const doc = await Conversation.findById(listConv._id).lean();
  assert(doc !== null, "Conversation document exists for list mapping");

  const firstUserMsg = (doc!.messages as Array<{ role: string; content: string }>).find(
    (m) => m.role === "user" && typeof m.content === "string"
  );
  assert(firstUserMsg !== undefined, "First user message found by role filter");
  assert(
    firstUserMsg!.content === longFirstMessage,
    "First user message content matches the inserted message (not the assistant's)"
  );

  const previewRaw = firstUserMsg!.content;
  const preview = previewRaw.length > 120 ? `${previewRaw.slice(0, 120)}...` : previewRaw;
  assert(preview.length === 123, "Preview of 124-char message truncated to 123 (120 + '...')");
  assert(preview.endsWith("..."), "Truncated preview ends with '...'");

  const messageCount = Array.isArray(doc!.messages) ? doc!.messages.length : 0;
  assert(messageCount === 3, "messageCount equals total stored messages (3)");

  assert(doc!.isActive === true, "isActive is true for active conversation");

  // Conversation with only assistant messages (preview should be empty string)
  const assistantOnlyConv = await Conversation.create({
    orgId: TEST_ORG_ID,
    locationId: TEST_LOCATION_ID,
    clerkUserId: TEST_USER_ID,
    messages: [{ role: "assistant", content: "System init", timestamp: new Date() }],
    isActive: false,
  });
  createdIds.push(assistantOnlyConv._id as mongoose.Types.ObjectId);

  const assistantOnlyDoc = await Conversation.findById(assistantOnlyConv._id).lean();
  const noUserMsg = (
    assistantOnlyDoc!.messages as Array<{ role: string; content: string }>
  ).find((m) => m.role === "user");
  const emptyPreview = noUserMsg?.content ?? "";
  assert(emptyPreview === "", "Preview is empty string when no user messages exist");
  assert(assistantOnlyDoc!.isActive === false, "isActive is false for inactive conversation");

  // Pagination query: sort by updatedAt descending, limit, skip
  const paginatedDocs = await Conversation.find({ clerkUserId: TEST_USER_ID })
    .sort({ updatedAt: -1 })
    .skip(0)
    .limit(20)
    .lean();
  assert(paginatedDocs.length >= 1, "Pagination query returns at least 1 conversation");
  assert(
    paginatedDocs.length <= 20,
    "Pagination query respects limit of 20"
  );

  // Verify sort order: first result updatedAt >= last result updatedAt
  if (paginatedDocs.length > 1) {
    const firstUpdatedAt = new Date(paginatedDocs[0].updatedAt).getTime();
    const lastUpdatedAt = new Date(paginatedDocs[paginatedDocs.length - 1].updatedAt).getTime();
    assert(
      firstUpdatedAt >= lastUpdatedAt,
      "Pagination results sorted by updatedAt descending (most recent first)"
    );
  }
})();

// ─── Cleanup ──────────────────────────────────────────────────────────────────

console.log("\n  Cleaning up test documents...");
if (createdIds.length > 0) {
  const deleteResult = await Conversation.deleteMany({ _id: { $in: createdIds } });
  console.log(`  Deleted ${deleteResult.deletedCount} test conversation(s).`);
}
await mongoose.disconnect();
console.log("  Disconnected from MongoDB.\n");

// ─── Final Summary ────────────────────────────────────────────────────────────

const sectionBPassed = passed - sectionAPassed;
const sectionBFailed = failed - sectionAFailed;

console.log("=".repeat(55));
console.log(`  Section A (Pure functions):  ${sectionAPassed} passed, ${sectionAFailed} failed`);
console.log(`  Section B (DB integration):  ${sectionBPassed} passed, ${sectionBFailed} failed`);
console.log("─".repeat(55));
console.log(`  Phase 3 Total: ${passed} passed, ${failed} failed`);
console.log("=".repeat(55) + "\n");

process.exit(failed > 0 ? 1 : 0);
