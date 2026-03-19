/**
 * Favorable Schedule Generation Test Data Seed Script
 *
 * Populates the database with a favorable dataset ("The Golden Fork")
 * designed so the schedule generator can produce a near-perfect schedule:
 * zero unfilled slots, minimal overtime risk, all staff meeting minimum
 * hours, and high preference matching.
 *
 * Compared to the stress-test Copper Ladle dataset, this dataset has:
 * - Fewer stations (4 vs 6) with balanced slot distribution
 * - Broad skill coverage (every staff member covers 3-4 stations)
 * - Generous availability (6-7 days, wide time windows)
 * - Staff preferences aligned with slot demand
 * - Achievable min/max hours (16 staff, ~53 slots, ~400h)
 * - No approved time-off requests
 *
 * Data is created via the Service Layer (same code path as the UI)
 * with orgId + locationId multi-tenancy scoping per ARCHITECTURE.md.
 *
 * Usage:
 *   npm run seed:favorable       # Seed the database
 *   npm run cleanup:favorable    # Remove seeded data
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
 *   - SEED_CLERK_USER_ID2: Clerk user ID to own the test data
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import { OrganizationService } from "../src/server/services/organization.service";
import { LocationService } from "../src/server/services/location.service";
import { OrganizationMemberService } from "../src/server/services/organization-member.service";
import { KitchenConfigService } from "../src/server/services/kitchen-config.service";
import { StaffService } from "../src/server/services/staff.service";
import { StaffAvailabilityService } from "../src/server/services/staff-availability.service";
import { ScheduleService } from "../src/server/services/schedule.service";
import { ShiftService } from "../src/server/services/shift.service";
import { LaborRequirementService } from "../src/server/services/labor-requirement.service";
import { AIUsageService } from "../src/server/services/ai-usage.service";
import { TimeOffRequestService } from "../src/server/services/time-off-request.service";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import { startOfWeek, addWeeks } from "date-fns";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const ORG_NAME = "The Golden Fork - Favorable Test";

function getTargetTestWeek(): Date {
  const now = new Date();
  let monday = startOfWeek(now, { weekStartsOn: 1 });
  if (now >= monday) {
    monday = addWeeks(monday, 1);
  }
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const TEST_WEEK_START = getTargetTestWeek();

// ============================================================================
// Kitchen Configuration (4 stations -- simpler graph than Copper Ladle's 6)
// ============================================================================

const KITCHEN_CONFIG: KitchenConfigInput = {
  name: "The Golden Fork",
  stations: ["Grill", "Saute", "Prep", "Expo"],
  roles: ["Head Chef", "Line Cook", "Prep Cook"],
  managerRoles: ["Head Chef"],
  operatingHours: {
    monday:    { isOpen: true,  open: "08:00", close: "22:00" },
    tuesday:   { isOpen: true,  open: "08:00", close: "22:00" },
    wednesday: { isOpen: true,  open: "08:00", close: "22:00" },
    thursday:  { isOpen: true,  open: "08:00", close: "22:00" },
    friday:    { isOpen: true,  open: "08:00", close: "22:00" },
    saturday:  { isOpen: true,  open: "09:00", close: "22:00" },
    sunday:    { isOpen: true,  open: "10:00", close: "20:00" },
  },
  minTimeOffAdvanceDays: 0,
  aiSettings: {
    monthlyGenerationLimit: 100,
    subscriptionTier: "pro",
  },
};

// ============================================================================
// Staff Definitions (16 active, 0 inactive)
//
// Design rationale:
// - Every staff member covers 3-4 stations with high proficiency at preferred
// - Preferred stations align with station slot demand
// - minHoursPerWeek 15-25h is easily reachable with 3-4 shifts of 7-8h
// - maxHoursPerWeek 35-40h gives the solver plenty of room
// - All hourly rates > 0 (no readiness warnings)
//
// Balance analysis (16 active staff):
//   ~53 person-shifts / week  (~400 person-hours)
//   Staff min-hours total: ~304h  →  well under slot hours
//   Staff max-hours total: ~600h  →  no need to overload anyone
//   Average per employee: ~3.3 shifts/week, ~25 hours/week
// ============================================================================

interface StaffDef {
  name: string;
  email: string;
  phone: string;
  roles: string[];
  skills: Array<{ station: string; proficiency: number }>;
  isActive: boolean;
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  preferredStations: string[];
  certifications: string[];
  hourlyRate: number;
}

const STAFF_DEFINITIONS: StaffDef[] = [
  // ── Grill Specialists (4) ──────────────────────────────────────
  {
    name: "Marco Rossi",
    email: "marco.rossi@goldenfork.test",
    phone: "5552000001",
    roles: ["Head Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 25,
    preferredStations: ["Grill"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 32,
  },
  {
    name: "Elena Volkov",
    email: "elena.volkov@goldenfork.test",
    phone: "5552000002",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 24,
  },
  {
    name: "James Carter",
    email: "james.carter@goldenfork.test",
    phone: "5552000003",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Saute", proficiency: 4 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 22,
  },
  {
    name: "Yuki Tanaka",
    email: "yuki.tanaka@goldenfork.test",
    phone: "5552000004",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 21,
  },

  // ── Saute Specialists (3) ──────────────────────────────────────
  {
    name: "Sofia Reyes",
    email: "sofia.reyes@goldenfork.test",
    phone: "5552000005",
    roles: ["Head Chef"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 25,
    preferredStations: ["Saute"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 30,
  },
  {
    name: "Liam O'Connor",
    email: "liam.oconnor@goldenfork.test",
    phone: "5552000006",
    roles: ["Line Cook"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Saute"],
    certifications: [],
    hourlyRate: 23,
  },
  {
    name: "Aisha Patel",
    email: "aisha.patel@goldenfork.test",
    phone: "5552000007",
    roles: ["Line Cook"],
    skills: [
      { station: "Saute", proficiency: 4 },
      { station: "Grill", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Saute"],
    certifications: [],
    hourlyRate: 20,
  },

  // ── Prep Specialists (4) ───────────────────────────────────────
  {
    name: "Carlos Diaz",
    email: "carlos.diaz@goldenfork.test",
    phone: "5552000008",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 5 },
      { station: "Saute", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 19,
  },
  {
    name: "Hannah Berg",
    email: "hannah.berg@goldenfork.test",
    phone: "5552000009",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 5 },
      { station: "Saute", proficiency: 2 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Omar Farouk",
    email: "omar.farouk@goldenfork.test",
    phone: "5552000010",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
      { station: "Grill", proficiency: 2 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 17,
  },
  {
    name: "Mia Chen",
    email: "mia.chen@goldenfork.test",
    phone: "5552000011",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
      { station: "Saute", proficiency: 3 },
      { station: "Grill", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 17,
  },

  // ── Expo Specialists (3) ───────────────────────────────────────
  {
    name: "Nadia Kowalski",
    email: "nadia.kowalski@goldenfork.test",
    phone: "5552000012",
    roles: ["Line Cook"],
    skills: [
      { station: "Expo", proficiency: 5 },
      { station: "Prep", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Expo"],
    certifications: [],
    hourlyRate: 21,
  },
  {
    name: "Derek Washington",
    email: "derek.washington@goldenfork.test",
    phone: "5552000013",
    roles: ["Line Cook"],
    skills: [
      { station: "Expo", proficiency: 4 },
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 38,
    minHoursPerWeek: 20,
    preferredStations: ["Expo"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Ava Mitchell",
    email: "ava.mitchell@goldenfork.test",
    phone: "5552000014",
    roles: ["Line Cook"],
    skills: [
      { station: "Expo", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Grill", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Expo"],
    certifications: [],
    hourlyRate: 19,
  },

  // ── Flex Staff (2) ─────────────────────────────────────────────
  {
    name: "Leo Nguyen",
    email: "leo.nguyen@goldenfork.test",
    phone: "5552000015",
    roles: ["Line Cook", "Prep Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: [],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Ruby Kim",
    email: "ruby.kim@goldenfork.test",
    phone: "5552000016",
    roles: ["Line Cook", "Prep Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: [],
    certifications: [],
    hourlyRate: 20,
  },
];

// ============================================================================
// Availability Definitions (dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat)
//
// All 16 staff have generous availability: 6-7 days/week with wide windows.
// "Preferred" days are spread across the week to match slot demand and give
// the solver strong time-preference signals it can satisfy.
// ============================================================================

interface AvailEntry {
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: "preferred" | "available" | "unavailable";
}

function avail(
  dayOfWeek: number,
  preference: "preferred" | "available" | "unavailable",
  from: string | null = null,
  to: string | null = null
): AvailEntry {
  return { dayOfWeek, availableFrom: from, availableTo: to, preference };
}

function fullWeek(
  pref: "preferred" | "available",
  from: string,
  to: string,
  preferredDays: number[] = []
): AvailEntry[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) =>
    avail(d, preferredDays.includes(d) ? "preferred" : pref, from, to)
  );
}

const AVAILABILITY_BY_STAFF: Record<string, AvailEntry[]> = {
  // Grill specialists -- available all 7 days, preferred on weekdays
  "Marco Rossi":   fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Elena Volkov":  fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "James Carter":  fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Yuki Tanaka":   fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Saute specialists -- available all 7 days
  "Sofia Reyes":   fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Liam O'Connor": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Aisha Patel":   fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Prep specialists -- available all 7 days, preferred on high-prep days
  "Carlos Diaz":   fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Hannah Berg":   fullWeek("available", "07:00", "23:00", [1, 2, 4, 5]),
  "Omar Farouk":   fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Mia Chen":      fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Expo specialists -- available all 7 days
  "Nadia Kowalski":    fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Derek Washington":  fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Ava Mitchell":      fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Flex staff -- available all 7 days, preferred on busiest days
  "Leo Nguyen":  fullWeek("available", "07:00", "23:00", [1, 2, 3, 5, 6]),
  "Ruby Kim":    fullWeek("available", "07:00", "23:00", [2, 3, 4, 5, 0]),
};

// ============================================================================
// Shift Slot Definitions (Labor Requirements)
//
// 4 stations, ~53 slots, ~400 person-hours.
// All preferredStaff=1 except Friday/Saturday dinner peaks.
// Shifts are 6-8h to keep hours manageable.
// dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
//
// Balance analysis (16 active staff):
//   53 person-shifts / week  (~400 person-hours)
//   Staff min-hours total: ~304h  →  well under slot hours
//   Staff max-hours total: ~604h  →  no one needs to be overloaded
//   Average per employee: ~3.3 shifts/week, ~25 hours/week
// ============================================================================

interface ShiftSlotDef {
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  priority: "critical" | "high" | "normal" | "low";
}

function buildShiftSlots(): ShiftSlotDef[] {
  const slots: ShiftSlotDef[] = [];

  const monThu = [1, 2, 3, 4];
  const monFri = [1, 2, 3, 4, 5];

  // ── GRILL ──────────────────────────────────────────────────────
  // Mon-Thu: AM + PM
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "08:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: AM + PM
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "08:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sat: AM + PM
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sun: single shift
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── SAUTE ──────────────────────────────────────────────────────
  // Mon-Thu: AM + PM
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "09:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: AM + PM
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "09:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sat: AM + PM
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sun: single shift
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── PREP ───────────────────────────────────────────────────────
  // Mon-Fri: early + mid
  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "08:00", endTime: "14:00", minStaff: 1, preferredStaff: 1, priority: "high" });
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "10:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  // Sat: single shift
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  // Sun: single shift
  slots.push({ dayOfWeek: 0, station: "Prep", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── EXPO ───────────────────────────────────────────────────────
  // Mon-Thu: lunch + dinner
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: lunch + dinner
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sat: lunch + dinner
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sun: single shift
  slots.push({ dayOfWeek: 0, station: "Expo", startTime: "11:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  return slots;
}

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

// ============================================================================
// Legacy Index Cleanup
// ============================================================================

async function dropLegacyIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  const legacyIndexes: Array<{ collection: string; indexName: string }> = [
    { collection: "schedules", indexName: "userId_1_weekStartDate_1" },
    { collection: "kitchenconfigs", indexName: "userId_1" },
    { collection: "staff", indexName: "userId_1_email_1" },
  ];

  for (const { collection, indexName } of legacyIndexes) {
    try {
      const collections = await db.listCollections({ name: collection }).toArray();
      if (collections.length === 0) continue;

      const indexes = await db.collection(collection).indexes();
      const legacy = indexes.find((idx: { name?: string }) => idx.name === indexName);
      if (legacy) {
        await db.collection(collection).dropIndex(indexName);
        logSuccess(`Dropped legacy index "${indexName}" from ${collection}`);
      }
    } catch {
      // Ignore -- index may not exist
    }
  }
}

// ============================================================================
// Seed Function
// ============================================================================

async function seed(clerkUserId: string): Promise<void> {
  logStep("Dropping legacy indexes (if any)");
  await dropLegacyIndexes();

  logStep("Cleaning up existing data for this Clerk user");
  await cleanupAllOrgsForUser(clerkUserId);

  logStep("Creating Organization and Location");

  const org = await OrganizationService.create(clerkUserId, {
    name: ORG_NAME,
  });
  const orgId = org.id;
  log(`Created organization: "${org.name}" (ID: ${orgId})`);

  const location = await LocationService.create(orgId, {
    name: "Main Kitchen",
    timezone: "America/New_York",
  });
  const locationId = location.id;
  log(`Created location: "${location.name}" (ID: ${locationId})`);

  await OrganizationMemberService.create({
    orgId,
    locationId: null,
    clerkUserId,
    role: "owner",
  });
  log(`Created owner membership for ${clerkUserId}`);

  // ── Kitchen Config ──────────────────────────────────────────
  logStep("Creating Kitchen Config");
  const config = await KitchenConfigService.upsert(orgId, locationId, KITCHEN_CONFIG);
  logSuccess(
    `"${config.name}" -- ${config.stations.length} stations, ${config.roles.length} roles, AI limit: ${config.aiSettings.monthlyGenerationLimit}`
  );

  // ── Staff ───────────────────────────────────────────────────
  logStep(`Creating Staff (${STAFF_DEFINITIONS.length} members)`);
  const staffIds = new Map<string, string>();
  let activeCount = 0;

  for (const def of STAFF_DEFINITIONS) {
    const { isActive: _isActive, ...createData } = def;
    const staff = await StaffService.create(orgId, locationId, createData);
    activeCount++;
    const skillStr = staff.skills.map((s) => `${s.station}(${s.proficiency})`).join(", ");
    log(
      `  ${staff.name} -- ${def.roles.join(", ")} | ${skillStr} | $${def.hourlyRate}/hr`
    );
    staffIds.set(staff.name, staff.id);
  }
  logSuccess(`Created ${activeCount} active = ${staffIds.size} total`);

  // ── Availability ────────────────────────────────────────────
  logStep("Creating Staff Availability");
  let totalAvailEntries = 0;

  for (const [staffName, entries] of Object.entries(AVAILABILITY_BY_STAFF)) {
    const staffId = staffIds.get(staffName);
    if (!staffId) {
      logError(`Staff not found for availability: ${staffName}`);
      continue;
    }
    await StaffAvailabilityService.bulkUpsert(orgId, locationId, staffId, entries);
    totalAvailEntries += entries.length;

    const availDays = entries.filter((e) => e.preference !== "unavailable").length;
    const unavailDays = entries.filter((e) => e.preference === "unavailable").length;
    log(`  ${staffName}: ${availDays} available, ${unavailDays} unavailable`);
  }
  logSuccess(`Created ${totalAvailEntries} availability entries for ${Object.keys(AVAILABILITY_BY_STAFF).length} staff`);

  // ── Shift Slots (Labor Requirements) ────────────────────────
  logStep("Creating Shift Slots");
  const shiftSlots = buildShiftSlots();

  for (const slot of shiftSlots) {
    await LaborRequirementService.create(orgId, locationId, slot);
  }

  const byStation = new Map<string, number>();
  for (const s of shiftSlots) {
    byStation.set(s.station, (byStation.get(s.station) ?? 0) + 1);
  }
  for (const [station, count] of byStation) {
    log(`  ${station}: ${count} shift slots`);
  }
  logSuccess(`Created ${shiftSlots.length} shift slots`);

  // ── No Time-Off Requests (favorable dataset) ───────────────
  logStep("Time-Off Requests");
  log("None (favorable dataset -- no time-off constraints)");

  // ── Schedule ────────────────────────────────────────────────
  logStep("Creating DRAFT Schedule for Test Week");
  const schedule = await ScheduleService.getOrCreateForWeek(
    orgId, locationId, TEST_WEEK_START
  );
  logSuccess(`Created DRAFT schedule for week of ${TEST_WEEK_START.toDateString()} (ID: ${schedule.id})`);

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  SEED COMPLETE (FAVORABLE DATASET)");
  console.log("═".repeat(60));
  console.log(`\n  Organization:      ${ORG_NAME} (${orgId})`);
  console.log(`  Location:          Main Kitchen (${locationId})`);
  console.log(`  Kitchen Config:    ${config.stations.join(", ")}`);
  console.log(`  Staff:             ${activeCount} active`);
  console.log(`  Availability:      ${totalAvailEntries} entries (all 7 days)`);
  console.log(`  Shift Slots:       ${shiftSlots.length} entries`);
  console.log(`  Time-Off Requests: 0`);
  console.log(`  Schedule:          ${schedule.id} (DRAFT, week of ${TEST_WEEK_START.toDateString()})`);
  console.log(`\n  Test Week: ${TEST_WEEK_START.toDateString()}`);
  console.log(`  Clerk User ID: ${clerkUserId}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Start dev server: npm run dev`);
  console.log(`  2. Log in with the Clerk account for ${clerkUserId}`);
  console.log(`  3. Navigate to Schedule page`);
  console.log(`  4. Select the week of ${TEST_WEEK_START.toDateString()}`);
  console.log(`  5. Click "Generate Schedule" to test AI generation`);
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

async function deleteOrgAndData(orgId: string, orgName: string): Promise<void> {
  const locations = await LocationService.listByOrgId(orgId);

  for (const location of locations) {
    log(`  Cleaning location: ${location.name} (${location.id})`);

    const aiDeleted = await AIUsageService.deleteAllByLocation(orgId, location.id);
    log(`    AI usage logs deleted: ${aiDeleted}`);

    const shiftsDeleted = await ShiftService.deleteAllByLocation(orgId, location.id);
    log(`    Shifts deleted: ${shiftsDeleted}`);

    const schedulesDeleted = await ScheduleService.deleteAllByLocation(orgId, location.id);
    log(`    Schedules deleted: ${schedulesDeleted}`);

    const laborDeleted = await LaborRequirementService.deleteAllByLocation(orgId, location.id);
    log(`    Shift slots deleted: ${laborDeleted}`);

    const timeOffDeleted = await TimeOffRequestService.deleteAllByLocation(orgId, location.id);
    log(`    Time-off requests deleted: ${timeOffDeleted}`);

    const availDeleted = await StaffAvailabilityService.deleteAllByLocation(orgId, location.id);
    log(`    Availability entries deleted: ${availDeleted}`);

    const staffDeleted = await StaffService.deleteAllByLocation(orgId, location.id);
    log(`    Staff deleted: ${staffDeleted}`);

    const configDeleted = await KitchenConfigService.deleteByLocation(orgId, location.id);
    log(`    Kitchen config deleted: ${configDeleted}`);

    await LocationService.delete(orgId, location.id);
    log(`    Location deleted: ${location.name}`);
  }

  const membersDeleted = await OrganizationMemberService.deleteAllByOrgId(orgId);
  log(`  Members deleted: ${membersDeleted}`);

  await OrganizationService.delete(orgId);
  log(`  Organization deleted: ${orgName}`);
}

async function cleanupAllOrgsForUser(clerkUserId: string): Promise<void> {
  const allOrgs = await OrganizationService.listByOwnerId(clerkUserId);

  if (allOrgs.length === 0) {
    log("No existing organizations found for this Clerk user");
    return;
  }

  log(`Found ${allOrgs.length} organization(s) for this Clerk user -- removing all`);

  for (const org of allOrgs) {
    log(`  Removing: "${org.name}" (${org.id})`);
    await deleteOrgAndData(org.id, org.name);
  }

  logSuccess(`Removed ${allOrgs.length} organization(s)`);
}

// ============================================================================
// Cleanup Function (CLI: --cleanup flag)
// ============================================================================

async function cleanup(clerkUserId: string): Promise<void> {
  logStep("Cleanup: Removing all data for this Clerk user");
  await cleanupAllOrgsForUser(clerkUserId);
  logSuccess("Cleanup complete");
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const isCleanup = process.argv.includes("--cleanup");

  console.log("═".repeat(60));
  if (isCleanup) {
    console.log("  FAVORABLE SCHEDULE TEST DATA -- CLEANUP");
  } else {
    console.log("  FAVORABLE SCHEDULE TEST DATA -- SEED");
  }
  console.log("═".repeat(60));

  const clerkUserId = process.env.SEED_CLERK_USER_ID2;
  if (!clerkUserId) {
    console.error("\n✗ SEED_CLERK_USER_ID2 environment variable is not set.");
    console.error("  Add it to .env.local:");
    console.error("  SEED_CLERK_USER_ID2=user_2xxx...");
    process.exit(1);
  }

  console.log(`\nClerk User ID: ${clerkUserId}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);
  if (!isCleanup) {
    console.log(`Test Week: ${TEST_WEEK_START.toDateString()}`);
  }

  if (!process.env.MONGODB_URI) {
    console.error("\n✗ MONGODB_URI environment variable is not set");
    process.exit(1);
  }

  try {
    await dbConnect();
    logSuccess("Database connected");

    if (isCleanup) {
      await cleanup(clerkUserId);
    } else {
      await seed(clerkUserId);
    }
  } catch (error) {
    console.error(
      "\n✗ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
