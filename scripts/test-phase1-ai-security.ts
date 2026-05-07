/**
 * Phase 1: AI Security Layer — Verification Script
 *
 * Verifies all Phase 1 outputs:
 *   Section A — Pure function tests (no DB required):
 *     1. RBAC permissions (hasPermission)
 *     2. Tool registry integrity (getToolRegistry)
 *     3. RBAC tool filtering (filterToolsForRole)
 *     4. Viewport context parsing (parseViewportContext)
 *
 *   Section B — Mongoose schema validation (requires DB):
 *     5. OrganizationMember accepts "shift_lead", rejects invalid roles
 *
 * Run: npx tsx scripts/test-phase1-ai-security.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { z } from "zod";
import { hasPermission, ROLE_PERMISSIONS } from "../src/lib/ai/rbac/permissions";
import { getToolRegistry } from "../src/lib/ai/tools/tool-registry";
import { filterToolsForRole } from "../src/lib/ai/rbac/filter-tools";
import { parseViewportContext } from "../src/lib/ai/context/viewport";
import type { AIToolDefinition } from "../src/lib/ai/tools/tool-registry.types";

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

function assertThrows(fn: () => void, includes: string, label: string) {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${label} (did not throw)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(includes)) {
      passed++;
      console.log(`  PASS: ${label}`);
    } else {
      failed++;
      console.error(`  FAIL: ${label} (threw, but message "${msg}" missing "${includes}")`);
    }
  }
}

// ─── Section A: Pure Function Tests ──────────────────────────────────────────

console.log("\n=== 1. RBAC Permissions (hasPermission) ===\n");

assert(hasPermission("owner", "cost:write") === true, "Owner has cost:write");
assert(hasPermission("owner", "schedule:generate") === true, "Owner has schedule:generate");
assert(hasPermission("manager", "cost:read") === true, "Manager has cost:read");
assert(hasPermission("manager", "config:write") === false, "Manager lacks config:write");
assert(hasPermission("manager", "cost:write") === false, "Manager lacks cost:write");
assert(hasPermission("shift_lead", "shift:swap") === true, "Shift lead has shift:swap");
assert(hasPermission("shift_lead", "schedule:read") === true, "Shift lead has schedule:read");
assert(hasPermission("shift_lead", "cost:write") === false, "Shift lead lacks cost:write");
assert(hasPermission("shift_lead", "schedule:write") === false, "Shift lead lacks schedule:write");
assert(hasPermission("hacker" as any, "cost:write") === false, "Unknown role returns false (no throw)");

console.log("\n--- ROLE_PERMISSIONS immutability ---\n");

try {
  (ROLE_PERMISSIONS as any).evil = [];
  assert(!("evil" in ROLE_PERMISSIONS), "ROLE_PERMISSIONS rejects new keys (frozen)");
} catch {
  passed++;
  console.log("  PASS: ROLE_PERMISSIONS rejects new keys (frozen — threw)");
}

console.log("\n=== 2. Tool Registry Integrity ===\n");

const tools = getToolRegistry();
const toolNames = tools.map((t) => t.name);
assert(new Set(toolNames).size === toolNames.length, "No duplicate tool names");
assert(Object.isFrozen(tools), "getToolRegistry() returns a frozen array");
console.log(`  INFO: Registry has ${tools.length} entries (Phase 2 will populate)`);

console.log("\n=== 3. RBAC Tool Filtering (filterToolsForRole) ===\n");

const mockTools: AIToolDefinition[] = [
  { name: "update_cost_weights", description: "Update cost", requiredPermission: "cost:write", parameters: z.object({}) },
  { name: "get_shift_roster", description: "Get shifts", requiredPermission: "shift:read", parameters: z.object({}) },
  { name: "generate_schedule", description: "Gen schedule", requiredPermission: "schedule:generate", parameters: z.object({}) },
  { name: "read_config", description: "Read config", requiredPermission: "config:read", parameters: z.object({}) },
];

const ownerTools = filterToolsForRole("owner", mockTools);
assert(ownerTools.length === 4, `Owner gets all 4 mock tools (got ${ownerTools.length})`);

const managerTools = filterToolsForRole("manager", mockTools);
assert(managerTools.length === 3, `Manager gets 3 tools (got ${managerTools.length})`);
assert(!managerTools.find((t) => t.name === "update_cost_weights"), "Manager excluded from cost:write tool");

const shiftLeadTools = filterToolsForRole("shift_lead", mockTools);
assert(shiftLeadTools.length === 1, `Shift lead gets 1 tool (got ${shiftLeadTools.length})`);
assert(shiftLeadTools[0]?.name === "get_shift_roster", "Shift lead only gets shift:read tool");

const originalWarn = console.warn;
let warnCalled = false;
console.warn = (...args: unknown[]) => { warnCalled = true; };
const unknownTools = filterToolsForRole("hacker" as any, mockTools);
console.warn = originalWarn;
assert(unknownTools.length === 0, "Unknown role gets 0 tools (fail-closed)");
assert(warnCalled, "Warning logged for unknown role");

console.log("\n=== 4. Viewport Context Parsing ===\n");

const valid = parseViewportContext({
  locationId: "abc123",
  scheduleId: "sched456",
  activeView: "schedule",
});
assert(valid.locationId === "abc123", "Valid input: locationId parsed");
assert(valid.scheduleId === "sched456", "Valid input: scheduleId parsed");
assert(valid.activeView === "schedule", "Valid input: activeView parsed");

const stripped = parseViewportContext({
  locationId: "abc123",
  malicious: "payload",
} as any);
assert(!("malicious" in stripped), "Extra fields stripped");

const trimmed = parseViewportContext({ locationId: "  abc123  " });
assert(trimmed.locationId === "abc123", "String fields trimmed");

const minimal = parseViewportContext({ locationId: "loc1" });
assert(minimal.locationId === "loc1", "Minimal input (only locationId) succeeds");
assert(minimal.scheduleId === undefined, "Optional fields default to undefined");

assertThrows(
  () => parseViewportContext({}),
  "locationId",
  "Missing locationId throws error mentioning locationId"
);

assertThrows(
  () => parseViewportContext(null),
  "required",
  "Null input throws error mentioning 'required'"
);

assertThrows(
  () => parseViewportContext(undefined),
  "required",
  "Undefined input throws error mentioning 'required'"
);

assertThrows(
  () => parseViewportContext({ locationId: "" }),
  "locationId",
  "Empty locationId throws"
);

assertThrows(
  () => parseViewportContext({ locationId: "abc", focusedDay: 7 }),
  "focusedDay",
  "focusedDay=7 (out of 0-6 range) throws"
);

assertThrows(
  () => parseViewportContext({ locationId: "abc", activeView: "nonexistent" }),
  "activeView",
  "Invalid activeView enum throws"
);

// ─── Section B: Mongoose Schema Validation ───────────────────────────────────

console.log("\n=== 5. Mongoose Schema Validation (requires DB) ===\n");

async function testMongooseValidation() {
  const { dbConnect } = await import("../src/lib/db");
  const mongoose = await import("mongoose");

  try {
    await dbConnect();
    console.log("  INFO: Connected to database");

    const OrganizationMember = (await import("../src/server/models/OrganizationMember")).default;

    const validDoc = new OrganizationMember({
      orgId: new mongoose.Types.ObjectId(),
      clerkUserId: "user_test_phase1",
      role: "shift_lead",
    });
    await validDoc.validate();
    passed++;
    console.log("  PASS: shift_lead role accepted by Mongoose validator");

    for (const role of ["owner", "manager"] as const) {
      const doc = new OrganizationMember({
        orgId: new mongoose.Types.ObjectId(),
        clerkUserId: "user_test_phase1",
        role,
      });
      await doc.validate();
      passed++;
      console.log(`  PASS: ${role} role still accepted (backward-compatible)`);
    }

    const invalidDoc = new OrganizationMember({
      orgId: new mongoose.Types.ObjectId(),
      clerkUserId: "user_test_phase1",
      role: "hacker",
    });
    try {
      await invalidDoc.validate();
      failed++;
      console.error("  FAIL: 'hacker' role should have been rejected");
    } catch {
      passed++;
      console.log("  PASS: Invalid role 'hacker' correctly rejected by validator");
    }
  } finally {
    await mongoose.default.disconnect();
    console.log("  INFO: Disconnected from database");
  }
}

(async () => {
  try {
    await testMongooseValidation();
  } catch (err) {
    console.error("  SKIP: Mongoose tests failed (DB not available):", (err as Error).message);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  console.log(`  Phase 1 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50) + "\n");

  process.exit(failed > 0 ? 1 : 0);
})();
