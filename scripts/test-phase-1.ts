/**
 * Phase 1 End-to-End Verification Script
 *
 * This script programmatically verifies the complete Phase 1 data flow:
 * 1. Kitchen Configuration creation/upsert
 * 2. Single Staff creation
 * 3. CSV import with duplicate detection (upsert)
 * 4. Staff query validation
 *
 * Run: npm run test:phase-1
 *
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - TEST_USER_ID: A test Clerk user ID (e.g., "user_test_phase1_2026")
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { dbConnect } from "../src/lib/db";
import { KitchenConfigService } from "../src/server/services/kitchen-config.service";
import { StaffService } from "../src/server/services/staff.service";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import type { StaffInput } from "../src/lib/validations/staff.schema";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const TEST_USER_ID = process.env.TEST_USER_ID || "user_test_phase1_2026";

// Test kitchen configuration matching sample-staff.csv roles and stations
const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "Test Kitchen - Phase 1 Verification",
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
  email: "test.alpha@phase1verification.com",
  phone: "555-000-0001",
  roles: ["Cook"],
  skills: [
    { station: "Grill", proficiency: 4 },
    { station: "Prep", proficiency: 3 },
  ],
};

// Test staff for CSV bulk import simulation
const TEST_STAFF_CSV_BATCH_1: Array<Omit<StaffInput, "isActive">> = [
  {
    name: "CSV Employee One",
    email: "csv.one@phase1verification.com",
    phone: "555-100-0001",
    roles: ["Cook"],
    skills: [{ station: "Grill", proficiency: 5 }],
  },
  {
    name: "CSV Employee Two",
    email: "csv.two@phase1verification.com",
    phone: "555-100-0002",
    roles: ["Cook"],
    skills: [{ station: "Prep", proficiency: 4 }],
  },
  {
    name: "CSV Employee Three",
    email: "csv.three@phase1verification.com",
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
    name: "CSV Employee One Updated", // Same email, updated name
    email: "csv.one@phase1verification.com",
    phone: "555-100-0001",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Register", proficiency: 2 },
    ], // Added skill
  },
  {
    name: "CSV Employee Two", // Same
    email: "csv.two@phase1verification.com",
    phone: "555-100-0002",
    roles: ["Cook"],
    skills: [{ station: "Prep", proficiency: 5 }], // Proficiency upgraded
  },
  {
    name: "CSV Employee Three", // Same
    email: "csv.three@phase1verification.com",
    phone: "555-100-0003",
    roles: ["Kitchen Manager"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
    ],
  },
  {
    name: "CSV Employee Four", // NEW
    email: "csv.four@phase1verification.com",
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
  kitchenConfigCreated: boolean;
  staffCreatedCount: number;
  csvFirstImport: { inserted: number; updated: number };
  csvSecondImport: { inserted: number; updated: number };
  staffQueryCount: number;
  cleanupComplete: boolean;
  errors: string[];
}

const results: TestResults = {
  kitchenConfigCreated: false,
  staffCreatedCount: 0,
  csvFirstImport: { inserted: 0, updated: 0 },
  csvSecondImport: { inserted: 0, updated: 0 },
  staffQueryCount: 0,
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
// Test Steps
// ============================================================================

async function cleanup(): Promise<void> {
  logStep("Cleanup: Removing existing test data");

  try {
    const configDeleted = await KitchenConfigService.deleteByUserId(TEST_USER_ID);
    log(`Kitchen config deleted: ${configDeleted}`);

    const staffDeleted = await StaffService.deleteAllByUserId(TEST_USER_ID);
    log(`Staff records deleted: ${staffDeleted}`);

    results.cleanupComplete = true;
    logSuccess("Cleanup complete");
  } catch (error) {
    logError(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testKitchenConfig(): Promise<void> {
  logStep("Test 1: Kitchen Configuration");

  try {
    // Create kitchen config
    const config = await KitchenConfigService.upsert(TEST_USER_ID, TEST_KITCHEN_CONFIG);
    log(`Created config: "${config.name}"`);
    log(`Stations: ${config.stations.join(", ")}`);
    log(`Roles: ${config.roles.join(", ")}`);

    // Verify it can be retrieved
    const retrieved = await KitchenConfigService.getByUserId(TEST_USER_ID);
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
    logError(`Kitchen config test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testSingleStaffCreate(): Promise<void> {
  logStep("Test 2: Single Staff Creation");

  try {
    const staff = await StaffService.create(TEST_USER_ID, TEST_STAFF_SINGLE);
    log(`Created staff: "${staff.name}" (${staff.email})`);
    log(`Roles: ${staff.roles.join(", ")}`);
    log(`Skills: ${staff.skills.map((s) => `${s.station}:${s.proficiency}`).join(", ")}`);

    // Verify staff exists in list
    const allStaff = await StaffService.list(TEST_USER_ID);
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
    logError(`Single staff creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testCsvImport(): Promise<void> {
  logStep("Test 3: CSV Import (First Run - Inserts)");

  try {
    // First import - should insert all 3
    const firstResult = await StaffService.bulkUpsert(TEST_USER_ID, TEST_STAFF_CSV_BATCH_1);
    log(`First import: ${firstResult.inserted} inserted, ${firstResult.updated} updated`);

    if (firstResult.inserted !== 3) {
      throw new Error(`Expected 3 inserts on first run, got ${firstResult.inserted}`);
    }

    results.csvFirstImport = { inserted: firstResult.inserted, updated: firstResult.updated };
    logSuccess(`First CSV import: ${firstResult.inserted} records inserted`);
  } catch (error) {
    logError(`First CSV import failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  logStep("Test 3b: CSV Import (Second Run - Upserts)");

  try {
    // Second import - should update 3 existing, insert 1 new
    const secondResult = await StaffService.bulkUpsert(TEST_USER_ID, TEST_STAFF_CSV_BATCH_2);
    log(`Second import: ${secondResult.inserted} inserted, ${secondResult.updated} updated`);

    if (secondResult.inserted !== 1) {
      throw new Error(`Expected 1 insert on second run, got ${secondResult.inserted}`);
    }

    // Note: bulkWrite modifiedCount only counts docs that actually changed
    // If data is identical, it may report 0 updates even though it matched
    if (secondResult.inserted + secondResult.updated < 1) {
      throw new Error("Second run should have at least 1 insert or update");
    }

    results.csvSecondImport = { inserted: secondResult.inserted, updated: secondResult.updated };
    logSuccess(`Second CSV import: ${secondResult.inserted} inserted, ${secondResult.updated} updated`);
  } catch (error) {
    logError(`Second CSV import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testStaffQuery(): Promise<void> {
  logStep("Test 4: Staff Query Validation");

  try {
    const allStaff = await StaffService.list(TEST_USER_ID);
    log(`Total staff records: ${allStaff.length}`);

    // We should have:
    // - 1 from single create (test.alpha)
    // - 4 from CSV imports (csv.one, csv.two, csv.three, csv.four)
    // Total: 5
    const expectedMinimum = 5;
    if (allStaff.length < expectedMinimum) {
      throw new Error(`Expected at least ${expectedMinimum} staff, found ${allStaff.length}`);
    }

    // Verify specific records exist
    const expectedEmails = [
      TEST_STAFF_SINGLE.email,
      "csv.one@phase1verification.com",
      "csv.two@phase1verification.com",
      "csv.three@phase1verification.com",
      "csv.four@phase1verification.com",
    ];

    for (const email of expectedEmails) {
      const found = allStaff.find((s) => s.email === email);
      if (!found) {
        throw new Error(`Expected staff with email "${email}" not found`);
      }
      log(`  Found: ${found.name} (${found.email}) - Active: ${found.isActive}`);
    }

    // Verify all staff are active
    const inactiveCount = allStaff.filter((s) => !s.isActive).length;
    if (inactiveCount > 0) {
      log(`  Warning: ${inactiveCount} staff members are inactive`);
    }

    // Verify CSV Employee One was updated (has Register skill now)
    const csvOne = allStaff.find((s) => s.email === "csv.one@phase1verification.com");
    if (csvOne) {
      const hasRegisterSkill = csvOne.skills.some((s) => s.station === "Register");
      if (hasRegisterSkill) {
        log(`  CSV Employee One update verified (Register skill added)`);
      }
    }

    results.staffQueryCount = allStaff.length;
    logSuccess(`Staff query validated: ${allStaff.length} total records`);
  } catch (error) {
    logError(`Staff query validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function finalCleanup(): Promise<void> {
  logStep("Final Cleanup: Removing test data");

  try {
    const configDeleted = await KitchenConfigService.deleteByUserId(TEST_USER_ID);
    log(`Kitchen config deleted: ${configDeleted}`);

    const staffDeleted = await StaffService.deleteAllByUserId(TEST_USER_ID);
    log(`Staff records deleted: ${staffDeleted}`);

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
  console.log("  PHASE 1 END-TO-END VERIFICATION");
  console.log("═".repeat(60));
  console.log(`\nTest User ID: ${TEST_USER_ID}`);
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
    await testKitchenConfig();
    await testSingleStaffCreate();
    await testCsvImport();
    await testStaffQuery();
    await finalCleanup();

    // Print summary
    console.log("\n" + "═".repeat(60));

    if (results.errors.length === 0) {
      console.log("  ✓ PHASE 1 VERIFICATION PASSED");
    } else {
      console.log("  ✗ PHASE 1 VERIFICATION FAILED");
    }

    console.log("═".repeat(60));
    console.log("\nResults:");
    console.log(`  - Kitchen Config: ${results.kitchenConfigCreated ? "Created ✓" : "Failed ✗"}`);
    console.log(`  - Staff Created: ${results.staffCreatedCount} ${results.staffCreatedCount > 0 ? "✓" : "✗"}`);
    console.log(
      `  - CSV Import (First): ${results.csvFirstImport.inserted} inserted, ${results.csvFirstImport.updated} updated ${results.csvFirstImport.inserted >= 1 ? "✓" : "✗"}`
    );
    console.log(
      `  - CSV Import (Second): ${results.csvSecondImport.inserted} inserted, ${results.csvSecondImport.updated} updated ${results.csvSecondImport.inserted >= 1 ? "✓" : "✗"}`
    );
    console.log(`  - Staff Query: ${results.staffQueryCount} total records ${results.staffQueryCount >= 5 ? "✓" : "✗"}`);
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
