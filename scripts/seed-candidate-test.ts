/**
 * Candidate Service Test Data Seed Script
 *
 * Populates the database with realistic test data for verifying the
 * CandidateService (Sprint 3.5 Hard Filter Layer).
 *
 * Data is created via the service layer (same code path as the UI)
 * with orgId + locationId multi-tenancy scoping per ARCHITECTURE.md.
 *
 * Usage:
 *   npm run seed:candidate-test          # Seed the database
 *   npm run cleanup:candidate-test       # Remove seeded data
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
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
import { StaffAvailabilityService } from "../src/server/services/staff-availability.service";
import { TimeOffRequestService } from "../src/server/services/time-off-request.service";
import { ScheduleService } from "../src/server/services/schedule.service";
import { ShiftService } from "../src/server/services/shift.service";
import { LaborRequirementService } from "../src/server/services/labor-requirement.service";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const TEST_USER_ID = "user_test_candidate_2026";

// Test week: Monday, February 16, 2026
const TEST_WEEK_START = new Date(2026, 1, 16, 0, 0, 0, 0);

const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "CandidateTest Kitchen",
  stations: ["Grill", "Prep", "Assembly", "Dish"],
  roles: ["Cook", "Lead Cook", "Manager"],
  managerRoles: ["Manager"],
  operatingHours: {
    monday: { isOpen: true, open: "06:00", close: "22:00" },
    tuesday: { isOpen: true, open: "06:00", close: "22:00" },
    wednesday: { isOpen: true, open: "06:00", close: "22:00" },
    thursday: { isOpen: true, open: "06:00", close: "22:00" },
    friday: { isOpen: true, open: "06:00", close: "22:00" },
    saturday: { isOpen: true, open: "06:00", close: "22:00" },
    sunday: { isOpen: false, open: "", close: "" },
  },
  minTimeOffAdvanceDays: 0, // Allow immediate time-off for testing
  aiSettings: {
    monthlyGenerationLimit: 50,
    subscriptionTier: "free",
  },
};

// ============================================================================
// Staff Definitions
// ============================================================================

const STAFF_DEFINITIONS = [
  {
    name: "Alice Chen",
    email: "alice.chen@candidatetest.com",
    phone: "5550010001",
    roles: ["Lead Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Prep", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 22,
  },
  {
    name: "Bob Martinez",
    email: "bob.martinez@candidatetest.com",
    phone: "5550010002",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Charlie Park",
    email: "charlie.park@candidatetest.com",
    phone: "5550010003",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 19,
  },
  {
    name: "Diana Lee",
    email: "diana.lee@candidatetest.com",
    phone: "5550010004",
    roles: ["Cook"],
    skills: [
      { station: "Prep", proficiency: 5 },
      { station: "Assembly", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Eve Santos",
    email: "eve.santos@candidatetest.com",
    phone: "5550010005",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 2 },
      { station: "Prep", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 32,
    minHoursPerWeek: 10,
    preferredStations: [] as string[],
    certifications: [],
    hourlyRate: 16,
  },
  {
    name: "Frank Wilson",
    email: "frank.wilson@candidatetest.com",
    phone: "5550010006",
    roles: ["Lead Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 21,
  },
  {
    name: "Grace Kim",
    email: "grace.kim@candidatetest.com",
    phone: "5550010007",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 2 },
    ],
    isActive: false, // INACTIVE -- tests isActive filter
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 17,
  },
  {
    name: "Hank Johnson",
    email: "hank.johnson@candidatetest.com",
    phone: "5550010008",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: [] as string[],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Ivy Thompson",
    email: "ivy.thompson@candidatetest.com",
    phone: "5550010009",
    roles: ["Lead Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill", "Assembly"],
    certifications: [],
    hourlyRate: 22,
  },
  {
    name: "Jack Rivera",
    email: "jack.rivera@candidatetest.com",
    phone: "5550010010",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Dish", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Dish"],
    certifications: [],
    hourlyRate: 17,
  },
];

// ============================================================================
// Availability Definitions (dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat)
// ============================================================================

interface AvailEntry {
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: "preferred" | "available" | "unavailable";
}

function fullDayAvail(
  days: number[],
  preference: "preferred" | "available",
  from = "06:00",
  to = "22:00"
): AvailEntry[] {
  return days.map((d) => ({
    dayOfWeek: d,
    availableFrom: from,
    availableTo: to,
    preference,
  }));
}

const AVAILABILITY_BY_STAFF: Record<string, AvailEntry[]> = {
  "Alice Chen": fullDayAvail([1, 2, 3, 4, 5, 6], "preferred"),
  "Bob Martinez": fullDayAvail([1, 2, 3, 4, 5], "available", "09:00", "17:00"),
  "Charlie Park": fullDayAvail([1, 2, 3, 4, 5], "preferred"),
  "Diana Lee": fullDayAvail([1, 2, 3, 4, 5, 6], "preferred"),
  "Eve Santos": fullDayAvail([1, 2, 3, 4, 5], "available", "06:00", "12:00"),
  "Frank Wilson": fullDayAvail([1, 2, 3, 4, 5, 6], "available"),
  "Grace Kim": fullDayAvail([1, 2, 3, 4, 5], "preferred"),
  // Hank: NO Monday availability. Tue-Sat only.
  "Hank Johnson": fullDayAvail([2, 3, 4, 5, 6], "available"),
  "Ivy Thompson": fullDayAvail([1, 2, 3, 4, 5, 6], "preferred"),
  "Jack Rivera": fullDayAvail([1, 2, 3, 4, 5, 6], "available"),
};

// ============================================================================
// Helpers
// ============================================================================

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n[STEP] ${step}`);
}

function logSuccess(message: string): void {
  console.log(`  ✓ ${message}`);
}

function logError(message: string): void {
  console.error(`  ✗ ERROR: ${message}`);
}

/** Create a Date for a specific day in the test week */
function testDay(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(TEST_WEEK_START);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ============================================================================
// Seed Function
// ============================================================================

export async function seedCandidateTestData(): Promise<{
  orgId: string;
  locationId: string;
  staffIds: Map<string, string>;
  scheduleId: string;
}> {
  // Drop legacy indexes that may exist in the database from pre-multi-location era
  try {
    const db = mongoose.connection.db;
    if (db) {
      const collections = await db
        .listCollections({ name: "kitchenconfigs" })
        .toArray();
      if (collections.length > 0) {
        const indexes = await db
          .collection("kitchenconfigs")
          .indexes();
        const legacyIdx = indexes.find(
          (idx: { name?: string }) => idx.name === "userId_1"
        );
        if (legacyIdx) {
          await db.collection("kitchenconfigs").dropIndex("userId_1");
          log("Dropped legacy userId_1 index from kitchenconfigs");
        }
      }
    }
  } catch {
    // Ignore -- index may not exist
  }

  logStep("Creating Organization and Location");

  // Clean up any previous run
  const existingOrg = await OrganizationService.getByOwnerId(TEST_USER_ID);
  if (existingOrg) {
    log("Found existing test data -- cleaning up first...");
    await cleanupCandidateTestData();
  }

  const org = await OrganizationService.create(TEST_USER_ID, {
    name: "CandidateTest Kitchen Co",
  });
  const orgId = org.id;
  log(`Created organization: "${org.name}" (ID: ${orgId})`);

  const location = await LocationService.create(orgId, {
    name: "CandidateTest Location",
    timezone: "America/New_York",
  });
  const locationId = location.id;
  log(`Created location: "${location.name}" (ID: ${locationId})`);

  await OrganizationMemberService.create({
    orgId,
    locationId: null,
    clerkUserId: TEST_USER_ID,
    role: "owner",
  });
  log(`Created owner membership for ${TEST_USER_ID}`);

  // Kitchen Config
  logStep("Creating Kitchen Config");
  const config = await KitchenConfigService.upsert(
    orgId,
    locationId,
    TEST_KITCHEN_CONFIG
  );
  logSuccess(
    `Kitchen config: ${config.stations.length} stations, ${config.roles.length} roles`
  );

  // Staff
  logStep("Creating Staff (10 members)");
  const staffIds = new Map<string, string>();
  for (const staffDef of STAFF_DEFINITIONS) {
    const { isActive, ...createData } = staffDef;
    const staff = await StaffService.create(orgId, locationId, createData);

    // If inactive, update after creation (create defaults to active)
    if (!isActive) {
      await StaffService.update(orgId, locationId, staff.id, {
        isActive: false,
      });
      log(
        `  ${staff.name} [INACTIVE] -- skills: ${staff.skills.map((s) => `${s.station}(${s.proficiency})`).join(", ")}`
      );
    } else {
      log(
        `  ${staff.name} -- skills: ${staff.skills.map((s) => `${s.station}(${s.proficiency})`).join(", ")}, maxH: ${staffDef.maxHoursPerWeek}`
      );
    }
    staffIds.set(staff.name, staff.id);
  }
  logSuccess(`Created ${staffIds.size} staff members`);

  // Availability
  logStep("Creating Staff Availability");
  for (const [staffName, entries] of Object.entries(AVAILABILITY_BY_STAFF)) {
    const staffId = staffIds.get(staffName);
    if (!staffId) {
      logError(`Staff not found for availability: ${staffName}`);
      continue;
    }
    await StaffAvailabilityService.bulkUpsert(
      orgId,
      locationId,
      staffId,
      entries
    );
    log(
      `  ${staffName}: ${entries.length} day(s) -- ${entries[0]?.preference} ${entries[0]?.availableFrom}-${entries[0]?.availableTo}`
    );
  }
  logSuccess("Availability set for all staff");

  // Time-Off Requests
  logStep("Creating Time-Off Requests");

  // Charlie: approved time off Feb 16-17
  const charlieId = staffIds.get("Charlie Park")!;
  const charlieTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: charlieId,
    startDate: new Date(2026, 1, 16),
    endDate: new Date(2026, 1, 17),
    reason: "Family vacation",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    charlieTimeOff.id,
    "approved",
    TEST_USER_ID,
    "Approved -- enjoy!"
  );
  log(`  Charlie Park: Feb 16-17 APPROVED`);

  // Ivy: pending time off Feb 16 (should NOT exclude her)
  const ivyId = staffIds.get("Ivy Thompson")!;
  await TimeOffRequestService.create(orgId, locationId, {
    staffId: ivyId,
    startDate: new Date(2026, 1, 16),
    endDate: new Date(2026, 1, 16),
    reason: "Doctor appointment",
  });
  log(`  Ivy Thompson: Feb 16 PENDING (should NOT filter her out)`);

  // Eve: approved time off Feb 18 (different day)
  const eveId = staffIds.get("Eve Santos")!;
  const eveTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: eveId,
    startDate: new Date(2026, 1, 18),
    endDate: new Date(2026, 1, 18),
    reason: "Personal day",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    eveTimeOff.id,
    "approved",
    TEST_USER_ID
  );
  log(`  Eve Santos: Feb 18 APPROVED (different day -- no Monday impact)`);
  logSuccess("Time-off requests created");

  // Schedule + Shifts
  logStep("Creating Schedule and Shifts");
  const schedule = await ScheduleService.getOrCreateForWeek(
    orgId,
    locationId,
    TEST_WEEK_START
  );
  const scheduleId = schedule.id;
  log(`Created schedule for week of Feb 16, 2026 (ID: ${scheduleId})`);

  // Shift definitions: [staffName, dayOffset, startHour, startMin, endHour, endMin, station, purpose]
  const shiftDefs: Array<
    [string, number, number, number, number, number, string, string]
  > = [
    ["Bob Martinez", 0, 9, 0, 13, 0, "Grill", "Overlapping shift test"],
    ["Frank Wilson", 0, 6, 0, 14, 0, "Prep", "Overlap + weekly hours (8h)"],
    ["Frank Wilson", 1, 6, 0, 14, 0, "Grill", "Weekly hours (8h)"],
    ["Frank Wilson", 2, 6, 0, 14, 0, "Prep", "Weekly hours (8h)"],
    ["Frank Wilson", 3, 6, 0, 14, 0, "Grill", "Weekly hours (8h)"],
    ["Frank Wilson", 4, 6, 0, 9, 30, "Prep", "Weekly hours (3.5h). Total=35.5h"],
    ["Jack Rivera", 0, 6, 0, 9, 0, "Dish", "Adjacent shift (ends at slot start)"],
    ["Alice Chen", 1, 9, 0, 17, 0, "Grill", "Weekly hours (8h)"],
    ["Alice Chen", 2, 9, 0, 17, 0, "Grill", "Weekly hours (8h). Total=16h"],
  ];

  for (const [
    staffName,
    dayOffset,
    startH,
    startM,
    endH,
    endM,
    station,
    purpose,
  ] of shiftDefs) {
    const sId = staffIds.get(staffName)!;
    await ShiftService.create({
      orgId,
      locationId,
      scheduleId,
      staffId: sId,
      start: testDay(dayOffset, startH, startM),
      end: testDay(dayOffset, endH, endM),
      station,
    });
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    log(
      `  ${staffName} ${dayNames[dayOffset]} ${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}-${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")} ${station} -- ${purpose}`
    );
  }
  logSuccess(`Created ${shiftDefs.length} shifts`);

  // Labor Requirements (Monday, dayOfWeek=1)
  logStep("Creating Labor Requirements (Monday)");
  const laborDefs = [
    {
      dayOfWeek: 1,
      station: "Grill",
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 2,
      preferredStaff: 3,
      priority: "normal" as const,
    },
    {
      dayOfWeek: 1,
      station: "Prep",
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 1,
      preferredStaff: 2,
      priority: "high" as const,
    },
    {
      dayOfWeek: 1,
      station: "Grill",
      startTime: "17:00",
      endTime: "22:00",
      minStaff: 1,
      preferredStaff: 2,
      priority: "normal" as const,
    },
    {
      dayOfWeek: 1,
      station: "Dish",
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 3,
      preferredStaff: 4,
      priority: "normal" as const,
    },
  ];

  for (const req of laborDefs) {
    await LaborRequirementService.create(orgId, locationId, req);
    log(
      `  ${req.station} ${req.startTime}-${req.endTime}: min=${req.minStaff}, pref=${req.preferredStaff}, priority=${req.priority}`
    );
  }
  logSuccess(`Created ${laborDefs.length} labor requirements`);

  return { orgId, locationId, staffIds, scheduleId };
}

