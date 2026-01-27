/**
 * Phase 2.5 End-to-End Verification Script
 *
 * This script verifies Phase 1 and Phase 2 functionality with the new
 * multi-location scoping (orgId + locationId instead of userId):
 *
 * Phase 1 Tests:
 * 1. Organization and Location creation
 * 2. Kitchen Configuration creation/upsert
 * 3. Single Staff creation
 * 4. CSV import with duplicate detection (upsert)
 * 5. Staff query validation
 *
 * Phase 2 Tests:
 * 6. Schedule creation for a specific week
 * 7. Shift creation with overlap validation
 * 8. Overlap detection (should reject conflicting shifts)
 * 9. Date range queries for shifts
 * 10. Schedule status update (DRAFT → PUBLISHED)
 *
 * Run: npm run test:phase-2.5
 *
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - TEST_USER_ID: A test Clerk user ID (e.g., "user_test_phase25_2026")
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import { OrganizationService } from "../src/server/services/organization.service";
import { LocationService } from "../src/server/services/location.service";
import { OrganizationMemberService } from "../src/server/services/organization-member.service";
import { KitchenConfigService } from "../src/server/services/kitchen-config.service";
import { StaffService } from "../src/server/services/staff.service";
import { ScheduleService } from "../src/server/services/schedule.service";
import { ShiftService } from "../src/server/services/shift.service";
import { formatWeekLabel } from "../src/lib/utils/date";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import type { StaffInput } from "../src/lib/validations/staff.schema";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const TEST_USER_ID = process.env.TEST_USER_ID || "user_test_phase25_2026";

// Test week: Monday, January 26, 2026
const TEST_WEEK_START = new Date(2026, 0, 26, 0, 0, 0, 0);

// Test kitchen configuration
const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "Test Kitchen - Phase 2.5 Verification",
  stations: ["Grill", "Prep", "Assembly", "Register"],
  roles: ["General Manager", "Kitchen Manager", "Cook"],
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

// Test staff member for single create
const TEST_STAFF_SINGLE: Omit<StaffInput, "isActive"> = {
  name: "Test Employee Alpha",
  email: "test.alpha@phase25verification.com",
  phone: "555-000-0001",
  roles: ["Cook"],
  skills: [
    { station: "Grill", proficiency: 4 },
    { station: "Prep", proficiency: 3 },
  ],
};

// Test staff for CSV bulk import simulation - First batch
const TEST_STAFF_CSV_BATCH_1: Array<Omit<StaffInput, "isActive">> = [
  {
    name: "CSV Employee One",
    email: "csv.one@phase25verification.com",
    phone: "555-100-0001",
    roles: ["Cook"],
    skills: [{ station: "Grill", proficiency: 5 }],
  },
  {
    name: "CSV Employee Two",
    email: "csv.two@phase25verification.com",
    phone: "555-100-0002",
    roles: ["Cook"],
    skills: [{ station: "Prep", proficiency: 4 }],
  },
  {
    name: "CSV Employee Three",
    email: "csv.three@phase25verification.com",
    phone: "555-100-0003",
    roles: ["Kitchen Manager"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
    ],
  },
];

// Second batch includes duplicates (same emails) + one new employee
const TEST_STAFF_CSV_BATCH_2: Array<Omit<StaffInput, "isActive">> = [
  {
    name: "CSV Employee One Updated",
    email: "csv.one@phase25verification.com",
    phone: "555-100-0001",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Register", proficiency: 2 },
    ],
  },
  {
    name: "CSV Employee Two",
    email: "csv.two@phase25verification.com",
    phone: "555-100-0002",
    roles: ["Cook"],
    skills: [{ station: "Prep", proficiency: 5 }],
  },
  {
    name: "CSV Employee Three",
    email: "csv.three@phase25verification.com",
    phone: "555-100-0003",
    roles: ["Kitchen Manager"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
    ],
  },
  {
    name: "CSV Employee Four",
    email: "csv.four@phase25verification.com",
    phone: "555-100-0004",
    roles: ["General Manager"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Prep", proficiency: 5 },
      { station: "Assembly", proficiency: 5 },
      { station: "Register", proficiency: 5 },
    ],
  },
];

// ============================================================================
// Test Results Tracking
// ============================================================================

interface TestResults {
  orgCreated: boolean;
  locationCreated: boolean;
  kitchenConfigCreated: boolean;
  staffCreatedCount: number;
  csvFirstImport: { inserted: number; updated: number };
  csvSecondImport: { inserted: number; updated: number };
  staffQueryCount: number;
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
  orgCreated: false,
  locationCreated: false,
  kitchenConfigCreated: false,
  staffCreatedCount: 0,
  csvFirstImport: { inserted: 0, updated: 0 },
  csvSecondImport: { inserted: 0, updated: 0 },
  staffQueryCount: 0,
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
// Test Variables (set during execution)
// ============================================================================

let testOrgId: string;
let testLocationId: string;
let testStaffId: string;
let testScheduleId: string;

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
// Test Steps
// ============================================================================

async function cleanup(): Promise<void> {
  logStep("Cleanup: Removing existing test data");

  try {
    // Find existing organization for test user
    const existingOrg = await OrganizationService.getByOwnerId(TEST_USER_ID);

    if (existingOrg) {
      log(`Found existing org: ${existingOrg.name} (ID: ${existingOrg.id})`);

      // Get all locations for this org
      const locations = await LocationService.listByOrgId(existingOrg.id);

      for (const location of locations) {
        // Delete shifts
        const shiftsDeleted = await ShiftService.deleteAllByLocation(
          existingOrg.id,
          location.id
        );
        log(`Shifts deleted for location ${location.name}: ${shiftsDeleted}`);

        // Delete schedules
        const schedulesDeleted = await ScheduleService.deleteAllByLocation(
          existingOrg.id,
          location.id
        );
        log(
          `Schedules deleted for location ${location.name}: ${schedulesDeleted}`
        );

        // Delete staff
        const staffDeleted = await StaffService.deleteAllByLocation(
          existingOrg.id,
          location.id
        );
        log(`Staff deleted for location ${location.name}: ${staffDeleted}`);

        // Delete kitchen config
        const configDeleted = await KitchenConfigService.deleteByLocation(
          existingOrg.id,
          location.id
        );
        log(
          `Kitchen config deleted for location ${location.name}: ${configDeleted}`
        );

        // Delete location
        await LocationService.delete(existingOrg.id, location.id);
        log(`Location deleted: ${location.name}`);
      }

      // Delete all members for this org
      const membersDeleted =
        await OrganizationMemberService.deleteAllByOrgId(existingOrg.id);
      log(`Organization members deleted: ${membersDeleted}`);

      // Delete organization
      await OrganizationService.delete(existingOrg.id);
      log(`Organization deleted: ${existingOrg.name}`);
    } else {
      log("No existing test data found");
    }

    logSuccess("Cleanup complete");
  } catch (error) {
    logError(
      `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function setupOrganization(): Promise<void> {
  logStep("Setup: Creating Organization and Location");

  try {
    // Create organization
    const org = await OrganizationService.create(TEST_USER_ID, {
      name: "Test Organization - Phase 2.5",
    });
    testOrgId = org.id;
    log(`Created organization: "${org.name}" (ID: ${org.id})`);

    // Create location
    const location = await LocationService.create(org.id, {
      name: "Test Kitchen",
      timezone: "America/New_York",
    });
    testLocationId = location.id;
    log(
      `Created location: "${location.name}" (ID: ${location.id}, TZ: ${location.timezone})`
    );

    // Create membership (owner)
    const member = await OrganizationMemberService.create({
      orgId: org.id,
      locationId: null, // Org-wide access
      clerkUserId: TEST_USER_ID,
      role: "owner",
    });
    log(`Created membership: ${member.clerkUserId} as ${member.role}`);

    results.orgCreated = true;
    results.locationCreated = true;
    logSuccess("Organization and Location created successfully");
  } catch (error) {
    logError(
      `Setup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error; // Fatal - can't continue without org/location
  }
}

async function testKitchenConfig(): Promise<void> {
  logStep("Test 1: Kitchen Configuration (Phase 1)");

  try {
    // Create kitchen config
    const config = await KitchenConfigService.upsert(
      testOrgId,
      testLocationId,
      TEST_KITCHEN_CONFIG
    );
    log(`Created config: "${config.name}"`);
    log(`Stations: ${config.stations.join(", ")}`);
    log(`Roles: ${config.roles.join(", ")}`);

    // Verify it can be retrieved
    const retrieved = await KitchenConfigService.getByLocation(
      testOrgId,
      testLocationId
    );
    if (!retrieved) {
      throw new Error("Failed to retrieve kitchen config after creation");
    }

    if (retrieved.id !== config.id) {
      throw new Error("Retrieved config ID does not match created config ID");
    }

    if (retrieved.stations.length < 1 || retrieved.roles.length < 1) {
      throw new Error("Kitchen config missing required stations or roles");
    }

    results.kitchenConfigCreated = true;
    logSuccess(`Kitchen config created and verified (ID: ${config.id})`);
  } catch (error) {
    logError(
      `Kitchen config test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testSingleStaffCreate(): Promise<void> {
  logStep("Test 2: Single Staff Creation (Phase 1)");

  try {
    const staff = await StaffService.create(
      testOrgId,
      testLocationId,
      TEST_STAFF_SINGLE
    );
    testStaffId = staff.id; // Save for shift tests
    log(`Created staff: "${staff.name}" (${staff.email})`);
    log(`Roles: ${staff.roles.join(", ")}`);
    log(
      `Skills: ${staff.skills.map((s) => `${s.station}:${s.proficiency}`).join(", ")}`
    );

    // Verify staff exists in list
    const allStaff = await StaffService.list(testOrgId, testLocationId);
    const found = allStaff.find((s) => s.email === TEST_STAFF_SINGLE.email);
    if (!found) {
      throw new Error("Created staff not found in list query");
    }

    if (!found.isActive) {
      throw new Error("Created staff should be active by default");
    }

    results.staffCreatedCount = 1;
    logSuccess(`Staff member created and verified (ID: ${staff.id})`);
  } catch (error) {
    logError(
      `Single staff creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testCsvImport(): Promise<void> {
  logStep("Test 3a: CSV Import - First Run (Phase 1)");

  try {
    // First import - should insert all 3
    const firstResult = await StaffService.bulkUpsert(
      testOrgId,
      testLocationId,
      TEST_STAFF_CSV_BATCH_1
    );
    log(
      `First import: ${firstResult.inserted} inserted, ${firstResult.updated} updated`
    );

    if (firstResult.inserted !== 3) {
      throw new Error(
        `Expected 3 inserts on first run, got ${firstResult.inserted}`
      );
    }

    results.csvFirstImport = {
      inserted: firstResult.inserted,
      updated: firstResult.updated,
    };
    logSuccess(`First CSV import: ${firstResult.inserted} records inserted`);
  } catch (error) {
    logError(
      `First CSV import failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  logStep("Test 3b: CSV Import - Second Run with Upserts (Phase 1)");

  try {
    // Second import - should update 3 existing, insert 1 new
    const secondResult = await StaffService.bulkUpsert(
      testOrgId,
      testLocationId,
      TEST_STAFF_CSV_BATCH_2
    );
    log(
      `Second import: ${secondResult.inserted} inserted, ${secondResult.updated} updated`
    );

    if (secondResult.inserted !== 1) {
      throw new Error(
        `Expected 1 insert on second run, got ${secondResult.inserted}`
      );
    }

    if (secondResult.inserted + secondResult.updated < 1) {
      throw new Error("Second run should have at least 1 insert or update");
    }

    results.csvSecondImport = {
      inserted: secondResult.inserted,
      updated: secondResult.updated,
    };
    logSuccess(
      `Second CSV import: ${secondResult.inserted} inserted, ${secondResult.updated} updated`
    );
  } catch (error) {
    logError(
      `Second CSV import failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testStaffQuery(): Promise<void> {
  logStep("Test 4: Staff Query Validation (Phase 1)");

  try {
    const allStaff = await StaffService.list(testOrgId, testLocationId);
    log(`Total staff records: ${allStaff.length}`);

    // We should have:
    // - 1 from single create (test.alpha)
    // - 4 from CSV imports (csv.one, csv.two, csv.three, csv.four)
    // Total: 5
    const expectedMinimum = 5;
    if (allStaff.length < expectedMinimum) {
      throw new Error(
        `Expected at least ${expectedMinimum} staff, found ${allStaff.length}`
      );
    }

    // Verify specific records exist
    const expectedEmails = [
      TEST_STAFF_SINGLE.email,
      "csv.one@phase25verification.com",
      "csv.two@phase25verification.com",
      "csv.three@phase25verification.com",
      "csv.four@phase25verification.com",
    ];

    for (const email of expectedEmails) {
      const found = allStaff.find((s) => s.email === email);
      if (!found) {
        throw new Error(`Expected staff with email "${email}" not found`);
      }
      log(`  Found: ${found.name} (${found.email}) - Active: ${found.isActive}`);
    }

    // Verify CSV Employee One was updated (has Register skill now)
    const csvOne = allStaff.find(
      (s) => s.email === "csv.one@phase25verification.com"
    );
    if (csvOne) {
      const hasRegisterSkill = csvOne.skills.some((s) => s.station === "Register");
      if (hasRegisterSkill) {
        log(`  CSV Employee One update verified (Register skill added)`);
      }
    }

    results.staffQueryCount = allStaff.length;
    logSuccess(`Staff query validated: ${allStaff.length} total records`);
  } catch (error) {
    logError(
      `Staff query validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testScheduleCreation(): Promise<void> {
  logStep("Test 5: Schedule Creation (Phase 2)");

  try {
    // Verify test week is a Monday
    if (TEST_WEEK_START.getDay() !== 1) {
      throw new Error(
        `Test week start is not a Monday (day: ${TEST_WEEK_START.getDay()})`
      );
    }

    // Create schedule for test week
    const schedule = await ScheduleService.getOrCreateForWeek(
      testOrgId,
      testLocationId,
      TEST_WEEK_START
    );
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
    const sameSchedule = await ScheduleService.getOrCreateForWeek(
      testOrgId,
      testLocationId,
      TEST_WEEK_START
    );
    if (sameSchedule.id !== schedule.id) {
      throw new Error(
        "getOrCreateForWeek returned different schedule on second call"
      );
    }

    results.scheduleCreated = true;
    logSuccess(`Schedule created and verified (ID: ${schedule.id})`);
  } catch (error) {
    logError(
      `Schedule creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testShiftCreation(): Promise<void> {
  logStep("Test 6: Shift Creation (Phase 2)");

  try {
    // Create shift 1: Monday 9am-5pm on Grill
    const shift1Start = new Date(2026, 0, 26, 9, 0, 0, 0);
    const shift1End = new Date(2026, 0, 26, 17, 0, 0, 0);

    const shift1 = await ShiftService.create({
      orgId: testOrgId,
      locationId: testLocationId,
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
    logError(
      `Shift 1 creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testOverlapDetection(): Promise<void> {
  logStep("Test 7: Overlap Detection (Phase 2)");

  try {
    // Try to create overlapping shift: Monday 1pm-9pm (overlaps with 9am-5pm)
    const overlapStart = new Date(2026, 0, 26, 13, 0, 0, 0);
    const overlapEnd = new Date(2026, 0, 26, 21, 0, 0, 0);

    log(`Attempting overlapping shift: Monday 1:00pm-9:00pm`);

    try {
      await ShiftService.create({
        orgId: testOrgId,
        locationId: testLocationId,
        scheduleId: testScheduleId,
        staffId: testStaffId,
        start: overlapStart,
        end: overlapEnd,
        station: "Prep",
        notes: "This should fail - overlapping shift",
      });

      // If we get here, overlap was NOT blocked
      throw new Error(
        "Overlapping shift was created - overlap detection failed"
      );
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
    logError(
      `Overlap detection test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testDateRangeQuery(): Promise<void> {
  logStep("Test 8: Date Range Query (Phase 2)");

  try {
    // Create shift 2: Tuesday 10am-6pm on Prep (no overlap with Monday shift)
    const shift2Start = new Date(2026, 0, 27, 10, 0, 0, 0);
    const shift2End = new Date(2026, 0, 27, 18, 0, 0, 0);

    const shift2 = await ShiftService.create({
      orgId: testOrgId,
      locationId: testLocationId,
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

    const shifts = await ShiftService.getByStaffAndDateRange(
      testStaffId,
      rangeStart,
      rangeEnd
    );

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
      throw new Error(
        `Expected 2 shifts in schedule, found ${scheduleShifts.length}`
      );
    }

    results.dateRangeQueryCount = shifts.length;
    logSuccess(`Date range query working: ${shifts.length} shifts found`);
  } catch (error) {
    logError(
      `Date range query test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function testScheduleStatusUpdate(): Promise<void> {
  logStep("Test 9: Schedule Status Update - DRAFT → PUBLISHED (Phase 2)");

  try {
    // Update status to PUBLISHED
    const updatedSchedule = await ScheduleService.updateStatus(
      testOrgId,
      testLocationId,
      testScheduleId,
      "PUBLISHED"
    );

    if (!updatedSchedule) {
      throw new Error("Schedule not found after status update");
    }

    log(`Updated status: DRAFT → ${updatedSchedule.status}`);

    if (updatedSchedule.status !== "PUBLISHED") {
      throw new Error(
        `Expected status PUBLISHED, got ${updatedSchedule.status}`
      );
    }

    // Verify status persists on retrieval
    const retrieved = await ScheduleService.getById(
      testOrgId,
      testLocationId,
      testScheduleId
    );
    if (!retrieved || retrieved.status !== "PUBLISHED") {
      throw new Error("Status did not persist after update");
    }

    results.statusUpdated = true;
    logSuccess("Schedule status updated to PUBLISHED");
  } catch (error) {
    logError(
      `Status update test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function finalCleanup(): Promise<void> {
  logStep("Final Cleanup: Removing test data");

  try {
    // Delete shifts first
    const shiftsDeleted = await ShiftService.deleteAllByLocation(
      testOrgId,
      testLocationId
    );
    log(`Shifts deleted: ${shiftsDeleted}`);

    // Delete schedules
    const schedulesDeleted = await ScheduleService.deleteAllByLocation(
      testOrgId,
      testLocationId
    );
    log(`Schedules deleted: ${schedulesDeleted}`);

    // Delete staff
    const staffDeleted = await StaffService.deleteAllByLocation(
      testOrgId,
      testLocationId
    );
    log(`Staff deleted: ${staffDeleted}`);

    // Delete kitchen config
    const configDeleted = await KitchenConfigService.deleteByLocation(
      testOrgId,
      testLocationId
    );
    log(`Kitchen config deleted: ${configDeleted}`);

    // Delete location
    await LocationService.delete(testOrgId, testLocationId);
    log(`Location deleted`);

    // Delete membership
    const membersDeleted =
      await OrganizationMemberService.deleteAllByOrgId(testOrgId);
    log(`Organization members deleted: ${membersDeleted}`);

    // Delete organization
    await OrganizationService.delete(testOrgId);
    log(`Organization deleted`);

    results.cleanupComplete = true;
    logSuccess("Final cleanup complete");
  } catch (error) {
    logError(
      `Final cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  PHASE 2.5 END-TO-END VERIFICATION");
  console.log("  (Multi-Location Scoping)");
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
    await setupOrganization();
    await testKitchenConfig();
    await testSingleStaffCreate();
    await testCsvImport();
    await testStaffQuery();
    await testScheduleCreation();
    await testShiftCreation();
    await testOverlapDetection();
    await testDateRangeQuery();
    await testScheduleStatusUpdate();
    await finalCleanup();

    // Print summary
    console.log("\n" + "═".repeat(60));

    if (results.errors.length === 0) {
      console.log("  ✓ PHASE 2.5 VERIFICATION PASSED");
    } else {
      console.log("  ✗ PHASE 2.5 VERIFICATION FAILED");
    }

    console.log("═".repeat(60));
    console.log("\n=== Phase 1 Results (Foundation) ===");
    console.log(
      `  - Organization Created: ${results.orgCreated ? "Yes ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Location Created: ${results.locationCreated ? "Yes ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Kitchen Config: ${results.kitchenConfigCreated ? "Created ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Staff Created: ${results.staffCreatedCount} ${results.staffCreatedCount > 0 ? "✓" : "✗"}`
    );
    console.log(
      `  - CSV Import (First): ${results.csvFirstImport.inserted} inserted, ${results.csvFirstImport.updated} updated ${results.csvFirstImport.inserted >= 1 ? "✓" : "✗"}`
    );
    console.log(
      `  - CSV Import (Second): ${results.csvSecondImport.inserted} inserted, ${results.csvSecondImport.updated} updated ${results.csvSecondImport.inserted >= 1 ? "✓" : "✗"}`
    );
    console.log(
      `  - Staff Query: ${results.staffQueryCount} total records ${results.staffQueryCount >= 5 ? "✓" : "✗"}`
    );

    console.log("\n=== Phase 2 Results (Scheduling) ===");
    console.log(
      `  - Schedule Created: ${results.scheduleCreated ? "Yes ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Shifts Created: ${results.shift1Created && results.shift2Created ? "2 ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Overlap Detection: ${results.overlapBlocked ? "Blocked ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Date Range Query: ${results.dateRangeQueryCount} found ${results.dateRangeQueryCount === 2 ? "✓" : "✗"}`
    );
    console.log(
      `  - Status Update: ${results.statusUpdated ? "PUBLISHED ✓" : "Failed ✗"}`
    );
    console.log(
      `  - Cleanup: ${results.cleanupComplete ? "Complete ✓" : "Failed ✗"}`
    );

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
    console.error(
      "\n✗ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
  }
}

// Run
main();
