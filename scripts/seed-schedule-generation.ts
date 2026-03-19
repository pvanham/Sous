/**
 * AI Schedule Generation Test Data Seed Script
 *
 * Populates the database with a realistic, high-volume restaurant dataset
 * ("The Copper Ladle") designed to stress-test the AI schedule generation
 * pipeline and UI (Sprint 3.9).
 *
 * Data is created via the Service Layer (same code path as the UI)
 * with orgId + locationId multi-tenancy scoping per ARCHITECTURE.md.
 *
 * Usage:
 *   npm run seed:ai-test          # Seed the database
 *   npm run cleanup:ai-test       # Remove seeded data
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
 *   - SEED_CLERK_USER_ID: Clerk user ID to own the test data
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
import { AIUsageService } from "../src/server/services/ai-usage.service";
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import { startOfWeek, addWeeks } from "date-fns";
import mongoose from "mongoose";

// ============================================================================
// Configuration
// ============================================================================

const ORG_NAME = "The Copper Ladle - AI Test";

/**
 * Compute the target test week: the upcoming Monday from today.
 * If today IS a Monday, use next Monday so we always get a future week.
 */
function getTargetTestWeek(): Date {
  const now = new Date();
  // startOfWeek with weekStartsOn: 1 gives us the current week's Monday
  let monday = startOfWeek(now, { weekStartsOn: 1 });
  // If we're currently past or on that Monday, advance to next week
  if (now >= monday) {
    monday = addWeeks(monday, 1);
  }
  // Zero out time
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const TEST_WEEK_START = getTargetTestWeek();

// ============================================================================
// Kitchen Configuration
// ============================================================================

const KITCHEN_CONFIG: KitchenConfigInput = {
  name: "The Copper Ladle",
  stations: ["Grill", "Saute", "Prep", "Assembly", "Expo", "Dish"],
  roles: ["Executive Chef", "Sous Chef", "Line Cook", "Prep Cook", "Dishwasher"],
  managerRoles: ["Executive Chef", "Sous Chef"],
  operatingHours: {
    monday:    { isOpen: true,  open: "07:00", close: "23:00" },
    tuesday:   { isOpen: true,  open: "07:00", close: "23:00" },
    wednesday: { isOpen: true,  open: "07:00", close: "23:00" },
    thursday:  { isOpen: true,  open: "07:00", close: "23:00" },
    friday:    { isOpen: true,  open: "07:00", close: "23:00" },
    saturday:  { isOpen: true,  open: "08:00", close: "23:00" },
    sunday:    { isOpen: true,  open: "09:00", close: "21:00" },
  },
  minTimeOffAdvanceDays: 0, // Allow immediate time-off for testing
  aiSettings: {
    monthlyGenerationLimit: 100,
    subscriptionTier: "pro",
  },
};

// ============================================================================
// Staff Definitions (25 members)
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
  // ── Senior Staff (3) ──────────────────────────────────────────
  {
    name: "Marcus Rivera",
    email: "marcus.rivera@copperladle.test",
    phone: "5551000001",
    roles: ["Executive Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 5 },
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
      { station: "Expo", proficiency: 5 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 30,
    preferredStations: ["Grill", "Expo"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 35,
  },
  {
    name: "Sophie Chen",
    email: "sophie.chen@copperladle.test",
    phone: "5551000002",
    roles: ["Sous Chef"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 25,
    preferredStations: ["Saute"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 30,
  },
  {
    name: "David Okafor",
    email: "david.okafor@copperladle.test",
    phone: "5551000003",
    roles: ["Sous Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 4 },
      { station: "Expo", proficiency: 4 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 28,
  },

  // ── Experienced Line Cooks (8) ────────────────────────────────
  {
    name: "Emily Nguyen",
    email: "emily.nguyen@copperladle.test",
    phone: "5551000004",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Saute", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 22,
  },
  {
    name: "Jake Thompson",
    email: "jake.thompson@copperladle.test",
    phone: "5551000005",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Assembly", proficiency: 4 },
      { station: "Expo", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Assembly"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Maria Santos",
    email: "maria.santos@copperladle.test",
    phone: "5551000006",
    roles: ["Line Cook"],
    skills: [
      { station: "Saute", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Saute"],
    certifications: [],
    hourlyRate: 21,
  },
  {
    name: "Tyler Kim",
    email: "tyler.kim@copperladle.test",
    phone: "5551000007",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Saute", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 10,
    preferredStations: ["Grill", "Saute"],
    certifications: [],
    hourlyRate: 22,
  },
  {
    name: "Priya Patel",
    email: "priya.patel@copperladle.test",
    phone: "5551000008",
    roles: ["Line Cook"],
    skills: [
      { station: "Saute", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
      { station: "Expo", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Assembly"],
    certifications: [],
    hourlyRate: 19,
  },
  {
    name: "Carlos Mendez",
    email: "carlos.mendez@copperladle.test",
    phone: "5551000009",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 25, // Raised from 15 for more realistic coverage
    minHoursPerWeek: 8,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Ashley Brooks",
    email: "ashley.brooks@copperladle.test",
    phone: "5551000010",
    roles: ["Line Cook"],
    skills: [
      { station: "Assembly", proficiency: 4 },
      { station: "Expo", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Expo"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Ryan O'Brien",
    email: "ryan.obrien@copperladle.test",
    phone: "5551000011",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Saute", proficiency: 3 },
      { station: "Assembly", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 30, // EDGE CASE: High minimum hours
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 24,
  },

  // ── Prep Cooks (6) ────────────────────────────────────────────
  {
    name: "Lisa Chang",
    email: "lisa.chang@copperladle.test",
    phone: "5551000012",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 17,
  },
  {
    name: "Omar Hassan",
    email: "omar.hassan@copperladle.test",
    phone: "5551000013",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
      { station: "Dish", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 10,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 16,
  },
  {
    name: "Hannah Miller",
    email: "hannah.miller@copperladle.test",
    phone: "5551000014",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 3 },
      { station: "Saute", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 10,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 15,
  },
  {
    name: "Wei Zhang",
    email: "wei.zhang@copperladle.test",
    phone: "5551000015",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 5 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 20,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Jordan Taylor",
    email: "jordan.taylor@copperladle.test",
    phone: "5551000016",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 3 },
      { station: "Grill", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 8,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 15,
  },
  {
    name: "Natalie Wood",
    email: "natalie.wood@copperladle.test",
    phone: "5551000017",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
      { station: "Expo", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 0, // EDGE CASE: Missing hourly rate -- triggers readiness warning
  },

  // ── Dishwashers (4) ───────────────────────────────────────────
  {
    name: "Deshawn Williams",
    email: "deshawn.williams@copperladle.test",
    phone: "5551000018",
    roles: ["Dishwasher"],
    skills: [
      { station: "Dish", proficiency: 5 },
      { station: "Prep", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Dish"],
    certifications: [],
    hourlyRate: 16,
  },
  {
    name: "Kenji Tanaka",
    email: "kenji.tanaka@copperladle.test",
    phone: "5551000019",
    roles: ["Dishwasher"],
    skills: [
      { station: "Dish", proficiency: 4 },
      { station: "Prep", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 10,
    preferredStations: ["Dish"],
    certifications: [],
    hourlyRate: 15,
  },
  {
    name: "Aaliyah Johnson",
    email: "aaliyah.johnson@copperladle.test",
    phone: "5551000020",
    roles: ["Dishwasher"],
    skills: [
      { station: "Dish", proficiency: 3 },
      { station: "Prep", proficiency: 1 },
    ],
    isActive: true,
    maxHoursPerWeek: 25,
    minHoursPerWeek: 8,
    preferredStations: ["Dish"],
    certifications: [],
    hourlyRate: 14,
  },
  {
    name: "Miguel Flores",
    email: "miguel.flores@copperladle.test",
    phone: "5551000021",
    roles: ["Dishwasher"],
    skills: [
      { station: "Dish", proficiency: 4 },
      { station: "Assembly", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Dish"],
    certifications: [],
    hourlyRate: 15,
  },

  // ── Flex Staff (2) ────────────────────────────────────────────
  {
    name: "Sam Russo",
    email: "sam.russo@copperladle.test",
    phone: "5551000022",
    roles: ["Line Cook", "Prep Cook"],
    skills: [
      { station: "Grill", proficiency: 2 },
      { station: "Saute", proficiency: 2 },
      { station: "Prep", proficiency: 2 },
      { station: "Assembly", proficiency: 2 },
      { station: "Dish", proficiency: 1 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: [],
    certifications: [],
    hourlyRate: 17,
  },
  {
    name: "Alex Petrov",
    email: "alex.petrov@copperladle.test",
    phone: "5551000023",
    roles: ["Line Cook", "Prep Cook"],
    skills: [
      { station: "Grill", proficiency: 2 },
      { station: "Prep", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
      { station: "Expo", proficiency: 2 },
      { station: "Dish", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 8,
    preferredStations: [],
    certifications: [],
    hourlyRate: 16,
  },

  // ── Additional Flex Staff (3) ────────────────────────────────
  {
    name: "Nina Kowalski",
    email: "nina.kowalski@copperladle.test",
    phone: "5551000026",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
      { station: "Expo", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill", "Saute"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Dante Jackson",
    email: "dante.jackson@copperladle.test",
    phone: "5551000027",
    roles: ["Line Cook", "Prep Cook"],
    skills: [
      { station: "Saute", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
      { station: "Assembly", proficiency: 2 },
      { station: "Dish", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Saute", "Prep"],
    certifications: [],
    hourlyRate: 19,
  },
  {
    name: "Chloe Martinez",
    email: "chloe.martinez@copperladle.test",
    phone: "5551000028",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Expo", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 35,
    minHoursPerWeek: 15,
    preferredStations: ["Expo"],
    certifications: [],
    hourlyRate: 19,
  },

  // ── Inactive Staff (2) ────────────────────────────────────────
  {
    name: "Rachel Green",
    email: "rachel.green@copperladle.test",
    phone: "5551000024",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
    ],
    isActive: false, // INACTIVE
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Tony Vasquez",
    email: "tony.vasquez@copperladle.test",
    phone: "5551000025",
    roles: ["Prep Cook"],
    skills: [
      { station: "Prep", proficiency: 4 },
    ],
    isActive: false, // INACTIVE
    maxHoursPerWeek: 30,
    minHoursPerWeek: 10,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 16,
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

function unavailDays(days: number[]): AvailEntry[] {
  return days.map((d) => avail(d, "unavailable", null, null));
}

// Map: staff name -> availability entries for all 7 days
const AVAILABILITY_BY_STAFF: Record<string, AvailEntry[]> = {
  // ── Full-timers (available all days, preferred on some) ───────
  "Marcus Rivera": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Sophie Chen":   fullWeek("available", "07:00", "23:00", [1, 3, 5]),
  "David Okafor":  fullWeek("available", "07:00", "23:00", [2, 4, 6]),
  "Emily Nguyen":  fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Maria Santos":  fullWeek("available", "07:00", "23:00", [1, 2, 4, 5]),
  "Ryan O'Brien":  fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Lisa Chang":    fullWeek("available", "07:00", "23:00", [1, 2, 3, 4]),
  "Wei Zhang":     fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Deshawn Williams": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Miguel Flores": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),

  // ── Part-timers (3-5 days, some with restricted hours) ────────
  "Jake Thompson": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "15:00"),  // Morning only
    avail(2, "available", "07:00", "15:00"),
    avail(3, "unavailable"),
    avail(4, "preferred", "07:00", "15:00"),
    avail(5, "preferred", "07:00", "15:00"),
    avail(6, "available", "08:00", "16:00"),
  ],
  "Tyler Kim": [
    avail(0, "unavailable"),
    avail(1, "preferred", "15:00", "23:00"),  // Evening only
    avail(2, "preferred", "15:00", "23:00"),
    avail(3, "available", "15:00", "23:00"),
    avail(4, "available", "15:00", "23:00"),
    avail(5, "unavailable"),
    avail(6, "unavailable"),
  ],
  "Priya Patel": [
    avail(0, "unavailable"),
    avail(1, "available", "09:00", "17:00"),
    avail(2, "preferred", "09:00", "17:00"),
    avail(3, "available", "09:00", "17:00"),
    avail(4, "preferred", "09:00", "17:00"),
    avail(5, "available", "09:00", "17:00"),
    avail(6, "unavailable"),
  ],
  "Carlos Mendez": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "13:00"),  // Short shifts only (low hour cap)
    avail(2, "unavailable"),
    avail(3, "available", "07:00", "13:00"),
    avail(4, "unavailable"),
    avail(5, "preferred", "07:00", "13:00"),
    avail(6, "unavailable"),
  ],
  "Ashley Brooks": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "preferred", "07:00", "23:00"),
    avail(2, "preferred", "07:00", "23:00"),
    avail(3, "unavailable"),
    avail(4, "unavailable"),
    avail(5, "preferred", "07:00", "23:00"),
    avail(6, "available", "08:00", "23:00"),
  ],
  "Omar Hassan": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "15:00"),
    avail(2, "available", "07:00", "15:00"),
    avail(3, "available", "07:00", "15:00"),
    avail(4, "available", "07:00", "15:00"),
    avail(5, "unavailable"),
    avail(6, "unavailable"),
  ],
  "Hannah Miller": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "15:00"),
    avail(2, "available", "07:00", "15:00"),   // Tue (added)
    avail(3, "preferred", "07:00", "15:00"),
    avail(4, "available", "07:00", "15:00"),   // Thu (added)
    avail(5, "preferred", "07:00", "15:00"),
    avail(6, "unavailable"),
  ],
  "Natalie Wood": [
    avail(0, "unavailable"),
    avail(1, "preferred", "07:00", "23:00"),
    avail(2, "available", "07:00", "23:00"),
    avail(3, "preferred", "07:00", "23:00"),
    avail(4, "available", "07:00", "23:00"),
    avail(5, "unavailable"),
    avail(6, "unavailable"),
  ],

  // ── Weekend-heavy (3) — now with some weekday availability ──────
  "Kenji Tanaka": [
    avail(0, "preferred", "09:00", "21:00"),  // Sun
    avail(1, "unavailable"),
    avail(2, "unavailable"),
    avail(3, "available", "15:00", "23:00"),  // Wed evening (added)
    avail(4, "available", "15:00", "23:00"),  // Thu evening (added)
    avail(5, "preferred", "07:00", "23:00"),  // Fri
    avail(6, "preferred", "08:00", "23:00"),  // Sat
  ],
  "Aaliyah Johnson": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "unavailable"),
    avail(2, "available", "15:00", "23:00"),  // Tue evening (added)
    avail(3, "unavailable"),
    avail(4, "available", "15:00", "23:00"),  // Thu evening (added)
    avail(5, "available", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],
  "Sam Russo": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "available", "15:00", "23:00"),  // Mon evening (added)
    avail(2, "unavailable"),
    avail(3, "available", "15:00", "23:00"),  // Wed evening (added)
    avail(4, "available", "15:00", "23:00"),  // Thu evening
    avail(5, "preferred", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],

  // ── Weekday-only (2) ──────────────────────────────────────────
  "Jordan Taylor": [
    avail(0, "unavailable"),
    avail(1, "preferred", "07:00", "15:00"),
    avail(2, "available", "07:00", "15:00"),
    avail(3, "preferred", "07:00", "15:00"),
    avail(4, "available", "07:00", "15:00"),
    avail(5, "preferred", "07:00", "15:00"),
    avail(6, "unavailable"),
  ],
  "Alex Petrov": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "23:00"),
    avail(2, "preferred", "07:00", "23:00"),
    avail(3, "available", "07:00", "23:00"),
    avail(4, "preferred", "07:00", "23:00"),
    avail(5, "available", "07:00", "23:00"),
    avail(6, "unavailable"),
  ],

  // ── Additional Flex Staff ────────────────────────────────────
  "Nina Kowalski": fullWeek("available", "07:00", "23:00", [1, 2, 4, 5]),
  "Dante Jackson": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "Chloe Martinez": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "preferred", "07:00", "23:00"),
    avail(2, "preferred", "07:00", "23:00"),
    avail(3, "available", "07:00", "23:00"),
    avail(4, "preferred", "07:00", "23:00"),
    avail(5, "available", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],

  // Inactive staff get no entries (they won't appear in generation)
};

// ============================================================================
// Shift Slot Definitions (Labor Requirements)
//
// Each entry defines a real shift the schedule generator will fill.
// Shifts are 6-8 hours, matching realistic restaurant patterns.
// dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
//
// Balance analysis (26 active staff):
//   ~93 person-shifts / week  (~694 person-hours)
//   Staff min-hours total: ~422h  →  enough slots for everyone
//   Staff max-hours total: ~919h  →  feasible without overloading
//   Average per employee: ~3.6 shifts/week, ~27 hours/week
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

  const monThu = [1, 2, 3, 4]; // Mon-Thu
  const monFri = [1, 2, 3, 4, 5]; // Mon-Fri

  // ── GRILL (high-traffic line station) ──────────────────────────
  // Mon-Thu: AM + PM (pref 2 for dinner coverage)
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "high" });
  }
  // Fri: AM + PM (pref 2) + Dinner Support
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "17:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  // Sat: AM + PM (pref 2)
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  // Sun: AM + PM
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "15:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "high" });

  // ── SAUTE ──────────────────────────────────────────────────────
  // Mon-Thu: Mid + PM
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: Mid + PM (pref 2 for Friday dinner)
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  // Sat: AM + PM (pref 2)
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  // Sun: Mid + PM
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "high" });

  // ── PREP ───────────────────────────────────────────────────────
  // Mon-Fri: Early (6h) + AM (8h)
  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "07:00", endTime: "13:00", minStaff: 1, preferredStaff: 1, priority: "high" });
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  // Fri extra: Afternoon prep for weekend
  slots.push({ dayOfWeek: 5, station: "Prep", startTime: "13:00", endTime: "19:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  // Sat: AM + Mid
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "08:00", endTime: "14:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "11:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  // Sun: AM only (lighter day)
  slots.push({ dayOfWeek: 0, station: "Prep", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── ASSEMBLY ───────────────────────────────────────────────────
  // Mon-Thu: Mid + PM
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: Mid + PM (pref 2 for Friday volume)
  slots.push({ dayOfWeek: 5, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "high" });
  // Sat: Mid + PM
  slots.push({ dayOfWeek: 6, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  // Sun: Mid + PM
  slots.push({ dayOfWeek: 0, station: "Assembly", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Assembly", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── EXPO (service periods only) ────────────────────────────────
  // Mon-Thu: Lunch + Dinner
  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  // Fri: Lunch + Dinner (higher priority)
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sat: Lunch + Dinner (higher priority)
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  // Sun: All Service (single shift, shorter day)
  slots.push({ dayOfWeek: 0, station: "Expo", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  // ── DISH ───────────────────────────────────────────────────────
  // Mon-Fri: AM + PM
  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Dish", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Dish", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  // Sat: AM + PM
  slots.push({ dayOfWeek: 6, station: "Dish", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 6, station: "Dish", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  // Sun: AM + PM
  slots.push({ dayOfWeek: 0, station: "Dish", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Dish", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

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

/** Create a Date for a specific day in the test week */
function testDay(dayOffset: number): Date {
  const d = new Date(TEST_WEEK_START);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ============================================================================
// Legacy Index Cleanup
// ============================================================================

/**
 * Drop legacy unique indexes from the pre-multi-location era.
 * These indexes use `userId` which no longer exists in the schemas -- all models
 * now scope by orgId + locationId. If not dropped, they cause E11000 duplicate
 * key errors because `userId` is null on all new documents.
 */
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
  // Drop legacy indexes from pre-multi-location era that conflict with new schema
  logStep("Dropping legacy indexes (if any)");
  await dropLegacyIndexes();

  logStep("Cleaning up existing data for this Clerk user");

  // Remove ALL organizations owned by this Clerk user (including auto-bootstrapped ones).
  // This ensures getLocationContext resolves to the seeded org, not a stale auto-created one.
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
  let inactiveCount = 0;

  for (const def of STAFF_DEFINITIONS) {
    const { isActive, ...createData } = def;
    const staff = await StaffService.create(orgId, locationId, createData);

    if (!isActive) {
      await StaffService.setActive(orgId, locationId, staff.id, false);
      inactiveCount++;
      log(
        `  ${staff.name} [INACTIVE] -- ${def.roles.join(", ")}`
      );
    } else {
      activeCount++;
      const skillStr = staff.skills.map((s) => `${s.station}(${s.proficiency})`).join(", ");
      const flags: string[] = [];
      if (def.hourlyRate === 0) flags.push("$0/hr");
      if (def.maxHoursPerWeek <= 15) flags.push(`max${def.maxHoursPerWeek}h`);
      if (def.minHoursPerWeek >= 30) flags.push(`min${def.minHoursPerWeek}h`);
      const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      log(
        `  ${staff.name} -- ${def.roles.join(", ")} | ${skillStr} | $${def.hourlyRate}/hr${flagStr}`
      );
    }
    staffIds.set(staff.name, staff.id);
  }
  logSuccess(`Created ${activeCount} active + ${inactiveCount} inactive = ${staffIds.size} total`);

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

  // Summarize by station
  const byStation = new Map<string, number>();
  for (const s of shiftSlots) {
    byStation.set(s.station, (byStation.get(s.station) ?? 0) + 1);
  }
  for (const [station, count] of byStation) {
    log(`  ${station}: ${count} shift slots`);
  }
  logSuccess(`Created ${shiftSlots.length} shift slots`);

  // ── Time-Off Requests ───────────────────────────────────────
  logStep("Creating Time-Off Requests");

  // 1. Emily Nguyen (key Grill cook) -- approved, Mon-Tue of test week
  const emilyId = staffIds.get("Emily Nguyen")!;
  const emilyTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: emilyId,
    startDate: testDay(0), // Monday
    endDate: testDay(1),   // Tuesday
    reason: "Family obligation",
  });
  await TimeOffRequestService.updateStatus(
    orgId, locationId, emilyTimeOff.id, "approved", clerkUserId, "Approved"
  );
  log(`  Emily Nguyen: ${DAY_NAMES[0]}-${DAY_NAMES[1]} APPROVED (key Grill cook out)`);

  // 2. Maria Santos (Saute cook) -- approved, Wed-Fri of test week (multi-day)
  const mariaId = staffIds.get("Maria Santos")!;
  const mariaTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: mariaId,
    startDate: testDay(2), // Wednesday
    endDate: testDay(4),   // Friday
    reason: "Vacation",
  });
  await TimeOffRequestService.updateStatus(
    orgId, locationId, mariaTimeOff.id, "approved", clerkUserId, "Enjoy your trip!"
  );
  log(`  Maria Santos: ${DAY_NAMES[2]}-${DAY_NAMES[4]} APPROVED (3-day vacation)`);

  // 3. Jake Thompson -- pending request (should NOT affect generation)
  const jakeId = staffIds.get("Jake Thompson")!;
  await TimeOffRequestService.create(orgId, locationId, {
    staffId: jakeId,
    startDate: testDay(3), // Thursday
    endDate: testDay(3),
    reason: "Doctor appointment",
  });
  log(`  Jake Thompson: ${DAY_NAMES[3]} PENDING (should NOT filter from generation)`);

  // 4. Tyler Kim -- denied request (should NOT affect generation)
  const tylerId = staffIds.get("Tyler Kim")!;
  const tylerTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: tylerId,
    startDate: testDay(1), // Tuesday
    endDate: testDay(1),
    reason: "Personal day",
  });
  await TimeOffRequestService.updateStatus(
    orgId, locationId, tylerTimeOff.id, "denied", clerkUserId, "Short-staffed that day"
  );
  log(`  Tyler Kim: ${DAY_NAMES[1]} DENIED (should NOT filter from generation)`);

  // 5. Kenji Tanaka (weekend-only dishwasher) -- approved for Sunday
  const kenjiId = staffIds.get("Kenji Tanaka")!;
  const kenjiTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: kenjiId,
    startDate: testDay(6), // Sunday
    endDate: testDay(6),
    reason: "Family event",
  });
  await TimeOffRequestService.updateStatus(
    orgId, locationId, kenjiTimeOff.id, "approved", clerkUserId, "Approved"
  );
  log(`  Kenji Tanaka: ${DAY_NAMES[6]} APPROVED (weekend-only dishwasher out on Sunday)`);

  logSuccess("Created 5 time-off requests (3 approved, 1 pending, 1 denied)");

  // ── Schedule ────────────────────────────────────────────────
  logStep("Creating DRAFT Schedule for Test Week");
  const schedule = await ScheduleService.getOrCreateForWeek(
    orgId, locationId, TEST_WEEK_START
  );
  logSuccess(`Created DRAFT schedule for week of ${TEST_WEEK_START.toDateString()} (ID: ${schedule.id})`);

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  SEED COMPLETE");
  console.log("═".repeat(60));
  console.log(`\n  Organization:      ${ORG_NAME} (${orgId})`);
  console.log(`  Location:          Main Kitchen (${locationId})`);
  console.log(`  Kitchen Config:    ${config.stations.join(", ")}`);
  console.log(`  Staff:             ${activeCount} active, ${inactiveCount} inactive`);
  console.log(`  Availability:      ${totalAvailEntries} entries`);
  console.log(`  Shift Slots:       ${shiftSlots.length} entries`);
  console.log(`  Time-Off Requests: 5 (3 approved, 1 pending, 1 denied)`);
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

/**
 * Delete a single organization and all its related data.
 * Used by both cleanup() and cleanupAllOrgsForUser().
 */
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

/**
 * Remove ALL organizations owned by a Clerk user.
 * This includes auto-bootstrapped orgs (e.g. "My Restaurant") that getLocationContext
 * creates when a new user visits the dashboard before seeding. Without this cleanup,
 * getFirstByUserId resolves to the stale auto-created org instead of the seeded one.
 */
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
    console.log("  AI SCHEDULE GENERATION TEST DATA -- CLEANUP");
  } else {
    console.log("  AI SCHEDULE GENERATION TEST DATA -- SEED");
  }
  console.log("═".repeat(60));

  // Read Clerk user ID from environment
  const clerkUserId = process.env.SEED_CLERK_USER_ID;
  if (!clerkUserId) {
    console.error("\n✗ SEED_CLERK_USER_ID environment variable is not set.");
    console.error("  Add it to .env.local:");
    console.error("  SEED_CLERK_USER_ID=user_2xxx...");
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