// ============================================================================
// Cleanup Function
// ============================================================================

export async function cleanupCandidateTestData(): Promise<void> {
  logStep("Cleanup: Removing candidate test data");

  const existingOrg = await OrganizationService.getByOwnerId(TEST_USER_ID);
  if (!existingOrg) {
    log("No existing test data found");
    return;
  }

  log(`Found org: ${existingOrg.name} (ID: ${existingOrg.id})`);
  const locations = await LocationService.listByOrgId(existingOrg.id);

  for (const location of locations) {
    const shiftsDeleted = await ShiftService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Shifts deleted: ${shiftsDeleted}`);

    const schedulesDeleted = await ScheduleService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Schedules deleted: ${schedulesDeleted}`);

    const laborDeleted = await LaborRequirementService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Labor requirements deleted: ${laborDeleted}`);

    const timeOffDeleted = await TimeOffRequestService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Time-off requests deleted: ${timeOffDeleted}`);

    const availDeleted = await StaffAvailabilityService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Availability entries deleted: ${availDeleted}`);

    const staffDeleted = await StaffService.deleteAllByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Staff deleted: ${staffDeleted}`);

    const configDeleted = await KitchenConfigService.deleteByLocation(
      existingOrg.id,
      location.id
    );
    log(`  Kitchen config deleted: ${configDeleted}`);

    await LocationService.delete(existingOrg.id, location.id);
    log(`  Location deleted: ${location.name}`);
  }

  const membersDeleted = await OrganizationMemberService.deleteAllByOrgId(
    existingOrg.id
  );
  log(`  Members deleted: ${membersDeleted}`);

  await OrganizationService.delete(existingOrg.id);
  log(`  Organization deleted: ${existingOrg.name}`);
  logSuccess("Cleanup complete");
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const isCleanup = process.argv.includes("--cleanup");

  console.log("═".repeat(60));
  if (isCleanup) {
    console.log("  CANDIDATE TEST DATA -- CLEANUP");
  } else {
    console.log("  CANDIDATE TEST DATA -- SEED");
  }
  console.log("═".repeat(60));
  console.log(`\nTest User ID: ${TEST_USER_ID}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);

  if (!process.env.MONGODB_URI) {
    console.error("\n✗ MONGODB_URI environment variable is not set");
    process.exit(1);
  }

  try {
    await dbConnect();
    logSuccess("Database connected");

    if (isCleanup) {
      await cleanupCandidateTestData();
    } else {
      const result = await seedCandidateTestData();
      console.log("\n" + "═".repeat(60));
      console.log("  SEED COMPLETE");
      console.log("═".repeat(60));
      console.log(`\n  Org ID:      ${result.orgId}`);
      console.log(`  Location ID: ${result.locationId}`);
      console.log(`  Schedule ID: ${result.scheduleId}`);
      console.log(`  Staff IDs:`);
      for (const [name, id] of result.staffIds) {
        console.log(`    ${name}: ${id}`);
      }
    }
  } catch (error) {
    console.error(
      "\n✗ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Only run main() when this file is executed directly (not when imported)
const isDirectRun =
  process.argv[1]?.includes("seed-candidate-test") ?? false;
if (isDirectRun) {
  main();
}
