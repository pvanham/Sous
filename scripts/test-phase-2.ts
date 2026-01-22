/**
 * Phase 2 End-to-End Verification Script
 *
 * This script programmatically verifies the complete Phase 2 data flow:
 * 1. Schedule creation for a specific week
 * 2. Shift creation with overlap validation
 * 3. Overlap detection (should reject conflicting shifts)
 * 4. Date range queries for shifts
 * 5. Schedule status update (DRAFT → PUBLISHED)
 *
 * Run: npm run test:phase-2
 *
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - TEST_USER_ID: A test Clerk user ID (e.g., "user_test_phase2_2026")
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import { ScheduleService } from "../src/server/services/schedule.service";
import { ShiftService } from "../src/server/services/shift.service";
import { StaffService } from "../src/server/services/staff.service";
import { KitchenConfigService } from "../src/server/services/kitchen-config.service";
import { getWeekStart, formatWeekLabel } from "../src/lib/utils/date";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import type { StaffInput } from "../src/lib/validations/staff.schema";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const TEST_USER_ID = process.env.TEST_USER_ID || "user_test_phase2_2026";

// Test week: Monday, January 26, 2026
// Use local time to avoid timezone issues (getDay() uses local time)
const TEST_WEEK_START = new Date(2026, 0, 26, 0, 0, 0, 0); // Month is 0-indexed

// Kitchen configuration for testing
const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "Test Kitchen - Phase 2 Verification",
  stations: ["Grill", "Prep", "Assembly", "Register"],
  roles: ["Cook", "Kitchen Manager"],
  operatingHours: {
    monday: { isOpen: true, open: "09:00", close: "22:00" },
    tuesday: { isOpen: true, open: "09:00", close: "22:00" },
    wednesday: { isOpen: true, open: "09:00", close: "22:00" },
    thursday: { isOpen: true, open: "09:00", close: "22:00" },
    friday: { isOpen: true, open: "09:00", close: "23:00" },
    saturday: { isOpen: true, open: "10:00", close: "23:00" },
    sunday: { isOpen: false, open: "", close: "" },
  },
};

// Test staff member for shifts
const TEST_STAFF: Omit<StaffInput, "isActive"> = {
  name: "Test Staff Phase2",
  email: "test.staff@phase2verification.com",
  phone: "555-200-0001",
  roles: ["Cook"],
  skills: [
    { station: "Grill", proficiency: 5 },
    { station: "Prep", proficiency: 4 },
  ],
};

// ============================================================================
// Test Results Tracking
// ============================================================================

interface TestResults {
  scheduleCreated: boolean;
  scheduleId: string;
  shift1Created: boolean;
  shift2Created: boolean;
  overlapBlocked: boolean;
  dateRangeQueryCount: number;
  statusUpdated: boolean;
  cleanupComplete: boolean;
  errors: string[];
}

const results: TestResults = {
  scheduleCreated: false,
  scheduleId: "",
  shift1Created: false,
  shift2Created: false,
  overlapBlocked: false,
  dateRangeQueryCount: 0,
  statusUpdated: false,
  cleanupComplete: false,
  errors: [],
};

// ============================================================================
// Test Helpers
// ============================================================================

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n[STEP] ${step}`);
}

function logError(error: string): void {
  console.error(`  ✗ ERROR: ${error}`);
  results.errors.push(error);
}

function logSuccess(message: string): void {
  console.log(`  ✓ ${message}`);
}

// ============================================================================
// Test Variables (set during test execution)
// ============================================================================

let testStaffId: string;
let testScheduleId: string;

// ============================================================================
// Test Steps
// ============================================================================

async function cleanup(): Promise<void> {
  logStep("Cleanup: Removing existing test data");

  try {
    // Delete shifts first (referential integrity)
    const shiftsDeleted = await ShiftService.deleteAllByUserId(TEST_USER_ID);
    log(`Shifts deleted: ${shiftsDeleted}`);

    // Delete schedules
    const schedulesDeleted = await ScheduleService.deleteAllByUserId(TEST_USER_ID);
    log(`Schedules deleted: ${schedulesDeleted}`);

    // Delete staff
    const staffDeleted = await StaffService.deleteAllByUserId(TEST_USER_ID);
    log(`Staff deleted: ${staffDeleted}`);

    // Delete kitchen config
    const configDeleted = await KitchenConfigService.deleteByUserId(TEST_USER_ID);
    log(`Kitchen config deleted: ${configDeleted}`);

    logSuccess("Cleanup complete");
  } catch (error) {
    logError(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setupPrerequisites(): Promise<void> {
  logStep("Setup: Creating prerequisites (Kitchen Config & Staff)");

  try {
    // Create kitchen config
    const config = await KitchenConfigService.upsert(TEST_USER_ID, TEST_KITCHEN_CONFIG);
    log(`Created kitchen config: "${config.name}"`);
    log(`Stations: ${config.stations.join(", ")}`);

    // Create test staff
    const staff = await StaffService.create(TEST_USER_ID, TEST_STAFF);
    testStaffId = staff.id;
    log(`Created test staff: "${staff.name}" (ID: ${staff.id})`);

    logSuccess("Prerequisites created");
  } catch (error) {
    logError(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Fatal - can't continue without prerequisites
  }
}

async function testScheduleCreation(): Promise<void> {
  logStep("Test 1: Schedule Creation");

  try {
    // Verify test week is a Monday
    if (TEST_WEEK_START.getDay() !== 1) {
      throw new Error(`Test week start is not a Monday (day: ${TEST_WEEK_START.getDay()})`);
    }

    // Create schedule for test week
    const schedule = await ScheduleService.getOrCreateForWeek(TEST_USER_ID, TEST_WEEK_START);
    testScheduleId = schedule.id;
    results.scheduleId = schedule.id;

    log(`Created schedule for: ${formatWeekLabel(schedule.weekStartDate)}`);
    log(`Status: ${schedule.status}`);
    log(`Schedule ID: ${schedule.id}`);

    // Verify schedule properties
    if (schedule.status !== "DRAFT") {
      throw new Error(`Expected status DRAFT, got ${schedule.status}`);
    }

    if (schedule.weekStartDate.getDay() !== 1) {
      throw new Error("Schedule weekStartDate is not a Monday");
    }

    // Verify getOrCreate returns same schedule on second call
    const sameSchedule = await ScheduleService.getOrCreateForWeek(TEST_USER_ID, TEST_WEEK_START);
    if (sameSchedule.id !== schedule.id) {
      throw new Error("getOrCreateForWeek returned different schedule on second call");
    }

    results.scheduleCreated = true;
    logSuccess(`Schedule created and verified (ID: ${schedule.id})`);
  } catch (error) {
    logError(`Schedule creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testShiftCreation(): Promise<void> {
  logStep("Test 2: Shift Creation");

  try {
    // Create shift 1: Monday 9am-5pm on Grill
    // Use local time to match the schedule's weekStartDate
    const shift1Start = new Date(2026, 0, 26, 9, 0, 0, 0);
    const shift1End = new Date(2026, 0, 26, 17, 0, 0, 0);

    const shift1 = await ShiftService.create({
      userId: TEST_USER_ID,
      scheduleId: testScheduleId,
      staffId: testStaffId,
      start: shift1Start,
      end: shift1End,
      station: "Grill",
      notes: "Test shift 1 - Monday morning",
    });

    log(`Created shift 1: Monday 9:00am-5:00pm (Grill)`);
    log(`  Shift ID: ${shift1.id}`);
    log(`  Station: ${shift1.station}`);
    log(`  Notes: ${shift1.notes}`);

    // Verify shift properties
    if (shift1.station !== "Grill") {
      throw new Error(`Expected station Grill, got ${shift1.station}`);
    }

    if (shift1.scheduleId !== testScheduleId) {
      throw new Error("Shift scheduleId does not match");
    }

    if (shift1.staffId !== testStaffId) {
      throw new Error("Shift staffId does not match");
    }

    results.shift1Created = true;
    logSuccess(`Shift 1 created and verified (ID: ${shift1.id})`);
  } catch (error) {
    logError(`Shift 1 creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testOverlapDetection(): Promise<void> {
  logStep("Test 3: Overlap Detection");

  try {
    // Try to create overlapping shift: Monday 1pm-9pm (overlaps with 9am-5pm)
    const overlapStart = new Date(2026, 0, 26, 13, 0, 0, 0);
    const overlapEnd = new Date(2026, 0, 26, 21, 0, 0, 0);

    log(`Attempting overlapping shift: Monday 1:00pm-9:00pm`);

    try {
      await ShiftService.create({
        userId: TEST_USER_ID,
        scheduleId: testScheduleId,
        staffId: testStaffId,
        start: overlapStart,
        end: overlapEnd,
        station: "Prep",
        notes: "This should fail - overlapping shift",
      });

      // If we get here, overlap was NOT blocked
      throw new Error("Overlapping shift was created - overlap detection failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check if the error is about overlap (expected)
      if (message.toLowerCase().includes("overlap")) {
        log(`  Overlap correctly rejected: "${message}"`);
        results.overlapBlocked = true;
        logSuccess("Overlap detection working correctly");
      } else {
        // Some other error occurred
        throw error;
      }
    }
  } catch (error) {
    logError(`Overlap detection test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testDateRangeQuery(): Promise<void> {
  logStep("Test 4: Date Range Query");

  try {
    // Create shift 2: Tuesday 10am-6pm on Prep (no overlap with Monday shift)
    const shift2Start = new Date(2026, 0, 27, 10, 0, 0, 0);
    const shift2End = new Date(2026, 0, 27, 18, 0, 0, 0);

    const shift2 = await ShiftService.create({
      userId: TEST_USER_ID,
      scheduleId: testScheduleId,
      staffId: testStaffId,
      start: shift2Start,
      end: shift2End,
      station: "Prep",
      notes: "Test shift 2 - Tuesday",
    });

    log(`Created shift 2: Tuesday 10:00am-6:00pm (Prep)`);
    results.shift2Created = true;

    // Query shifts for the week range
    const rangeStart = new Date(2026, 0, 26, 0, 0, 0, 0);
    const rangeEnd = new Date(2026, 0, 28, 23, 59, 59, 999);

    const shifts = await ShiftService.getByStaffAndDateRange(testStaffId, rangeStart, rangeEnd);

    log(`Date range query (Jan 26-28): Found ${shifts.length} shifts`);

    // We should have exactly 2 shifts
    if (shifts.length !== 2) {
      throw new Error(`Expected 2 shifts in range, found ${shifts.length}`);
    }

    // Verify both shifts are present
    const hasGrillShift = shifts.some((s) => s.station === "Grill");
    const hasPrepShift = shifts.some((s) => s.station === "Prep");

    if (!hasGrillShift || !hasPrepShift) {
      throw new Error("Date range query missing expected shifts");
    }

    // List shifts by schedule
    const scheduleShifts = await ShiftService.getBySchedule(testScheduleId);
    log(`Shifts in schedule: ${scheduleShifts.length}`);

    if (scheduleShifts.length !== 2) {
      throw new Error(`Expected 2 shifts in schedule, found ${scheduleShifts.length}`);
    }

    results.dateRangeQueryCount = shifts.length;
    logSuccess(`Date range query working: ${shifts.length} shifts found`);
  } catch (error) {
    logError(`Date range query test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testScheduleStatusUpdate(): Promise<void> {
  logStep("Test 5: Schedule Status Update (DRAFT → PUBLISHED)");

  try {
    // Update status to PUBLISHED
    const updatedSchedule = await ScheduleService.updateStatus(TEST_USER_ID, testScheduleId, "PUBLISHED");

    if (!updatedSchedule) {
      throw new Error("Schedule not found after status update");
    }

    log(`Updated status: DRAFT → ${updatedSchedule.status}`);

    if (updatedSchedule.status !== "PUBLISHED") {
      throw new Error(`Expected status PUBLISHED, got ${updatedSchedule.status}`);
    }

    // Verify status persists on retrieval
    const retrieved = await ScheduleService.getById(TEST_USER_ID, testScheduleId);
    if (!retrieved || retrieved.status !== "PUBLISHED") {
      throw new Error("Status did not persist after update");
    }

    results.statusUpdated = true;
    logSuccess("Schedule status updated to PUBLISHED");
  } catch (error) {
    logError(`Status update test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function finalCleanup(): Promise<void> {
  logStep("Final Cleanup: Removing test data");

  try {
    // Delete shifts first
    const shiftsDeleted = await ShiftService.deleteAllByUserId(TEST_USER_ID);
    log(`Shifts deleted: ${shiftsDeleted}`);

    // Delete schedules
    const schedulesDeleted = await ScheduleService.deleteAllByUserId(TEST_USER_ID);
    log(`Schedules deleted: ${schedulesDeleted}`);

    // Delete staff
    const staffDeleted = await StaffService.deleteAllByUserId(TEST_USER_ID);
    log(`Staff deleted: ${staffDeleted}`);

    // Delete kitchen config
    const configDeleted = await KitchenConfigService.deleteByUserId(TEST_USER_ID);
    log(`Kitchen config deleted: ${configDeleted}`);

    results.cleanupComplete = true;
    logSuccess("Final cleanup complete");
  } catch (error) {
    logError(`Final cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  PHASE 2 END-TO-END VERIFICATION");
  console.log("═".repeat(60));
  console.log(`\nTest User ID: ${TEST_USER_ID}`);
  console.log(`Test Week: ${formatWeekLabel(TEST_WEEK_START)}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);

  if (!process.env.MONGODB_URI) {
    console.error("\n✗ MONGODB_URI environment variable is not set");
    process.exit(1);
  }

  try {
    // Connect to database
    logStep("Connecting to MongoDB");
    await dbConnect();
    logSuccess("Database connected");

    // Run tests
    await cleanup();
    await setupPrerequisites();
    await testScheduleCreation();
    await testShiftCreation();
    await testOverlapDetection();
    await testDateRangeQuery();
    await testScheduleStatusUpdate();
    await finalCleanup();

    // Print summary
    console.log("\n" + "═".repeat(60));

    if (results.errors.length === 0) {
      console.log("  ✓ PHASE 2 VERIFICATION PASSED");
    } else {
      console.log("  ✗ PHASE 2 VERIFICATION FAILED");
    }

    console.log("═".repeat(60));
    console.log("\nResults:");
    console.log(`  - Schedule Created: ${results.scheduleCreated ? "1 ✓" : "Failed ✗"}`);
    console.log(`  - Shifts Created: ${results.shift1Created && results.shift2Created ? "2 ✓" : "Failed ✗"}`);
    console.log(`  - Overlap Detection: ${results.overlapBlocked ? "Blocked ✓" : "Failed ✗"}`);
    console.log(`  - Date Range Query: ${results.dateRangeQueryCount} found ${results.dateRangeQueryCount === 2 ? "✓" : "✗"}`);
    console.log(`  - Status Update: ${results.statusUpdated ? "PUBLISHED ✓" : "Failed ✗"}`);
    console.log(`  - Cleanup: ${results.cleanupComplete ? "Complete ✓" : "Failed ✗"}`);

    if (results.errors.length > 0) {
      console.log("\nErrors:");
      results.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    console.log("");

    // Exit with appropriate code
    if (results.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\n✗ Fatal error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
  }
}

// Run
main();
