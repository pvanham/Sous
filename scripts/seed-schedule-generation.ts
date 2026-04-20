/**
 * AI Schedule Generation Test Data Seed Script ("The Copper Ladle")
 *
 * Populates the database with a realistic, high-volume restaurant
 * dataset designed to stress-test the AI schedule generation pipeline,
 * the mobile staff app, and the manager-coverage constraint in the
 * CP-SAT solver.
 *
 * What this seed creates:
 *
 *   - Org + Location + KitchenConfig (with managerRoles wired to the
 *     two senior chef roles so the solver's manager-coverage constraint
 *     has data to enforce against).
 *   - 28 Staff records (26 active, 2 inactive). Active staff are
 *     mirrored as Clerk users + OrganizationMember rows so the mobile
 *     app can sign each one in and see their own shifts. Managers also
 *     get a `manager` membership; rank-and-file staff get a `staff`
 *     membership.
 *   - Weekly availability for every active staff member, designed so
 *     the four manager-grade staff (Marcus, Sophie, David, Priya) can
 *     collectively cover every operating-hour minute of the week --
 *     otherwise the solver's hard manager-coverage constraint emits a
 *     shortfall and the readiness report fails.
 *   - LaborRequirements (shift slots) per ARCHITECTURE.md.
 *   - 5 TimeOffRequest records exercising every status path.
 *   - A DRAFT Schedule for the upcoming Monday-Sunday window so the
 *     UI's "generate" button has something to point at.
 *
 * Two run modes:
 *
 *   npm run seed:ai-test            # seed (idempotent — wipes prior org)
 *   npm run cleanup:ai-test         # tear down org, members, Clerk users
 *
 * Required env (read from apps/web/.env.local):
 *
 *   - MONGODB_URI            Mongo Atlas connection string
 *   - CLERK_SECRET_KEY       Clerk Backend SDK key (needed for staff users)
 *   - SEED_CLERK_USER_ID     Clerk user that owns this seeded org
 *
 * Optional env:
 *
 *   - SEED_STAFF_PASSWORD    Password for created staff Clerk users
 *                            (default: a fixed value baked in below).
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Resolve apps/web/.env.local relative to this script so it works regardless
// of where the user invoked tsx from (repo root, apps/web, etc.).
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
import { TimeOffRequestService } from "../apps/web/src/server/services/time-off-request.service";
import { ScheduleService } from "../apps/web/src/server/services/schedule.service";
import { ShiftService } from "../apps/web/src/server/services/shift.service";
import { LaborRequirementService } from "../apps/web/src/server/services/labor-requirement.service";
import { AIUsageService } from "../apps/web/src/server/services/ai-usage.service";
import type { KitchenConfigInput } from "../apps/web/src/lib/validations/kitchen-config.schema";
import { startOfWeek, addWeeks } from "date-fns";
import mongoose from "mongoose";
import { createClerkClient } from "@clerk/backend";
import type { ClerkClient, User as ClerkUser } from "@clerk/backend";

// ============================================================================
// Configuration
// ============================================================================

const ORG_NAME = "The Copper Ladle - AI Test";
const STAFF_EMAIL_DOMAIN = "gmail.com";
const STAFF_PASSWORD =
  process.env.SEED_STAFF_PASSWORD ?? "CopperLadle!2026Seed";

// All seeded staff emails carry the `+clerk_test` sub-address marker.
// Clerk development instances treat any address matching the pattern
// `*+clerk_test@*` as a test account: it bypasses real email delivery,
// auto-verifies on user creation, and accepts the fixed OTP `424242`
// during sign-in.
//
// IMPORTANT: Clerk's `client.users.createUser({...})` rejects addresses
// whose domain does not pass standard email format validation (e.g. the
// reserved `*.test` TLD returns `form_param_format_invalid`). We therefore
// pair the `+clerk_test` marker with a real, well-known domain
// (`gmail.com`) so creation succeeds while still routing through Clerk's
// test-account path. No real mail is ever sent to these `+clerk_test`
// addresses.
//
// See: https://clerk.com/docs/testing/test-emails-and-phones

/**
 * Compute the target test week: the upcoming Monday from today.
 * If today IS a Monday, use next Monday so we always get a future week.
 */
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
// Kitchen Configuration
// ============================================================================
//
// `managerRoles` is the source of truth the schedule solver consults to
// decide which staff count as managers for the global manager-coverage
// constraint (see solver/main.py `is_manager`). These two roles MUST also
// appear in `roles`, and at least one staff member with one of these
// roles MUST be available across every operating-hour minute of the
// week, otherwise the solver returns a shortfall.

