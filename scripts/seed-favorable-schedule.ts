/**
 * Favorable Schedule Generation Test Data Seed Script ("The Golden Fork")
 *
 * Populates the database with a deliberately easy dataset so the
 * schedule generator can produce a near-perfect schedule: zero
 * unfilled slots, minimal overtime risk, all staff meeting minimum
 * hours, no manager-coverage gaps, and high preference matching.
 *
 * Compared to the stress-test Copper Ladle dataset, this dataset has:
 *   - Fewer stations (4 vs 6) with a balanced slot distribution
 *   - Broad skill coverage (every staff member covers 3-4 stations)
 *   - Generous availability (6-7 days, wide time windows)
 *   - 3 manager-grade staff (Marco, Sofia, Liam) with full-week
 *     availability so the solver's manager-coverage constraint never
 *     trips
 *   - Achievable min/max hours
 *   - No approved time-off requests
 *
 * Each active staff member is mirrored as a Clerk user + an
 * OrganizationMember row so the mobile app can sign them in. See the
 * Copper Ladle script for the full rationale.
 *
 * Two run modes:
 *
 *   npm run seed:favorable          # seed (idempotent)
 *   npm run cleanup:favorable       # tear down org + Clerk users
 *
 * Required env (read from apps/web/.env.local):
 *
 *   - MONGODB_URI            Mongo Atlas connection string
 *   - CLERK_SECRET_KEY       Clerk Backend SDK key
 *   - SEED_CLERK_USER_ID2    Clerk user that owns this seeded org
 *
 * Optional env:
 *
 *   - SEED_STAFF_PASSWORD_FAVORABLE  Password for created staff
 *                                    (default: a fixed value below).
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ENV_PATH = path.resolve(__dirname, "..", "apps", "web", ".env.local");
dotenv.config({ path: WEB_ENV_PATH });

import { dbConnect } from "../apps/web/src/lib/db";
import { OrganizationService } from "../apps/web/src/server/services/organization.service";
import { LocationService } from "../apps/web/src/server/services/location.service";
import { OrganizationMemberService } from "../apps/web/src/server/services/organization-member.service";
import { KitchenConfigService } from "../apps/web/src/server/services/kitchen-config.service";
import { StaffService } from "../apps/web/src/server/services/staff.service";
import { StaffAvailabilityService } from "../apps/web/src/server/services/staff-availability.service";
import { ScheduleService } from "../apps/web/src/server/services/schedule.service";
import { ShiftService } from "../apps/web/src/server/services/shift.service";
import { LaborRequirementService } from "../apps/web/src/server/services/labor-requirement.service";
import { AIUsageService } from "../apps/web/src/server/services/ai-usage.service";
import { TimeOffRequestService } from "../apps/web/src/server/services/time-off-request.service";
import type { KitchenConfigInput } from "../apps/web/src/lib/validations/kitchen-config.schema";
import { startOfWeek, addWeeks } from "date-fns";
import mongoose from "mongoose";
import { createClerkClient } from "@clerk/backend";
import type { ClerkClient, User as ClerkUser } from "@clerk/backend";

// ============================================================================
// Configuration
// ============================================================================

const ORG_NAME = "The Golden Fork - Favorable Test";
const STAFF_EMAIL_DOMAIN = "goldenfork.test";
const STAFF_PASSWORD =
  process.env.SEED_STAFF_PASSWORD_FAVORABLE ?? "GoldenFork!2026Seed";

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
// Kitchen Configuration (4 stations -- simpler graph)
// ============================================================================
//
// `managerRoles` controls which staff count as managers for the
// solver's coverage constraint (see solver/main.py `is_manager`). Three
// staff carry the "Head Chef" role and have 7-day, full-window
// availability so that constraint is always satisfiable.

const KITCHEN_CONFIG: KitchenConfigInput = {
  name: "The Golden Fork",
  stations: ["Grill", "Saute", "Prep", "Expo"],
  roles: [
    "Manager", // Solver-recognised manager role (kept first; see solver/main.py).
    "Head Chef",
    "Line Cook",
    "Prep Cook",
  ],
  managerRoles: ["Manager", "Head Chef"],
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
// Manager roster (3, all "Head Chef"):
//   - Marco Rossi   (Mon-Sun avail 07-23, max 45h)
//   - Sofia Reyes   (Mon-Sun avail 07-23, max 45h)
//   - Liam O'Connor (Mon-Sun avail 07-23, max 45h)
//
// Combined manager max-hours: 135h. Total operating coverage:
// 5*14 + 13 + 10 = 93h. Easily satisfiable.
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
  // ── Managers (3) ──────────────────────────────────────────────
  {
    name: "Marco Rossi",
    email: `marco.rossi@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000001",
    roles: ["Manager", "Head Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 25,
    preferredStations: ["Grill"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 32,
  },
  {
    name: "Sofia Reyes",
    email: `sofia.reyes@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000002",
    roles: ["Manager", "Head Chef"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 25,
    preferredStations: ["Saute"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 30,
  },
  {
    name: "Liam O'Connor",
    email: `liam.oconnor@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000003",
    roles: ["Manager", "Head Chef"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 25,
    preferredStations: ["Saute", "Expo"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 28,
  },

  // ── Line Cooks (5) ────────────────────────────────────────────
  {
    name: "Elena Volkov",
    email: `elena.volkov@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000004",
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
    email: `james.carter@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000005",
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
    email: `yuki.tanaka@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000006",
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
  {
    name: "Aisha Patel",
    email: `aisha.patel@${STAFF_EMAIL_DOMAIN}`,
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
  {
    name: "Nadia Kowalski",
    email: `nadia.kowalski@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000008",
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

  // ── Expo Specialists (2) ─────────────────────────────────────
  {
    name: "Derek Washington",
    email: `derek.washington@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000009",
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
    email: `ava.mitchell@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000010",
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

  // ── Prep Specialists (4) ─────────────────────────────────────
  {
    name: "Carlos Diaz",
    email: `carlos.diaz@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000011",
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
    email: `hannah.berg@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000012",
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
    email: `omar.farouk@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000013",
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
    email: `mia.chen@${STAFF_EMAIL_DOMAIN}`,
    phone: "5552000014",
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

  // ── Flex Staff (2) ────────────────────────────────────────────
  {
    name: "Leo Nguyen",
    email: `leo.nguyen@${STAFF_EMAIL_DOMAIN}`,
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
    email: `ruby.kim@${STAFF_EMAIL_DOMAIN}`,
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
// Availability (dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat)
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
  to: string | null = null,
): AvailEntry {
  return { dayOfWeek, availableFrom: from, availableTo: to, preference };
}

function fullWeek(
  pref: "preferred" | "available",
  from: string,
  to: string,
  preferredDays: number[] = [],
): AvailEntry[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) =>
    avail(d, preferredDays.includes(d) ? "preferred" : pref, from, to),
  );
}

const AVAILABILITY_BY_STAFF: Record<string, AvailEntry[]> = {
  // Managers -- 7-day, full window. Necessary for the solver's
  // global manager-coverage constraint to remain satisfiable.
  "Marco Rossi":   fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Sofia Reyes":   fullWeek("available", "07:00", "23:00", [2, 4, 5, 6, 0]),
  "Liam O'Connor": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6, 0]),

  // Line cooks
  "Elena Volkov":  fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "James Carter":  fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Yuki Tanaka":   fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),
  "Aisha Patel":   fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),
  "Nadia Kowalski": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),

  // Expo specialists
  "Derek Washington": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Ava Mitchell":  fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Prep specialists
  "Carlos Diaz":   fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Hannah Berg":   fullWeek("available", "07:00", "23:00", [1, 2, 4, 5]),
  "Omar Farouk":   fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Mia Chen":      fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),

  // Flex
  "Leo Nguyen":    fullWeek("available", "07:00", "23:00", [1, 2, 3, 5, 6]),
  "Ruby Kim":      fullWeek("available", "07:00", "23:00", [2, 3, 4, 5, 0]),
};

// ============================================================================
// Shift Slot Definitions (Labor Requirements)
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

  // GRILL
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "08:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "08:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // SAUTE
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "09:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "09:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "15:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // PREP
  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "08:00", endTime: "14:00", minStaff: 1, preferredStaff: 1, priority: "high" });
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "10:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Prep", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // EXPO
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "16:00", endTime: "22:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Expo", startTime: "11:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  return slots;
}

// ============================================================================
// Logging helpers
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

function logWarn(message: string): void {
  console.warn(`  ! ${message}`);
}

function logError(message: string): void {
  console.error(`  ✗ ERROR: ${message}`);
}

// ============================================================================
// Clerk integration
// ============================================================================

let _clerkClient: ClerkClient | null = null;

function getClerkClient(): ClerkClient | null {
  if (_clerkClient) return _clerkClient;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  _clerkClient = createClerkClient({ secretKey });
  return _clerkClient;
}

async function findClerkUserByEmail(
  client: ClerkClient,
  email: string,
): Promise<ClerkUser | null> {
  const result = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  return result.data[0] ?? null;
}

async function ensureClerkUserForStaff(
  client: ClerkClient,
  staff: StaffDef,
): Promise<string | null> {
  try {
    const existing = await findClerkUserByEmail(client, staff.email);
    if (existing) {
      return existing.id;
    }
  } catch (err) {
    logWarn(
      `Clerk lookup failed for ${staff.email}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  const [firstName, ...rest] = staff.name.split(" ");
  const lastName = rest.join(" ") || firstName;

  try {
    const created = await client.users.createUser({
      emailAddress: [staff.email],
      password: STAFF_PASSWORD,
      firstName,
      lastName,
      skipPasswordChecks: true,
      skipPasswordRequirement: false,
    });
    return created.id;
  } catch (err) {
    logWarn(
      `Failed to create Clerk user for ${staff.email}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function deleteAllSeededClerkUsers(client: ClerkClient): Promise<void> {
  for (const def of STAFF_DEFINITIONS) {
    try {
      const user = await findClerkUserByEmail(client, def.email);
      if (!user) continue;
      await client.users.deleteUser(user.id);
      log(`  Deleted Clerk user ${def.email} (${user.id})`);
    } catch (err) {
      logWarn(
        `Failed to delete Clerk user ${def.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ============================================================================
// Legacy index cleanup
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
      // Index may not exist; ignore.
    }
  }
}

// ============================================================================
// Seed
// ============================================================================

async function seed(clerkUserId: string): Promise<void> {
  logStep("Dropping legacy indexes (if any)");
  await dropLegacyIndexes();

  logStep("Cleaning up existing data for this Clerk user");
  await cleanupAllOrgsForUser(clerkUserId);

  logStep("Creating Organization and Location");
  const org = await OrganizationService.create(clerkUserId, { name: ORG_NAME });
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
    `"${config.name}" -- ${config.stations.length} stations, ${config.roles.length} roles, managers: [${config.managerRoles.join(", ")}]`,
  );

  // ── Staff (with Clerk users + memberships) ─────────────────
  logStep(`Creating Staff (${STAFF_DEFINITIONS.length} members)`);
  const clerk = getClerkClient();
  if (!clerk) {
    logWarn(
      "CLERK_SECRET_KEY not set -- staff Clerk users WILL NOT be created. " +
        "The mobile app will not be able to sign these staff in.",
    );
  }

  const staffIds = new Map<string, string>();
  let activeCount = 0;
  let clerkLinkedCount = 0;
  let managerMembershipCount = 0;
  let staffMembershipCount = 0;

  const managerRoles = new Set(KITCHEN_CONFIG.managerRoles ?? []);

  for (const def of STAFF_DEFINITIONS) {
    const { isActive: _isActive, ...createData } = def;
    const staff = await StaffService.create(orgId, locationId, createData);
    activeCount++;

    let clerkId: string | null = null;
    if (clerk) {
      clerkId = await ensureClerkUserForStaff(clerk, def);
      if (clerkId) {
        clerkLinkedCount++;
        await StaffService.linkClerkUser(orgId, locationId, staff.id, clerkId);

        const isManager = def.roles.some((r) => managerRoles.has(r));
        const memberRole = isManager ? "manager" : "staff";
        try {
          await OrganizationMemberService.create({
            orgId,
            locationId,
            clerkUserId: clerkId,
            role: memberRole,
          });
          if (isManager) {
            managerMembershipCount++;
          } else {
            staffMembershipCount++;
          }
        } catch (err) {
          logWarn(
            `Membership for ${def.email} skipped: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const skillStr = staff.skills.map((s) => `${s.station}(${s.proficiency})`).join(", ");
    const flagStr = clerkId ? " [clerk-linked]" : "";
    log(
      `  ${staff.name} -- ${def.roles.join(", ")} | ${skillStr} | $${def.hourlyRate}/hr${flagStr}`,
    );
    staffIds.set(staff.name, staff.id);
  }

  logSuccess(
    `Created ${activeCount} active = ${staffIds.size} total ` +
      `(${clerkLinkedCount} linked to Clerk, ${managerMembershipCount} manager + ${staffMembershipCount} staff memberships)`,
  );

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
  logSuccess(
    `Created ${totalAvailEntries} availability entries for ${Object.keys(AVAILABILITY_BY_STAFF).length} staff`,
  );

  // ── Shift Slots ─────────────────────────────────────────────
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

  // ── No Time-Off Requests ───────────────────────────────────
  logStep("Time-Off Requests");
  log("None (favorable dataset -- no time-off constraints)");

  // ── Schedule ────────────────────────────────────────────────
  logStep("Creating DRAFT Schedule for Test Week");
  const schedule = await ScheduleService.getOrCreateForWeek(
    orgId, locationId, TEST_WEEK_START,
  );
  logSuccess(
    `Created DRAFT schedule for week of ${TEST_WEEK_START.toDateString()} (ID: ${schedule.id})`,
  );

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  SEED COMPLETE (FAVORABLE DATASET)");
  console.log("═".repeat(60));
  console.log(`\n  Organization:      ${ORG_NAME} (${orgId})`);
  console.log(`  Location:          Main Kitchen (${locationId})`);
  console.log(`  Kitchen Config:    ${config.stations.join(", ")}`);
  console.log(`  Manager Roles:     ${config.managerRoles.join(", ")}`);
  console.log(`  Staff:             ${activeCount} active`);
  console.log(`  Clerk-linked:      ${clerkLinkedCount}`);
  console.log(`  Memberships:       ${managerMembershipCount} manager + ${staffMembershipCount} staff`);
  console.log(`  Availability:      ${totalAvailEntries} entries (all 7 days)`);
  console.log(`  Shift Slots:       ${shiftSlots.length} entries`);
  console.log(`  Time-Off Requests: 0`);
  console.log(`  Schedule:          ${schedule.id} (DRAFT, week of ${TEST_WEEK_START.toDateString()})`);
  console.log(`\n  Owner Clerk User ID: ${clerkUserId}`);
  if (clerkLinkedCount > 0) {
    console.log(`  Staff sign-in password: ${STAFF_PASSWORD}`);
  }
}

// ============================================================================
// Cleanup helpers
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
  const clerk = getClerkClient();
  if (clerk) {
    log("Deleting any previously seeded staff Clerk users (idempotent)");
    await deleteAllSeededClerkUsers(clerk);
  }

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
// Cleanup entry point
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
  console.log(
    isCleanup
      ? "  GOLDEN FORK SEED -- CLEANUP"
      : "  GOLDEN FORK SEED -- SEED",
  );
  console.log("═".repeat(60));

  const clerkUserId = process.env.SEED_CLERK_USER_ID2;
  if (!clerkUserId) {
    console.error("\n✗ SEED_CLERK_USER_ID2 environment variable is not set.");
    console.error("  Add it to apps/web/.env.local:");
    console.error("  SEED_CLERK_USER_ID2=user_2xxx...");
    process.exit(1);
  }

  console.log(`\nClerk User ID:  ${clerkUserId}`);
  console.log(`MongoDB URI:    ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);
  console.log(`Clerk SDK key:  ${process.env.CLERK_SECRET_KEY ? "[SET]" : "[NOT SET]"}`);
  if (!isCleanup) {
    console.log(`Test Week:      ${TEST_WEEK_START.toDateString()}`);
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
      error instanceof Error ? error.message : String(error),
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
