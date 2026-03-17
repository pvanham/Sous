/**
 * CandidateService End-to-End Verification Script (Sprint 3.5)
 *
 * Self-contained: seeds test data, runs all tests, cleans up.
 *
 * Verifies:
 *   1. getCandidatesForSlot -- Grill Mon 09:00-17:00 (main filter pipeline)
 *   2. getCandidatesForSlot -- Prep Mon 09:00-17:00 (skills filter)
 *   3. getCandidatesForSlot -- Grill Mon 17:00-22:00 (evening + overtime)
 *   4. getCandidatesForSlot -- Dish Mon 09:00-17:00 (insufficient candidates)
 *   5. getCandidatesForSlot -- nonexistent station (empty result)
 *   6. wouldCauseOvertime (3 sub-tests: over, under, boundary)
 *   7. getCandidatesForDay -- all 4 Monday requirements
 *   8. getCandidatesForDay -- empty labor requirements
 *   9. getCandidatesForSlot -- Sunday (no availability)
 *
 * Run: npm run test:phase-3.5
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import { CandidateService } from "../src/server/services/candidate.service";
import { ShiftService } from "../src/server/services/shift.service";
import { LaborRequirementService } from "../src/server/services/labor-requirement.service";
import { getWeekStart, getWeekEnd } from "../src/lib/utils/date";
import type { ShiftDTO } from "../src/types/shift";
import type { CandidateDTO } from "../src/types/candidate";
import {
  seedCandidateTestData,
  cleanupCandidateTestData,
} from "./seed-candidate-test";
import mongoose from "mongoose";

// ============================================================================
// Test Infrastructure
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors: string[] = [];

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${step}`);
  console.log(`${"─".repeat(60)}`);
}

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName} -- ${detail}` : testName;
    console.log(`  ✗ FAIL: ${msg}`);
    errors.push(msg);
  }
}

function assertCount(
  actual: number,
  expected: number,
  label: string
): void {
  assert(
    actual === expected,
    `${label}: expected ${expected}, got ${actual}`,
    actual !== expected ? `expected ${expected}, got ${actual}` : undefined
  );
}

function assertCandidateOrder(
  candidates: CandidateDTO[],
  expectedNames: string[],
  label: string
): void {
  const actualNames = candidates.map((c) => c.staffName);
  const match =
    actualNames.length === expectedNames.length &&
    actualNames.every((name, i) => name === expectedNames[i]);
  assert(
    match,
    `${label}: order matches`,
    !match
      ? `expected [${expectedNames.join(", ")}], got [${actualNames.join(", ")}]`
      : undefined
  );
}

function assertCandidatePresent(
  candidates: CandidateDTO[],
  name: string,
  label: string
): CandidateDTO | undefined {
  const found = candidates.find((c) => c.staffName === name);
  assert(!!found, `${label}: ${name} is present`);
  return found;
}

function assertCandidateAbsent(
  candidates: CandidateDTO[],
  name: string,
  label: string
): void {
  const found = candidates.find((c) => c.staffName === name);
  assert(!found, `${label}: ${name} is correctly excluded`);
}

// ============================================================================
// Test Context
// ============================================================================

const TEST_WEEK_START = new Date(2026, 1, 16, 0, 0, 0, 0);
const MONDAY = new Date(2026, 1, 16, 0, 0, 0, 0);
const SUNDAY = new Date(2026, 1, 22, 0, 0, 0, 0);

// ============================================================================
// Test Cases
// ============================================================================

async function test1_GrillMon0900to1700(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 1: getCandidatesForSlot -- Grill Mon 09:00-17:00");
  log("Filter pipeline: active → availability → time-off → skills → shift overlap");

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    MONDAY,
    "09:00",
    "17:00",
    "Grill",
    existingShifts
  );

  log(`\nReturned ${candidates.length} candidates:`);
  for (const c of candidates) {
    log(
      `  ${c.staffName} -- pref:${c.preference}, grillProf:${c.skills.find((s) => s.station === "Grill")?.proficiency ?? "N/A"}, weekH:${c.currentWeekHours}, OT:${c.overtimeWarning}`
    );
  }

  // Verify count
  assertCount(candidates.length, 3, "Candidate count");

  // Verify who's included
  assertCandidatePresent(candidates, "Alice Chen", "Test 1");
  assertCandidatePresent(candidates, "Ivy Thompson", "Test 1");
  assertCandidatePresent(candidates, "Jack Rivera", "Test 1");

  // Verify who's excluded
  assertCandidateAbsent(candidates, "Grace Kim", "Test 1 (inactive)");
  assertCandidateAbsent(candidates, "Eve Santos", "Test 1 (partial availability)");
  assertCandidateAbsent(candidates, "Hank Johnson", "Test 1 (no Mon availability)");
  assertCandidateAbsent(candidates, "Charlie Park", "Test 1 (approved time-off)");
  assertCandidateAbsent(candidates, "Diana Lee", "Test 1 (no Grill skill)");
  assertCandidateAbsent(candidates, "Bob Martinez", "Test 1 (overlapping shift)");
  assertCandidateAbsent(candidates, "Frank Wilson", "Test 1 (overlapping shift)");

  // Verify sort order: preferred first, then proficiency desc, then name alpha
  assertCandidateOrder(
    candidates,
    ["Alice Chen", "Ivy Thompson", "Jack Rivera"],
    "Test 1 sort"
  );

  // Verify Alice's properties
  const alice = candidates.find((c) => c.staffName === "Alice Chen");
  if (alice) {
    assert(
      alice.preference === "preferred",
      "Test 1: Alice preference is 'preferred'"
    );
    assert(
      alice.currentWeekHours === 16,
      "Test 1: Alice weekHours is 16",
      `got ${alice.currentWeekHours}`
    );
    assert(
      alice.overtimeWarning === false,
      "Test 1: Alice has no overtime warning"
    );
    assert(
      alice.maxHoursPerWeek === 40,
      "Test 1: Alice maxHoursPerWeek is 40"
    );
  }

  // Verify Ivy (pending time-off should NOT exclude)
  const ivy = candidates.find((c) => c.staffName === "Ivy Thompson");
  if (ivy) {
    assert(
      ivy.preference === "preferred",
      "Test 1: Ivy preference is 'preferred'"
    );
    assert(
      ivy.currentWeekHours === 0,
      "Test 1: Ivy weekHours is 0",
      `got ${ivy.currentWeekHours}`
    );
  }

  // Verify Jack (adjacent shift should NOT exclude)
  const jack = candidates.find((c) => c.staffName === "Jack Rivera");
  if (jack) {
    assert(
      jack.preference === "available",
      "Test 1: Jack preference is 'available'"
    );
    assert(
      jack.currentWeekHours === 3,
      "Test 1: Jack weekHours is 3",
      `got ${jack.currentWeekHours}`
    );
  }
}

async function test2_PrepMon0900to1700(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 2: getCandidatesForSlot -- Prep Mon 09:00-17:00");

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    MONDAY,
    "09:00",
    "17:00",
    "Prep",
    existingShifts
  );

  log(`\nReturned ${candidates.length} candidates:`);
  for (const c of candidates) {
    log(
      `  ${c.staffName} -- pref:${c.preference}, prepProf:${c.skills.find((s) => s.station === "Prep")?.proficiency ?? "N/A"}, weekH:${c.currentWeekHours}`
    );
  }

  assertCount(candidates.length, 3, "Candidate count");
  assertCandidatePresent(candidates, "Diana Lee", "Test 2");
  assertCandidatePresent(candidates, "Alice Chen", "Test 2");
  assertCandidatePresent(candidates, "Ivy Thompson", "Test 2");

  // Diana should be first (preferred, Prep prof 5)
  assert(
    candidates[0]?.staffName === "Diana Lee",
    "Test 2: Diana is first (highest Prep proficiency)",
    `got ${candidates[0]?.staffName}`
  );

  // Bob excluded (overlapping shift), Frank excluded (overlapping shift)
  assertCandidateAbsent(candidates, "Bob Martinez", "Test 2 (overlapping)");
  assertCandidateAbsent(candidates, "Frank Wilson", "Test 2 (overlapping)");
  // Jack excluded (no Prep skill)
  assertCandidateAbsent(candidates, "Jack Rivera", "Test 2 (no Prep skill)");
}

async function test3_GrillMon1700to2200(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 3: getCandidatesForSlot -- Grill Mon 17:00-22:00 (evening)");

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    MONDAY,
    "17:00",
    "22:00",
    "Grill",
    existingShifts
  );

  log(`\nReturned ${candidates.length} candidates:`);
  for (const c of candidates) {
    log(
      `  ${c.staffName} -- pref:${c.preference}, grillProf:${c.skills.find((s) => s.station === "Grill")?.proficiency ?? "N/A"}, weekH:${c.currentWeekHours}, OT:${c.overtimeWarning}`
    );
  }

  assertCount(candidates.length, 4, "Candidate count");
  assertCandidatePresent(candidates, "Alice Chen", "Test 3");
  assertCandidatePresent(candidates, "Ivy Thompson", "Test 3");
  assertCandidatePresent(candidates, "Frank Wilson", "Test 3");
  assertCandidatePresent(candidates, "Jack Rivera", "Test 3");

  // Bob excluded: availability is 09:00-17:00, doesn't cover 17:00-22:00
  assertCandidateAbsent(candidates, "Bob Martinez", "Test 3 (avail ends 17:00)");

  // Frank should have overtime warning (35.5 + 5 = 40.5 > 40)
  const frank = candidates.find((c) => c.staffName === "Frank Wilson");
  if (frank) {
    assert(
      frank.overtimeWarning === true,
      "Test 3: Frank has overtime warning",
      `overtimeWarning=${frank.overtimeWarning}, weekH=${frank.currentWeekHours}`
    );
    assert(
      frank.currentWeekHours === 35.5,
      "Test 3: Frank weekHours is 35.5",
      `got ${frank.currentWeekHours}`
    );
  }

  // Frank's Mon 06-14 shift doesn't overlap with 17-22 slot, so he's included
  // Sort: preferred first, then proficiency, then overtime, then name
  // Alice (preferred, 5), Ivy (preferred, 5), Frank (available, 4, OT), Jack (available, 3, no OT)
  // Proficiency takes precedence over overtime in the sort
  assertCandidateOrder(
    candidates,
    ["Alice Chen", "Ivy Thompson", "Frank Wilson", "Jack Rivera"],
    "Test 3 sort"
  );
}

async function test4_DishMon0900to1700(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 4: getCandidatesForSlot -- Dish Mon 09:00-17:00");

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    MONDAY,
    "09:00",
    "17:00",
    "Dish",
    existingShifts
  );

  log(`\nReturned ${candidates.length} candidate(s):`);
  for (const c of candidates) {
    log(
      `  ${c.staffName} -- pref:${c.preference}, dishProf:${c.skills.find((s) => s.station === "Dish")?.proficiency ?? "N/A"}`
    );
  }

  // Only Jack has Dish skill
  assertCount(candidates.length, 1, "Candidate count");
  const jack = assertCandidatePresent(candidates, "Jack Rivera", "Test 4");
  if (jack) {
    const dishSkill = jack.skills.find((s) => s.station === "Dish");
    assert(
      dishSkill?.proficiency === 4,
      "Test 4: Jack Dish proficiency is 4",
      `got ${dishSkill?.proficiency}`
    );
  }
}

async function test5_NonexistentStation(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep('Test 5: getCandidatesForSlot -- nonexistent station "Sushi"');

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    MONDAY,
    "09:00",
    "17:00",
    "Sushi",
    existingShifts
  );

  assertCount(candidates.length, 0, "Candidate count for nonexistent station");
}

async function test6_WouldCauseOvertime(
  staffIds: Map<string, string>,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 6: wouldCauseOvertime (3 sub-tests)");

  // Sub-test 6a: Frank + 5h evening shift → 35.5 + 5 = 40.5 > 40 → true
  const frankId = staffIds.get("Frank Wilson")!;
  const frankResult = CandidateService.wouldCauseOvertime(
    frankId,
    { date: MONDAY, startTime: "17:00", endTime: "22:00" },
    existingShifts,
    40
  );
  assert(
    frankResult === true,
    "Test 6a: Frank 35.5h + 5h = 40.5 > 40 → true",
    `got ${frankResult}`
  );

  // Sub-test 6b: Alice + 8h shift → 16 + 8 = 24 < 40 → false
  const aliceId = staffIds.get("Alice Chen")!;
  const aliceResult = CandidateService.wouldCauseOvertime(
    aliceId,
    { date: MONDAY, startTime: "09:00", endTime: "17:00" },
    existingShifts,
    40
  );
  assert(
    aliceResult === false,
    "Test 6b: Alice 16h + 8h = 24 <= 40 → false",
    `got ${aliceResult}`
  );

  // Sub-test 6c: Boundary -- exactly at max. Eve has 0h + 32h = 32 max.
  // Create a scenario: 0 existing hours + 32h proposed = 32 exactly (maxHours=32)
  // Eve has maxHours=32, 0 existing shifts.
  // If proposed is a 32h shift (unrealistic but tests boundary): currentWeekHours=0 + 32 = 32. 32 > 32 is false.
  // Let's test more practically: someone with 32h existing + 8h proposed vs max=40 → 40 > 40 is false
  const eveId = staffIds.get("Eve Santos")!;
  const boundaryResult = CandidateService.wouldCauseOvertime(
    eveId,
    { date: MONDAY, startTime: "06:00", endTime: "14:00" },
    existingShifts, // Eve has 0 shifts this week
    8 // maxHours = 8 (equal to proposed 8h shift)
  );
  assert(
    boundaryResult === false,
    "Test 6c: Boundary -- 0h + 8h = 8, max=8 → false (not strictly greater)",
    `got ${boundaryResult}`
  );

  // Extra sub-test: just barely over → true
  const barelyOverResult = CandidateService.wouldCauseOvertime(
    eveId,
    { date: MONDAY, startTime: "06:00", endTime: "14:00" },
    existingShifts,
    7.9 // maxHours = 7.9, proposed = 8h → 0 + 8 = 8 > 7.9 → true
  );
  assert(
    barelyOverResult === true,
    "Test 6d: Barely over -- 0h + 8h = 8 > 7.9 → true",
    `got ${barelyOverResult}`
  );
}

async function test7_GetCandidatesForDay(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 7: getCandidatesForDay -- all 4 Monday requirements");

  const laborRequirements = await LaborRequirementService.getByDayOfWeek(
    orgId,
    locationId,
    1 // Monday
  );
  log(`Fetched ${laborRequirements.length} labor requirements for Monday`);

  const slotCandidates = await CandidateService.getCandidatesForDay(
    orgId,
    locationId,
    MONDAY,
    laborRequirements,
    existingShifts
  );

  assertCount(slotCandidates.length, 4, "SlotCandidates count");

  // Print summary
  for (const sc of slotCandidates) {
    log(
      `\n  ${sc.slot.station} ${sc.slot.startTime}-${sc.slot.endTime}: ${sc.candidates.length} candidates, sufficient=${sc.hasSufficientCandidates}`
    );
    for (const c of sc.candidates) {
      log(`    ${c.staffName} (${c.preference})`);
    }
  }

  // Verify Grill 09:00-17:00 slot
  const grillMorning = slotCandidates.find(
    (sc) =>
      sc.slot.station === "Grill" &&
      sc.slot.startTime === "09:00" &&
      sc.slot.endTime === "17:00"
  );
  assert(
    !!grillMorning,
    "Test 7: Grill 09:00-17:00 slot found"
  );
  if (grillMorning) {
    assertCount(grillMorning.candidates.length, 3, "Grill morning candidates");
    assert(
      grillMorning.hasSufficientCandidates === true,
      "Test 7: Grill morning hasSufficientCandidates (3 >= 2)",
      `got ${grillMorning.hasSufficientCandidates}`
    );
  }

  // Verify Prep 09:00-17:00 slot
  const prepSlot = slotCandidates.find(
    (sc) =>
      sc.slot.station === "Prep" &&
      sc.slot.startTime === "09:00"
  );
  assert(!!prepSlot, "Test 7: Prep 09:00-17:00 slot found");
  if (prepSlot) {
    assertCount(prepSlot.candidates.length, 3, "Prep candidates");
    assert(
      prepSlot.hasSufficientCandidates === true,
      "Test 7: Prep hasSufficientCandidates (3 >= 1)"
    );
  }

  // Verify Grill 17:00-22:00 slot
  const grillEvening = slotCandidates.find(
    (sc) =>
      sc.slot.station === "Grill" &&
      sc.slot.startTime === "17:00"
  );
  assert(!!grillEvening, "Test 7: Grill 17:00-22:00 slot found");
  if (grillEvening) {
    assertCount(grillEvening.candidates.length, 4, "Grill evening candidates");
    assert(
      grillEvening.hasSufficientCandidates === true,
      "Test 7: Grill evening hasSufficientCandidates (4 >= 1)"
    );
  }

  // Verify Dish 09:00-17:00 slot -- insufficient candidates
  const dishSlot = slotCandidates.find(
    (sc) => sc.slot.station === "Dish"
  );
  assert(!!dishSlot, "Test 7: Dish 09:00-17:00 slot found");
  if (dishSlot) {
    assertCount(dishSlot.candidates.length, 1, "Dish candidates");
    assert(
      dishSlot.hasSufficientCandidates === false,
      "Test 7: Dish hasSufficientCandidates=false (1 < 3)",
      `got ${dishSlot.hasSufficientCandidates}`
    );
  }
}

async function test8_EmptyLaborRequirements(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 8: getCandidatesForDay -- empty labor requirements");

  const slotCandidates = await CandidateService.getCandidatesForDay(
    orgId,
    locationId,
    MONDAY,
    [], // empty
    existingShifts
  );

  assertCount(slotCandidates.length, 0, "SlotCandidates count for empty input");
}

async function test9_SundayNoAvailability(
  orgId: string,
  locationId: string,
  existingShifts: ShiftDTO[]
): Promise<void> {
  logStep("Test 9: getCandidatesForSlot -- Sunday (no availability)");

  const candidates = await CandidateService.getCandidatesForSlot(
    orgId,
    locationId,
    SUNDAY,
    "09:00",
    "17:00",
    "Grill",
    existingShifts
  );

  assertCount(candidates.length, 0, "Sunday candidates (no availability)");
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  CANDIDATE SERVICE VERIFICATION (Sprint 3.5)");
  console.log("═".repeat(60));
  console.log(`\nMongoDB URI: ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);

  if (!process.env.MONGODB_URI) {
    console.error("\n✗ MONGODB_URI environment variable is not set");
    process.exit(1);
  }

  try {
    // Connect
    await dbConnect();
    log("Database connected\n");

    // Setup
    logStep("SETUP: Seeding test data");
    const { orgId, locationId, staffIds, scheduleId } =
      await seedCandidateTestData();

    // Fetch all shifts for the test week (passed to CandidateService)
    const weekStart = getWeekStart(MONDAY);
    const weekEnd = getWeekEnd(MONDAY);
    const allShifts = await ShiftService.getBySchedule(scheduleId);
    log(`\nFetched ${allShifts.length} shifts for the test week`);

    // Run all tests
    await test1_GrillMon0900to1700(orgId, locationId, allShifts);
    await test2_PrepMon0900to1700(orgId, locationId, allShifts);
    await test3_GrillMon1700to2200(orgId, locationId, allShifts);
    await test4_DishMon0900to1700(orgId, locationId, allShifts);
    await test5_NonexistentStation(orgId, locationId, allShifts);
    await test6_WouldCauseOvertime(staffIds, allShifts);
    await test7_GetCandidatesForDay(orgId, locationId, allShifts);
    await test8_EmptyLaborRequirements(orgId, locationId, allShifts);
    await test9_SundayNoAvailability(orgId, locationId, allShifts);

    // Cleanup
    logStep("CLEANUP: Removing test data");
    await cleanupCandidateTestData();
    log("Test data removed");

    // Summary
    console.log("\n" + "═".repeat(60));
    if (failedTests === 0) {
      console.log(
        `  ✓ ALL TESTS PASSED (${passedTests}/${totalTests})`
      );
    } else {
      console.log(
        `  ✗ TESTS FAILED: ${failedTests} of ${totalTests} failed`
      );
    }
    console.log("═".repeat(60));

    console.log(`\n  Total:  ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${failedTests}`);

    if (errors.length > 0) {
      console.log("\n  Failures:");
      for (const err of errors) {
        console.log(`    ✗ ${err}`);
      }
    }

    console.log("");

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "\n✗ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    // Attempt cleanup on fatal error
    try {
      await cleanupCandidateTestData();
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