const KITCHEN_CONFIG: KitchenConfigInput = {
  name: "The Copper Ladle",
  stations: ["Grill", "Saute", "Prep", "Assembly", "Expo", "Dish"],
  roles: [
    "Manager", // Solver-recognised manager role (kept first; see solver/main.py).
    "Executive Chef",
    "Sous Chef",
    "Line Cook",
    "Prep Cook",
    "Dishwasher",
  ],
  managerRoles: ["Manager", "Executive Chef", "Sous Chef"],
  operatingHours: {
    monday: { isOpen: true, open: "07:00", close: "23:00" },
    tuesday: { isOpen: true, open: "07:00", close: "23:00" },
    wednesday: { isOpen: true, open: "07:00", close: "23:00" },
    thursday: { isOpen: true, open: "07:00", close: "23:00" },
    friday: { isOpen: true, open: "07:00", close: "23:00" },
    saturday: { isOpen: true, open: "08:00", close: "23:00" },
    sunday: { isOpen: true, open: "09:00", close: "21:00" },
  },
  minTimeOffAdvanceDays: 0, // Allow immediate time-off for testing
  aiSettings: {
    monthlyGenerationLimit: 100,
    subscriptionTier: "pro",
  },
};

// ============================================================================
// Staff Definitions (28 total: 26 active + 2 inactive)
// ============================================================================
//
// Manager roster (4 active):
//   - Marcus Rivera  (Executive Chef) -- 7-day availability, max 50h
//   - Sophie Chen    (Sous Chef)      -- 7-day availability, max 45h
//   - David Okafor   (Sous Chef)      -- 7-day availability, max 45h
//   - Priya Patel    (Sous Chef)      -- 7-day availability, max 40h
//
// Combined manager max-hours capacity: 180h/week. Operating hours total
// 5*16 + 15 + 12 = 107h/week of required manager presence. Comfortable.

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
  // ── Managers (4) ──────────────────────────────────────────────
  {
    name: "Marcus Rivera",
    email: `marcus.rivera+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000001",
    roles: ["Manager", "Executive Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 5 },
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
      { station: "Expo", proficiency: 5 },
    ],
    isActive: true,
    maxHoursPerWeek: 50,
    minHoursPerWeek: 30,
    preferredStations: ["Grill", "Expo"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 35,
  },
  {
    name: "Sophie Chen",
    email: `sophie.chen+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000002",
    roles: ["Manager", "Sous Chef"],
    skills: [
      { station: "Saute", proficiency: 5 },
      { station: "Grill", proficiency: 4 },
      { station: "Prep", proficiency: 4 },
      { station: "Assembly", proficiency: 3 },
      { station: "Expo", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 25,
    preferredStations: ["Saute"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 30,
  },
  {
    name: "David Okafor",
    email: `david.okafor+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000003",
    roles: ["Manager", "Sous Chef"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Saute", proficiency: 4 },
      { station: "Expo", proficiency: 4 },
      { station: "Assembly", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 25,
    preferredStations: ["Grill"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 28,
  },
  {
    name: "Priya Patel",
    email: `priya.patel+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000004",
    roles: ["Manager", "Sous Chef"],
    skills: [
      { station: "Saute", proficiency: 4 },
      { station: "Assembly", proficiency: 4 },
      { station: "Expo", proficiency: 4 },
      { station: "Prep", proficiency: 3 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Saute", "Expo"],
    certifications: ["ServSafe Manager"],
    hourlyRate: 27,
  },

  // ── Experienced Line Cooks (7) ────────────────────────────────
  {
    name: "Emily Nguyen",
    email: `emily.nguyen+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000005",
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
    email: `jake.thompson+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000006",
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
    email: `maria.santos+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000007",
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
    email: `tyler.kim+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000008",
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
    name: "Carlos Mendez",
    email: `carlos.mendez+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000009",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 4 },
    ],
    isActive: true,
    maxHoursPerWeek: 25,
    minHoursPerWeek: 8,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 18,
  },
  {
    name: "Ashley Brooks",
    email: `ashley.brooks+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `ryan.obrien+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000011",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 4 },
      { station: "Saute", proficiency: 3 },
      { station: "Assembly", proficiency: 2 },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 30, // EDGE CASE: high minimum hours
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 24,
  },

  // ── Prep Cooks (6) ────────────────────────────────────────────
  {
    name: "Lisa Chang",
    email: `lisa.chang+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `omar.hassan+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `hannah.miller+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `wei.zhang+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `jordan.taylor+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `natalie.wood+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    hourlyRate: 0, // EDGE CASE: missing hourly rate -- triggers readiness warning
  },

  // ── Dishwashers (4) ───────────────────────────────────────────
  {
    name: "Deshawn Williams",
    email: `deshawn.williams+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `kenji.tanaka+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `aaliyah.johnson+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `miguel.flores+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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

  // ── Flex Staff (5) ────────────────────────────────────────────
  {
    name: "Sam Russo",
    email: `sam.russo+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
    email: `alex.petrov+clerk_test@${STAFF_EMAIL_DOMAIN}`,
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
  {
    name: "Nina Kowalski",
    email: `nina.kowalski+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000024",
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
    email: `dante.jackson+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000025",
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
    email: `chloe.martinez+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000026",
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
  // Inactive staff are deliberately *not* given Clerk users -- they
  // exist purely to verify the readiness checks ignore them.
  {
    name: "Rachel Green",
    email: `rachel.green+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000027",
    roles: ["Line Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Saute", proficiency: 3 },
    ],
    isActive: false,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [],
    hourlyRate: 20,
  },
  {
    name: "Tony Vasquez",
    email: `tony.vasquez+clerk_test@${STAFF_EMAIL_DOMAIN}`,
    phone: "5551000028",
    roles: ["Prep Cook"],
    skills: [{ station: "Prep", proficiency: 4 }],
    isActive: false,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 10,
    preferredStations: ["Prep"],
    certifications: [],
    hourlyRate: 16,
  },
];

// ============================================================================
// Availability (dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat)
// ============================================================================
//
// All four managers have full-week availability across all operating
// hours so the solver always has at least one manager candidate per
// time interval. Staff have varied availability to exercise the soft
// constraints.

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
  // ── Managers (all 7 days, full operating window) ──────────────
  "Marcus Rivera": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Sophie Chen": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),
  "David Okafor": fullWeek("available", "07:00", "23:00", [2, 4, 6, 0]),
  "Priya Patel": fullWeek("available", "07:00", "23:00", [0, 2, 4, 6]),

  // ── Other full-timers ─────────────────────────────────────────
  "Emily Nguyen": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Maria Santos": fullWeek("available", "07:00", "23:00", [1, 2, 4, 5]),
  "Ryan O'Brien": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Lisa Chang": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4]),
  "Wei Zhang": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Deshawn Williams": fullWeek("available", "07:00", "23:00", [1, 2, 3, 4, 5]),
  "Miguel Flores": fullWeek("available", "07:00", "23:00", [1, 3, 5, 6]),

  // ── Part-timers ───────────────────────────────────────────────
  "Jake Thompson": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "15:00"),
    avail(2, "available", "07:00", "15:00"),
    avail(3, "unavailable"),
    avail(4, "preferred", "07:00", "15:00"),
    avail(5, "preferred", "07:00", "15:00"),
    avail(6, "available", "08:00", "16:00"),
  ],
  "Tyler Kim": [
    avail(0, "unavailable"),
    avail(1, "preferred", "15:00", "23:00"),
    avail(2, "preferred", "15:00", "23:00"),
    avail(3, "available", "15:00", "23:00"),
    avail(4, "available", "15:00", "23:00"),
    avail(5, "unavailable"),
    avail(6, "unavailable"),
  ],
  "Carlos Mendez": [
    avail(0, "unavailable"),
    avail(1, "available", "07:00", "13:00"),
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
    avail(2, "available", "07:00", "15:00"),
    avail(3, "preferred", "07:00", "15:00"),
    avail(4, "available", "07:00", "15:00"),
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

  // ── Weekend-heavy ─────────────────────────────────────────────
  "Kenji Tanaka": [
    avail(0, "preferred", "09:00", "21:00"),
    avail(1, "unavailable"),
    avail(2, "unavailable"),
    avail(3, "available", "15:00", "23:00"),
    avail(4, "available", "15:00", "23:00"),
    avail(5, "preferred", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],
  "Aaliyah Johnson": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "unavailable"),
    avail(2, "available", "15:00", "23:00"),
    avail(3, "unavailable"),
    avail(4, "available", "15:00", "23:00"),
    avail(5, "available", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],
  "Sam Russo": [
    avail(0, "available", "09:00", "21:00"),
    avail(1, "available", "15:00", "23:00"),
    avail(2, "unavailable"),
    avail(3, "available", "15:00", "23:00"),
    avail(4, "available", "15:00", "23:00"),
    avail(5, "preferred", "07:00", "23:00"),
    avail(6, "preferred", "08:00", "23:00"),
  ],

  // ── Weekday-only ──────────────────────────────────────────────
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

  // ── Additional flex ──────────────────────────────────────────
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

  // Inactive staff get no entries -- they shouldn't appear in generation.
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
    slots.push({
      dayOfWeek: d,
      station: "Grill",
      startTime: "07:00",
      endTime: "15:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
    slots.push({
      dayOfWeek: d,
      station: "Grill",
      startTime: "15:00",
      endTime: "23:00",
      minStaff: 1,
      preferredStaff: 2,
      priority: "high",
    });
  }
  slots.push({
    dayOfWeek: 5,
    station: "Grill",
    startTime: "07:00",
    endTime: "15:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 5,
    station: "Grill",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 2,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 5,
    station: "Grill",
    startTime: "17:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Grill",
    startTime: "08:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Grill",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 2,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Grill",
    startTime: "09:00",
    endTime: "15:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Grill",
    startTime: "15:00",
    endTime: "21:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });

  // SAUTE
  for (const d of monThu) {
    slots.push({
      dayOfWeek: d,
      station: "Saute",
      startTime: "10:00",
      endTime: "18:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
    slots.push({
      dayOfWeek: d,
      station: "Saute",
      startTime: "15:00",
      endTime: "23:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "high",
    });
  }
  slots.push({
    dayOfWeek: 5,
    station: "Saute",
    startTime: "10:00",
    endTime: "18:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 5,
    station: "Saute",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 2,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Saute",
    startTime: "08:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Saute",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 2,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Saute",
    startTime: "10:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Saute",
    startTime: "14:00",
    endTime: "21:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });

  // PREP
  for (const d of monFri) {
    slots.push({
      dayOfWeek: d,
      station: "Prep",
      startTime: "07:00",
      endTime: "13:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "high",
    });
    slots.push({
      dayOfWeek: d,
      station: "Prep",
      startTime: "09:00",
      endTime: "17:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
  }
  slots.push({
    dayOfWeek: 5,
    station: "Prep",
    startTime: "13:00",
    endTime: "19:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Prep",
    startTime: "08:00",
    endTime: "14:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Prep",
    startTime: "11:00",
    endTime: "18:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Prep",
    startTime: "09:00",
    endTime: "15:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });

  // ASSEMBLY
  for (const d of monThu) {
    slots.push({
      dayOfWeek: d,
      station: "Assembly",
      startTime: "10:00",
      endTime: "18:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
    slots.push({
      dayOfWeek: d,
      station: "Assembly",
      startTime: "15:00",
      endTime: "23:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "high",
    });
  }
  slots.push({
    dayOfWeek: 5,
    station: "Assembly",
    startTime: "10:00",
    endTime: "18:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 5,
    station: "Assembly",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 2,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Assembly",
    startTime: "10:00",
    endTime: "18:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Assembly",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Assembly",
    startTime: "10:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Assembly",
    startTime: "14:00",
    endTime: "21:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });

  // EXPO
  for (const d of monThu) {
    slots.push({
      dayOfWeek: d,
      station: "Expo",
      startTime: "10:00",
      endTime: "16:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
    slots.push({
      dayOfWeek: d,
      station: "Expo",
      startTime: "16:00",
      endTime: "23:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "high",
    });
  }
  slots.push({
    dayOfWeek: 5,
    station: "Expo",
    startTime: "10:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 5,
    station: "Expo",
    startTime: "16:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Expo",
    startTime: "10:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "high",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Expo",
    startTime: "16:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "critical",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Expo",
    startTime: "10:00",
    endTime: "18:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });

  // DISH
  for (const d of monFri) {
    slots.push({
      dayOfWeek: d,
      station: "Dish",
      startTime: "07:00",
      endTime: "15:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
    slots.push({
      dayOfWeek: d,
      station: "Dish",
      startTime: "15:00",
      endTime: "23:00",
      minStaff: 1,
      preferredStaff: 1,
      priority: "normal",
    });
  }
  slots.push({
    dayOfWeek: 6,
    station: "Dish",
    startTime: "08:00",
    endTime: "16:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 6,
    station: "Dish",
    startTime: "15:00",
    endTime: "23:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Dish",
    startTime: "09:00",
    endTime: "15:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });
  slots.push({
    dayOfWeek: 0,
    station: "Dish",
    startTime: "14:00",
    endTime: "21:00",
    minStaff: 1,
    preferredStaff: 1,
    priority: "normal",
  });

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

/** Create a Date for a specific day in the test week */
function testDay(dayOffset: number): Date {
  const d = new Date(TEST_WEEK_START);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ============================================================================
// Clerk integration
// ============================================================================
//
// Each active staff member is mirrored as a Clerk user so the mobile
// staff app can sign them in and resolve back to their Staff record via
// `StaffService.getByClerkUserId`. We resolve `clerkUserId` deterministically
// by email so re-running the seed reuses existing users instead of
// piling up orphans.
//
// We talk to Clerk via the `@clerk/backend` package directly rather
// than `@clerk/nextjs/server` because the latter requires a Next.js
// runtime context this CLI script does not have.

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

/**
 * Format a Clerk SDK error for logging. The Backend SDK throws errors
 * whose `.errors` array contains `{ code, message, longMessage }` entries
 * — far more useful than the generic "Unprocessable Entity" message on
 * the parent error object.
 */
function formatClerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (
      err as {
        errors?: Array<{
          code?: string;
          message?: string;
          longMessage?: string;
          meta?: unknown;
        }>;
      }
    ).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map(
          (e) =>
            `[${e.code ?? "?"}] ${e.longMessage ?? e.message ?? "unknown"}`,
        )
        .join("; ");
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Look up a Clerk user by email. Returns null if not found.
 */
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

/**
 * Get-or-create a Clerk user for a staff member, mirroring the end-state
 * of the production invitation -> sign-up flow:
 *
 *   1. UI: manager triggers `inviteStaffToApp` -> Clerk invitation email
 *   2. Recipient signs up -> Clerk fires `user.created` webhook
 *   3. Webhook creates an OrganizationMember and links the Clerk user
 *      to the existing Staff record (sets `invitationStatus: accepted`)
 *
 * The seed short-circuits steps 1+2 by creating the Clerk user directly
 * via the Backend SDK; step 3 is reproduced by the caller, which calls
 * `StaffService.linkClerkUser` (sets invitationStatus to "accepted")
 * and `OrganizationMemberService.create` after this returns.
 *
 * Returns the Clerk user id, or null if anything fails (the seed will
 * still complete with an unlinked Staff record so the rest of the
 * dataset is usable).
 */
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
    logWarn(`Clerk lookup failed for ${staff.email}: ${formatClerkError(err)}`);
    return null;
  }

  const [firstName, ...rest] = staff.name.split(" ");
  const lastName = rest.join(" ") || firstName;

  try {
    // `+clerk_test` in the local-part marks this as a Clerk dev-instance
    // test account, so the email is auto-verified at creation time and
    // the user can immediately sign in via the mobile app using
    // STAFF_PASSWORD (or the fixed OTP `424242` for email-code flows).
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
      `Failed to create Clerk user for ${staff.email}: ${formatClerkError(err)}`,
    );
    return null;
  }
}

/**
 * Delete every Clerk user whose email is in the seeded staff roster.
 * Used by the cleanup phase before we tear down the org membership rows
 * so we don't leak Clerk users across runs.
 */
async function deleteAllSeededClerkUsers(client: ClerkClient): Promise<void> {
  for (const def of STAFF_DEFINITIONS) {
    try {
      const user = await findClerkUserByEmail(client, def.email);
      if (!user) continue;
      await client.users.deleteUser(user.id);
      log(`  Deleted Clerk user ${def.email} (${user.id})`);
    } catch (err) {
      logWarn(
        `Failed to delete Clerk user ${def.email}: ${formatClerkError(err)}`,
      );
    }
  }
}

// ============================================================================
// Legacy index cleanup (carried over from prior seed)
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
      const collections = await db
        .listCollections({ name: collection })
        .toArray();
      if (collections.length === 0) continue;

      const indexes = await db.collection(collection).indexes();
      const legacy = indexes.find(
        (idx: { name?: string }) => idx.name === indexName,
      );
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
  const config = await KitchenConfigService.upsert(
    orgId,
    locationId,
    KITCHEN_CONFIG,
  );
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
  let inactiveCount = 0;
  let clerkLinkedCount = 0;
  let managerMembershipCount = 0;
  let staffMembershipCount = 0;

  const managerRoles = new Set(KITCHEN_CONFIG.managerRoles ?? []);

  for (const def of STAFF_DEFINITIONS) {
    const { isActive, ...createData } = def;
    const staff = await StaffService.create(orgId, locationId, createData);

    if (!isActive) {
      await StaffService.setActive(orgId, locationId, staff.id, false);
      inactiveCount++;
      log(`  ${staff.name} [INACTIVE] -- ${def.roles.join(", ")}`);
      staffIds.set(staff.name, staff.id);
      continue;
    }

    activeCount++;

    // Mirror as a Clerk user + OrganizationMember row so the mobile
    // app can sign in as this staff member and resolve back to their
    // Staff record via getByClerkUserId().
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
          // Unique-index collisions can happen if a previous run
          // partially completed -- treat as informational.
          logWarn(
            `Membership for ${def.email} skipped: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const skillStr = staff.skills
      .map((s) => `${s.station}(${s.proficiency})`)
      .join(", ");
    const flags: string[] = [];
    if (def.hourlyRate === 0) flags.push("$0/hr");
    if (def.maxHoursPerWeek <= 15) flags.push(`max${def.maxHoursPerWeek}h`);
    if (def.minHoursPerWeek >= 30) flags.push(`min${def.minHoursPerWeek}h`);
    if (clerkId) flags.push("clerk-linked");
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";

    log(
      `  ${staff.name} -- ${def.roles.join(", ")} | ${skillStr} | $${def.hourlyRate}/hr${flagStr}`,
    );

    staffIds.set(staff.name, staff.id);
  }

  logSuccess(
    `Created ${activeCount} active + ${inactiveCount} inactive = ${staffIds.size} total ` +
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
    await StaffAvailabilityService.bulkUpsert(
      orgId,
      locationId,
      staffId,
      entries,
    );
    totalAvailEntries += entries.length;

    const availDays = entries.filter(
      (e) => e.preference !== "unavailable",
    ).length;
    const unavailDays = entries.filter(
      (e) => e.preference === "unavailable",
    ).length;
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

  // ── Time-Off Requests ───────────────────────────────────────
  logStep("Creating Time-Off Requests");

  const emilyId = staffIds.get("Emily Nguyen")!;
  const emilyTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: emilyId,
    startDate: testDay(0),
    endDate: testDay(1),
    reason: "Family obligation",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    emilyTimeOff.id,
    "approved",
    clerkUserId,
    "Approved",
  );
  log(
    `  Emily Nguyen: ${DAY_NAMES[0]}-${DAY_NAMES[1]} APPROVED (key Grill cook out)`,
  );

  const mariaId = staffIds.get("Maria Santos")!;
  const mariaTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: mariaId,
    startDate: testDay(2),
    endDate: testDay(4),
    reason: "Vacation",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    mariaTimeOff.id,
    "approved",
    clerkUserId,
    "Enjoy your trip!",
  );
  log(
    `  Maria Santos: ${DAY_NAMES[2]}-${DAY_NAMES[4]} APPROVED (3-day vacation)`,
  );

  const jakeId = staffIds.get("Jake Thompson")!;
  await TimeOffRequestService.create(orgId, locationId, {
    staffId: jakeId,
    startDate: testDay(3),
    endDate: testDay(3),
    reason: "Doctor appointment",
  });
  log(
    `  Jake Thompson: ${DAY_NAMES[3]} PENDING (should NOT filter from generation)`,
  );

  const tylerId = staffIds.get("Tyler Kim")!;
  const tylerTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: tylerId,
    startDate: testDay(1),
    endDate: testDay(1),
    reason: "Personal day",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    tylerTimeOff.id,
    "denied",
    clerkUserId,
    "Short-staffed that day",
  );
  log(
    `  Tyler Kim: ${DAY_NAMES[1]} DENIED (should NOT filter from generation)`,
  );

  const kenjiId = staffIds.get("Kenji Tanaka")!;
  const kenjiTimeOff = await TimeOffRequestService.create(orgId, locationId, {
    staffId: kenjiId,
    startDate: testDay(6),
    endDate: testDay(6),
    reason: "Family event",
  });
  await TimeOffRequestService.updateStatus(
    orgId,
    locationId,
    kenjiTimeOff.id,
    "approved",
    clerkUserId,
    "Approved",
  );
  log(
    `  Kenji Tanaka: ${DAY_NAMES[6]} APPROVED (weekend dishwasher out on Sunday)`,
  );

  logSuccess("Created 5 time-off requests (3 approved, 1 pending, 1 denied)");

  // ── Schedule ────────────────────────────────────────────────
  logStep("Creating DRAFT Schedule for Test Week");
  const schedule = await ScheduleService.getOrCreateForWeek(
    orgId,
    locationId,
    TEST_WEEK_START,
  );
  logSuccess(
    `Created DRAFT schedule for week of ${TEST_WEEK_START.toDateString()} (ID: ${schedule.id})`,
  );

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  SEED COMPLETE");
  console.log("═".repeat(60));
  console.log(`\n  Organization:      ${ORG_NAME} (${orgId})`);
  console.log(`  Location:          Main Kitchen (${locationId})`);
  console.log(`  Kitchen Config:    ${config.stations.join(", ")}`);
  console.log(`  Manager Roles:     ${config.managerRoles.join(", ")}`);
  console.log(
    `  Staff:             ${activeCount} active, ${inactiveCount} inactive`,
  );
  console.log(`  Clerk-linked:      ${clerkLinkedCount}`);
  console.log(
    `  Memberships:       ${managerMembershipCount} manager + ${staffMembershipCount} staff`,
  );
  console.log(`  Availability:      ${totalAvailEntries} entries`);
  console.log(`  Shift Slots:       ${shiftSlots.length} entries`);
  console.log(`  Time-Off Requests: 5 (3 approved, 1 pending, 1 denied)`);
  console.log(
    `  Schedule:          ${schedule.id} (DRAFT, week of ${TEST_WEEK_START.toDateString()})`,
  );
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

    const aiDeleted = await AIUsageService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    AI usage logs deleted: ${aiDeleted}`);

    const shiftsDeleted = await ShiftService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Shifts deleted: ${shiftsDeleted}`);

    const schedulesDeleted = await ScheduleService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Schedules deleted: ${schedulesDeleted}`);

    const laborDeleted = await LaborRequirementService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Shift slots deleted: ${laborDeleted}`);

    const timeOffDeleted = await TimeOffRequestService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Time-off requests deleted: ${timeOffDeleted}`);

    const availDeleted = await StaffAvailabilityService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Availability entries deleted: ${availDeleted}`);

    const staffDeleted = await StaffService.deleteAllByLocation(
      orgId,
      location.id,
    );
    log(`    Staff deleted: ${staffDeleted}`);

    const configDeleted = await KitchenConfigService.deleteByLocation(
      orgId,
      location.id,
    );
    log(`    Kitchen config deleted: ${configDeleted}`);

    await LocationService.delete(orgId, location.id);
    log(`    Location deleted: ${location.name}`);
  }

  const membersDeleted =
    await OrganizationMemberService.deleteAllByOrgId(orgId);
  log(`  Members deleted: ${membersDeleted}`);

  await OrganizationService.delete(orgId);
  log(`  Organization deleted: ${orgName}`);
}

/**
 * Remove ALL organizations owned by a Clerk user. Also deletes the
 * mirrored staff Clerk accounts so we don't leak users across runs.
 */
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

  log(
    `Found ${allOrgs.length} organization(s) for this Clerk user -- removing all`,
  );

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
      ? "  COPPER LADLE SEED -- CLEANUP"
      : "  COPPER LADLE SEED -- SEED",
  );
  console.log("═".repeat(60));

  const clerkUserId = process.env.SEED_CLERK_USER_ID;
  if (!clerkUserId) {
    console.error("\n✗ SEED_CLERK_USER_ID environment variable is not set.");
    console.error("  Add it to apps/web/.env.local:");
    console.error("  SEED_CLERK_USER_ID=user_2xxx...");
    process.exit(1);
  }

  console.log(`\nClerk User ID:  ${clerkUserId}`);
  console.log(
    `MongoDB URI:    ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`,
  );
  console.log(
    `Clerk SDK key:  ${process.env.CLERK_SECRET_KEY ? "[SET]" : "[NOT SET]"}`,
  );
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
