/**
 * Migration: Update LaborRequirement Unique Index
 *
 * Drops the old 5-field unique index { orgId, locationId, dayOfWeek, station, startTime }
 * and creates the new 6-field unique index { orgId, locationId, dayOfWeek, station, startTime, endTime }.
 *
 * This allows two shift slots on the same station/day to share a startTime as long as
 * their endTimes differ. Identical time windows are still blocked.
 *
 * Uses Mongoose's syncIndexes() which compares the schema's declared indexes against
 * what exists in MongoDB, drops any that are no longer declared, and creates any that
 * are missing.
 *
 * Usage:
 *   npx tsx scripts/migrate-labor-index.ts
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import LaborRequirement from "../src/server/models/LaborRequirement";

async function main() {
  console.log("=".repeat(60));
  console.log(" MIGRATION: LaborRequirement Unique Index Update");
  console.log("=".repeat(60));
  console.log();

  await dbConnect();

  try {
    // 1. Show current indexes before migration
    console.log("Current indexes on laborrequirements collection:");
    const indexesBefore = await LaborRequirement.collection.indexes();
    for (const idx of indexesBefore) {
      const uniqueLabel = idx.unique ? " (UNIQUE)" : "";
      console.log(`  - ${JSON.stringify(idx.key)}${uniqueLabel}`);
    }
    console.log();

    // 2. Run syncIndexes to drop old index and create new one
    console.log("Running syncIndexes()...");
    const dropped = await LaborRequirement.syncIndexes();

    if (dropped.length > 0) {
      console.log(`  Dropped indexes: ${dropped.join(", ")}`);
    } else {
      console.log("  No indexes needed to be dropped.");
    }
    console.log();

    // 3. Show indexes after migration
    console.log("Indexes after migration:");
    const indexesAfter = await LaborRequirement.collection.indexes();
    for (const idx of indexesAfter) {
      const uniqueLabel = idx.unique ? " (UNIQUE)" : "";
      console.log(`  - ${JSON.stringify(idx.key)}${uniqueLabel}`);
    }
    console.log();

    // 4. Verify the new unique index exists
    const hasNewIndex = indexesAfter.some(
      (idx) =>
        idx.unique === true &&
        idx.key.orgId === 1 &&
        idx.key.locationId === 1 &&
        idx.key.dayOfWeek === 1 &&
        idx.key.station === 1 &&
        idx.key.startTime === 1 &&
        idx.key.endTime === 1
    );

    if (hasNewIndex) {
      console.log("Migration successful: New 6-field unique index is in place.");
    } else {
      console.error(
        "WARNING: Expected 6-field unique index not found. Please verify manually."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "\nMigration failed:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\nDatabase connection closed.");
  }
}

main();
