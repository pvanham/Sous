/**
 * Migration Script: Add Multi-Location Support
 *
 * This script migrates existing data from userId-based scoping to orgId/locationId-based scoping.
 * It will:
 * 1. Create an Organization for each unique userId
 * 2. Create a default Location for each Organization
 * 3. Create OrganizationMember records
 * 4. Backfill orgId and locationId on existing documents
 * 5. Clean up old indexes (manual step documented)
 *
 * Run: npx ts-node scripts/migrate-to-multi-location.ts
 *
 * IMPORTANT: Backup your database before running this script!
 *
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose, { Types } from "mongoose";
import { dbConnect } from "../src/lib/db";

// Import models directly for raw collection access
import Organization from "../src/server/models/Organization";
import Location from "../src/server/models/Location";
import OrganizationMember from "../src/server/models/OrganizationMember";
import KitchenConfig from "../src/server/models/KitchenConfig";
import Staff from "../src/server/models/Staff";
import Schedule from "../src/server/models/Schedule";
import Shift from "../src/server/models/Shift";

// ============================================================================
// Configuration
// ============================================================================

const DRY_RUN = process.env.DRY_RUN === "true";

// ============================================================================
// Helpers
// ============================================================================

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n[STEP] ${step}`);
}

function logWarning(message: string): void {
  console.log(`  ⚠ WARNING: ${message}`);
}

function logError(error: string): void {
  console.error(`  ✗ ERROR: ${error}`);
}

function logSuccess(message: string): void {
  console.log(`  ✓ ${message}`);
}

// ============================================================================
// Migration Logic
// ============================================================================

interface MigrationStats {
  orgsCreated: number;
  locationsCreated: number;
  membersCreated: number;
  kitchenConfigsUpdated: number;
  staffUpdated: number;
  schedulesUpdated: number;
  shiftsUpdated: number;
  errors: string[];
}

const stats: MigrationStats = {
  orgsCreated: 0,
  locationsCreated: 0,
  membersCreated: 0,
  kitchenConfigsUpdated: 0,
  staffUpdated: 0,
  schedulesUpdated: 0,
  shiftsUpdated: 0,
  errors: [],
};

// Interface for old data format that still has userId
interface OldFormatDoc {
  _id: unknown;
  userId?: string;
}

async function findUniqueUserIds(): Promise<string[]> {
  logStep("Finding unique userIds in existing data");

  const userIds = new Set<string>();

  // Check KitchenConfigs - cast to handle old format with userId
  const configs = await KitchenConfig.find({}, { userId: 1 }).lean() as OldFormatDoc[];
  configs.forEach((c) => {
    if (c.userId) userIds.add(c.userId);
  });
  log(`Found ${configs.length} KitchenConfigs`);

  // Check Staff
  const staff = await Staff.find({}, { userId: 1 }).lean() as OldFormatDoc[];
  staff.forEach((s) => {
    if (s.userId) userIds.add(s.userId);
  });
  log(`Found ${staff.length} Staff records`);

  // Check Schedules
  const schedules = await Schedule.find({}, { userId: 1 }).lean() as OldFormatDoc[];
  schedules.forEach((s) => {
    if (s.userId) userIds.add(s.userId);
  });
  log(`Found ${schedules.length} Schedules`);

  // Check Shifts
  const shifts = await Shift.find({}, { userId: 1 }).lean() as OldFormatDoc[];
  shifts.forEach((s) => {
    if (s.userId) userIds.add(s.userId);
  });
  log(`Found ${shifts.length} Shifts`);

  const uniqueUserIds = Array.from(userIds);
  logSuccess(`Found ${uniqueUserIds.length} unique userIds`);

  return uniqueUserIds;
}

async function createOrgAndLocationForUser(
  userId: string
): Promise<{ orgId: Types.ObjectId; locationId: Types.ObjectId }> {
  // Check if organization already exists for this user
  let org = await Organization.findOne({ ownerId: userId });

  if (!org) {
    if (!DRY_RUN) {
      org = await Organization.create({
        ownerId: userId,
        name: "My Restaurant",
      });
      stats.orgsCreated++;
    } else {
      log(`[DRY RUN] Would create Organization for user: ${userId}`);
      // Return fake IDs for dry run
      return {
        orgId: new Types.ObjectId(),
        locationId: new Types.ObjectId(),
      };
    }
  }

  // Check if default location exists
  let location = await Location.findOne({ orgId: org._id });

  if (!location) {
    if (!DRY_RUN) {
      location = await Location.create({
        orgId: org._id,
        name: "Main Kitchen",
        timezone: "America/New_York",
      });
      stats.locationsCreated++;
    } else {
      log(`[DRY RUN] Would create Location for org: ${org._id}`);
      return {
        orgId: org._id,
        locationId: new Types.ObjectId(),
      };
    }
  }

  // Check if OrganizationMember exists
  const existingMember = await OrganizationMember.findOne({
    orgId: org._id,
    clerkUserId: userId,
  });

  if (!existingMember) {
    if (!DRY_RUN) {
      await OrganizationMember.create({
        orgId: org._id,
        locationId: null, // Org-wide access
        clerkUserId: userId,
        role: "owner",
      });
      stats.membersCreated++;
    } else {
      log(`[DRY RUN] Would create OrganizationMember for user: ${userId}`);
    }
  }

  return {
    orgId: org._id as Types.ObjectId,
    locationId: location._id as Types.ObjectId,
  };
}

async function migrateKitchenConfigs(
  userId: string,
  orgId: Types.ObjectId,
  locationId: Types.ObjectId
): Promise<void> {
  // Find configs that still have userId (not yet migrated)
  const configs = await KitchenConfig.find({
    userId: userId,
    orgId: { $exists: false },
  });

  if (configs.length === 0) {
    log(`No KitchenConfigs to migrate for user: ${userId}`);
    return;
  }

  if (!DRY_RUN) {
    for (const config of configs) {
      await KitchenConfig.updateOne(
        { _id: config._id },
        {
          $set: { orgId, locationId },
          $unset: { userId: 1 },
        }
      );
      stats.kitchenConfigsUpdated++;
    }
    log(`Migrated ${configs.length} KitchenConfigs for user: ${userId}`);
  } else {
    log(
      `[DRY RUN] Would migrate ${configs.length} KitchenConfigs for user: ${userId}`
    );
  }
}

async function migrateStaff(
  userId: string,
  orgId: Types.ObjectId,
  locationId: Types.ObjectId
): Promise<void> {
  const staffRecords = await Staff.find({
    userId: userId,
    orgId: { $exists: false },
  });

  if (staffRecords.length === 0) {
    log(`No Staff to migrate for user: ${userId}`);
    return;
  }

  if (!DRY_RUN) {
    for (const staff of staffRecords) {
      await Staff.updateOne(
        { _id: staff._id },
        {
          $set: { orgId, locationId },
          $unset: { userId: 1 },
        }
      );
      stats.staffUpdated++;
    }
    log(`Migrated ${staffRecords.length} Staff for user: ${userId}`);
  } else {
    log(
      `[DRY RUN] Would migrate ${staffRecords.length} Staff for user: ${userId}`
    );
  }
}

async function migrateSchedules(
  userId: string,
  orgId: Types.ObjectId,
  locationId: Types.ObjectId
): Promise<void> {
  const schedules = await Schedule.find({
    userId: userId,
    orgId: { $exists: false },
  });

  if (schedules.length === 0) {
    log(`No Schedules to migrate for user: ${userId}`);
    return;
  }

  if (!DRY_RUN) {
    for (const schedule of schedules) {
      await Schedule.updateOne(
        { _id: schedule._id },
        {
          $set: { orgId, locationId },
          $unset: { userId: 1 },
        }
      );
      stats.schedulesUpdated++;
    }
    log(`Migrated ${schedules.length} Schedules for user: ${userId}`);
  } else {
    log(
      `[DRY RUN] Would migrate ${schedules.length} Schedules for user: ${userId}`
    );
  }
}

async function migrateShifts(
  userId: string,
  orgId: Types.ObjectId,
  locationId: Types.ObjectId
): Promise<void> {
  const shifts = await Shift.find({
    userId: userId,
    orgId: { $exists: false },
  });

  if (shifts.length === 0) {
    log(`No Shifts to migrate for user: ${userId}`);
    return;
  }

  if (!DRY_RUN) {
    for (const shift of shifts) {
      await Shift.updateOne(
        { _id: shift._id },
        {
          $set: { orgId, locationId },
          $unset: { userId: 1 },
        }
      );
      stats.shiftsUpdated++;
    }
    log(`Migrated ${shifts.length} Shifts for user: ${userId}`);
  } else {
    log(`[DRY RUN] Would migrate ${shifts.length} Shifts for user: ${userId}`);
  }
}

async function migrateUserData(userId: string): Promise<void> {
  log(`\nProcessing user: ${userId}`);

  try {
    // Create org, location, and member
    const { orgId, locationId } = await createOrgAndLocationForUser(userId);

    // Migrate all collections
    await migrateKitchenConfigs(userId, orgId, locationId);
    await migrateStaff(userId, orgId, locationId);
    await migrateSchedules(userId, orgId, locationId);
    await migrateShifts(userId, orgId, locationId);

    logSuccess(`Completed migration for user: ${userId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    logError(`Failed to migrate user ${userId}: ${message}`);
    stats.errors.push(`User ${userId}: ${message}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  MULTI-LOCATION MIGRATION SCRIPT");
  console.log("═".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠ DRY RUN MODE - No changes will be made");
    console.log('  Set DRY_RUN=false to run the actual migration\n');
  } else {
    console.log("\n⚠ LIVE MODE - Changes will be made to the database");
    console.log("  Make sure you have a backup!\n");
  }

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

    // Find all unique userIds
    const userIds = await findUniqueUserIds();

    if (userIds.length === 0) {
      logWarning("No existing data found to migrate");
      console.log("\n" + "═".repeat(60));
      console.log("  MIGRATION COMPLETE - No data to migrate");
      console.log("═".repeat(60));
      return;
    }

    // Migrate each user
    logStep(`Migrating ${userIds.length} users`);
    for (const userId of userIds) {
      await migrateUserData(userId);
    }

    // Print summary
    console.log("\n" + "═".repeat(60));
    if (stats.errors.length === 0) {
      console.log("  ✓ MIGRATION COMPLETED SUCCESSFULLY");
    } else {
      console.log("  ⚠ MIGRATION COMPLETED WITH ERRORS");
    }
    console.log("═".repeat(60));

    console.log("\nMigration Summary:");
    console.log(`  - Organizations Created: ${stats.orgsCreated}`);
    console.log(`  - Locations Created: ${stats.locationsCreated}`);
    console.log(`  - Members Created: ${stats.membersCreated}`);
    console.log(`  - KitchenConfigs Updated: ${stats.kitchenConfigsUpdated}`);
    console.log(`  - Staff Updated: ${stats.staffUpdated}`);
    console.log(`  - Schedules Updated: ${stats.schedulesUpdated}`);
    console.log(`  - Shifts Updated: ${stats.shiftsUpdated}`);

    if (stats.errors.length > 0) {
      console.log("\nErrors:");
      stats.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    console.log("\n" + "═".repeat(60));
    console.log("  POST-MIGRATION STEPS (Manual):");
    console.log("═".repeat(60));
    console.log(`
1. Verify data integrity:
   - Check that all documents have orgId and locationId
   - Check that userId field has been removed

2. Update database indexes (in MongoDB shell/compass):
   // Drop old indexes
   db.kitchenconfigs.dropIndex({ userId: 1 });
   db.staff.dropIndex({ userId: 1, email: 1 });
   db.schedules.dropIndex({ userId: 1, weekStartDate: 1 });
   
   // Create new indexes (these should be created automatically by Mongoose)
   db.kitchenconfigs.createIndex({ orgId: 1, locationId: 1 }, { unique: true });
   db.staff.createIndex({ orgId: 1, locationId: 1, email: 1 }, { unique: true });
   db.schedules.createIndex({ orgId: 1, locationId: 1, weekStartDate: 1 }, { unique: true });

3. Test the application to ensure everything works correctly
`);
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
