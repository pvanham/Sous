/**
 * Sprint 3.8 End-to-End Verification Script
 *
 * Self-contained: seeds test data, runs all tests, cleans up.
 *
 * Verifies:
 *   1. Zod schema validation -- structural checks on AI output shapes
 *   2. ScheduleValidatorService.validate() -- hard constraint detection
 *      a. Double-booking detection
 *      b. Invalid staff ID detection
 *      c. Max hours exceeded detection
 *      d. Skill mismatch detection
 *      e. Overlap with existing shifts detection
 *      f. Unavailable staff (per-slot candidate) detection
 *   3. Warning detection -- overtime risk, non-preferred station, clopening risk
 *   4. ScheduleValidatorService.stripInvalidAssignments() -- graceful degradation
 *   5. Integration with generateDaySchedule() -- validation in the real pipeline
 *   6. Edge cases -- empty schedule, all valid, zero assignments
 *
 * Run: npm run test:sprint-3.8
 *
 * Required Environment Variables:
 *   - MONGODB_URI: MongoDB connection string (from .env.local)
 *   - OPENAI_API_KEY: OpenAI API key (optional - AI tests skipped if not set)
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { dbConnect } from "../src/lib/db";
import mongoose from "mongoose";

// Service imports (following 3-layer architecture -- tests can call services directly)
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
import { ScheduleValidatorService } from "../src/server/services/schedule-validator.service";
import { SchedulingAgentService } from "../src/server/services/ai/scheduling-agent.service";

// Zod schema imports
import {
  generatedShiftAssignmentSchema,
  unfilledSlotSchema,
  generatedDayScheduleSchema,
} from "../src/lib/validations/generated-schedule.schema";

// Type imports
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import type { StaffDTO } from "../src/types/staff";
import type { ShiftDTO } from "../src/types/shift";
import type {
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  DaySchedulingContext,
} from "../src/types/ai-scheduling";
import type { SlotCandidates } from "../src/types/candidate";

// ============================================================================
// Test Constants
// ============================================================================

const TEST_USER_ID = "user_test_sprint_3_8";

// Test week: Monday, March 9, 2026
const TEST_WEEK_START = new Date(2026, 2, 9, 0, 0, 0, 0);

const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "Sprint 3.8 Test Kitchen",
  stations: ["Grill", "Prep", "Assembly"],
  roles: ["Cook", "Lead Cook"],
  managerRoles: ["Lead Cook"],
  operatingHours: {
    monday: { isOpen: true, open: "09:00", close: "21:00" },
    tuesday: { isOpen: true, open: "09:00", close: "21:00" },
    wednesday: { isOpen: true, open: "09:00", close: "21:00" },
    thursday: { isOpen: true, open: "09:00", close: "21:00" },
    friday: { isOpen: true, open: "09:00", close: "22:00" },
    saturday: { isOpen: true, open: "10:00", close: "22:00" },
    sunday: { isOpen: false, open: "", close: "" },
  },
  minTimeOffAdvanceDays: 0,
  aiSettings: {
    monthlyGenerationLimit: 50,
    subscriptionTier: "free",
  },
  weekStartsOn: "monday",
};

const STAFF_DEFS = [
  {
    name: "Anna Grill",
    email: "anna@test38.com",
    phone: "5550380001",
    roles: ["Lead Cook"],
    skills: [
      { station: "Grill", proficiency: 5 as const },
      { station: "Prep", proficiency: 3 as const },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: ["Grill"],
    certifications: [] as string[],
    hourlyRate: 22,
  },
  {
    name: "Ben Prep",
    email: "ben@test38.com",
    phone: "5550380002",
    roles: ["Cook"],
    skills: [
      { station: "Prep", proficiency: 5 as const },
      { station: "Grill", proficiency: 2 as const },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Prep"],
    certifications: [] as string[],
    hourlyRate: 18,
  },
  {
    name: "Carol Assembly",
    email: "carol@test38.com",
    phone: "5550380003",
    roles: ["Cook"],
    skills: [
      { station: "Assembly", proficiency: 5 as const },
      { station: "Prep", proficiency: 3 as const },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 15,
    preferredStations: ["Assembly"],
    certifications: [] as string[],
    hourlyRate: 18,
  },
  {
    name: "Dave AllRound",
    email: "dave@test38.com",
    phone: "5550380004",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 as const },
      { station: "Prep", proficiency: 3 as const },
      { station: "Assembly", proficiency: 3 as const },
    ],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: [] as string[],
    certifications: [] as string[],
    hourlyRate: 19,
  },
  {
    name: "Eva PartTime",
    email: "eva@test38.com",
    phone: "5550380005",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 2 as const },
      { station: "Prep", proficiency: 4 as const },
    ],
    isActive: true,
    maxHoursPerWeek: 20,
    minHoursPerWeek: 8,
    preferredStations: ["Prep"],
    certifications: [] as string[],
    hourlyRate: 16,
  },
];

// Availability: Mon-Sat, full day (09:00-22:00)
const AVAIL_DEFS: Array<{
  staffName: string;
  entries: Array<{
    dayOfWeek: number;
    availableFrom: string | null;
    availableTo: string | null;
    preference: "preferred" | "available" | "unavailable";
  }>;
}> = [
  {
    staffName: "Anna Grill",
    entries: [1, 2, 3, 4, 5, 6].map((d) => ({
      dayOfWeek: d,
      availableFrom: "09:00",
      availableTo: "22:00",
      preference: "preferred" as const,
    })),
  },
  {
    staffName: "Ben Prep",
    entries: [1, 2, 3, 4, 5].map((d) => ({
      dayOfWeek: d,
      availableFrom: "09:00",
      availableTo: "17:00",
      preference: "available" as const,
    })),
  },
  {
    staffName: "Carol Assembly",
    entries: [1, 2, 3, 4, 5, 6].map((d) => ({
      dayOfWeek: d,
      availableFrom: "09:00",
      availableTo: "22:00",
      preference: "preferred" as const,
    })),
  },
  {
    staffName: "Dave AllRound",
    entries: [1, 2, 3, 4, 5, 6].map((d) => ({
      dayOfWeek: d,
      availableFrom: "09:00",
      availableTo: "22:00",
      preference: "available" as const,
    })),
  },
  {
    staffName: "Eva PartTime",
    entries: [1, 2, 3].map((d) => ({
      dayOfWeek: d,
      availableFrom: "09:00",
      availableTo: "14:00",
      preference: "available" as const,
    })),
  },
];

// Labor requirements: Mon-Wed
const LABOR_DEFS = [
  { dayOfWeek: 1, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "high" as const },
  { dayOfWeek: 1, station: "Prep", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "normal" as const },
  { dayOfWeek: 1, station: "Assembly", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" as const },
  { dayOfWeek: 2, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "high" as const },
  { dayOfWeek: 3, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" as const },
];

// ============================================================================
// Test Infrastructure
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;
const testErrors: string[] = [];

function log(message: string): void {
  console.log(`  ${message}`);
}

function logStep(step: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${step}`);
  console.log(`${"─".repeat(60)}`);
}

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName} -- ${detail}` : testName;
    console.log(`  ✗ FAIL: ${msg}`);
    testErrors.push(msg);
  }
}

function skip(testName: string, reason: string): void {
  totalTests++;
  skippedTests++;
  console.log(`  ⊘ SKIP: ${testName} -- ${reason}`);
}

// ============================================================================
// Seed Data
// ============================================================================

let orgId = "";
let locationId = "";
const staffIds = new Map<string, string>();
let allStaffDTOs: StaffDTO[] = [];

async function seedTestData(): Promise<void> {
  logStep("Seeding test data");

  // Clean up any prior run
  const existingOrg = await OrganizationService.getByOwnerId(TEST_USER_ID);
  if (existingOrg) {
    log("Found existing test data -- cleaning up first...");
    await cleanupTestData();
  }

  // Organization + Location
  const org = await OrganizationService.create(TEST_USER_ID, {
    name: "Sprint 3.8 Test Kitchen Co",
  });
  orgId = org.id;

  const location = await LocationService.create(orgId, {
    name: "Sprint 3.8 Test Location",
    timezone: "America/New_York",
  });
  locationId = location.id;

  await OrganizationMemberService.create({
    orgId,
    locationId: null,
    clerkUserId: TEST_USER_ID,
    role: "owner",
  });
  log(`Organization: ${org.name} (${orgId})`);
  log(`Location: ${location.name} (${locationId})`);

  // Kitchen Config
  await KitchenConfigService.upsert(orgId, locationId, TEST_KITCHEN_CONFIG);
  log("Kitchen config created");

  // Staff
  for (const staffDef of STAFF_DEFS) {
    const { isActive, ...createData } = staffDef;
    const staff = await StaffService.create(orgId, locationId, createData);
    if (!isActive) {
      await StaffService.update(orgId, locationId, staff.id, { isActive: false });
    }
    staffIds.set(staff.name, staff.id);
    log(`  Staff: ${staff.name} (${staff.id})`);
  }

  // Availability
  for (const { staffName, entries } of AVAIL_DEFS) {
    const sId = staffIds.get(staffName);
    if (!sId) continue;
    await StaffAvailabilityService.bulkUpsert(orgId, locationId, sId, entries);
  }
  log("Availability set for all staff");

  // Labor Requirements
  for (const req of LABOR_DEFS) {
    await LaborRequirementService.create(orgId, locationId, req);
  }
  log(`Created ${LABOR_DEFS.length} labor requirements`);

  // Schedule (no shifts yet)
  const schedule = await ScheduleService.getOrCreateForWeek(orgId, locationId, TEST_WEEK_START);
  log(`Schedule created: ${schedule.id}`);

  // Fetch all staff DTOs for validator tests
  allStaffDTOs = await StaffService.list(orgId, locationId);
  log(`Loaded ${allStaffDTOs.length} staff DTOs`);
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanupTestData(): Promise<void> {
  const existingOrg = await OrganizationService.getByOwnerId(TEST_USER_ID);
  if (!existingOrg) return;

  const locations = await LocationService.listByOrgId(existingOrg.id);
  for (const loc of locations) {
    await AIUsageService.deleteAllByLocation(existingOrg.id, loc.id);
    await ShiftService.deleteAllByLocation(existingOrg.id, loc.id);
    await ScheduleService.deleteAllByLocation(existingOrg.id, loc.id);
    await LaborRequirementService.deleteAllByLocation(existingOrg.id, loc.id);
    await TimeOffRequestService.deleteAllByLocation(existingOrg.id, loc.id);
    await StaffAvailabilityService.deleteAllByLocation(existingOrg.id, loc.id);
    await StaffService.deleteAllByLocation(existingOrg.id, loc.id);
    await KitchenConfigService.deleteByLocation(existingOrg.id, loc.id);
    await LocationService.delete(existingOrg.id, loc.id);
  }
  await OrganizationMemberService.deleteAllByOrgId(existingOrg.id);
  await OrganizationService.delete(existingOrg.id);
  log("Cleanup complete");
}

// ============================================================================
// Helper: Build a mock DaySchedulingContext for pure validator tests
// ============================================================================

function buildMockDayContext(overrides?: {
  slots?: SlotCandidates[];
  existingShifts?: ShiftDTO[];
  previousDayClosingShifts?: ShiftDTO[];
}): DaySchedulingContext {
  const annaId = staffIds.get("Anna Grill")!;
  const benId = staffIds.get("Ben Prep")!;
  const carolId = staffIds.get("Carol Assembly")!;
  const daveId = staffIds.get("Dave AllRound")!;

  const defaultSlots: SlotCandidates[] = [
    {
      slot: {
        station: "Grill",
        startTime: "09:00",
        endTime: "17:00",
        minStaff: 1,
        preferredStaff: 2,
        priority: "high",
      },
      candidates: [
        {
          staffId: annaId,
          staffName: "Anna Grill",
          skills: [
            { station: "Grill", proficiency: 5 },
            { station: "Prep", proficiency: 3 },
          ],
          preference: "preferred",
          currentWeekHours: 0,
          maxHoursPerWeek: 40,
          minHoursPerWeek: 0,
          overtimeWarning: false,
          preferredStations: ["Grill"],
          roles: [],
        },
        {
          staffId: daveId,
          staffName: "Dave AllRound",
          skills: [
            { station: "Grill", proficiency: 3 },
            { station: "Prep", proficiency: 3 },
            { station: "Assembly", proficiency: 3 },
          ],
          preference: "available",
          currentWeekHours: 0,
          maxHoursPerWeek: 40,
          minHoursPerWeek: 0,
          overtimeWarning: false,
          preferredStations: [],
          roles: [],
        },
      ],
      hasSufficientCandidates: true,
    },
    {
      slot: {
        station: "Prep",
        startTime: "09:00",
        endTime: "17:00",
        minStaff: 1,
        preferredStaff: 2,
        priority: "normal",
      },
      candidates: [
        {
          staffId: benId,
          staffName: "Ben Prep",
          skills: [
            { station: "Prep", proficiency: 5 },
            { station: "Grill", proficiency: 2 },
          ],
          preference: "available",
          currentWeekHours: 0,
          maxHoursPerWeek: 40,
          minHoursPerWeek: 0,
          overtimeWarning: false,
          preferredStations: ["Prep"],
          roles: [],
        },
        {
          staffId: daveId,
          staffName: "Dave AllRound",
          skills: [
            { station: "Grill", proficiency: 3 },
            { station: "Prep", proficiency: 3 },
            { station: "Assembly", proficiency: 3 },
          ],
          preference: "available",
          currentWeekHours: 0,
          maxHoursPerWeek: 40,
          minHoursPerWeek: 0,
          overtimeWarning: false,
          preferredStations: [],
          roles: [],
        },
      ],
      hasSufficientCandidates: true,
    },
    {
      slot: {
        station: "Assembly",
        startTime: "09:00",
        endTime: "17:00",
        minStaff: 1,
        preferredStaff: 1,
        priority: "normal",
      },
      candidates: [
        {
          staffId: carolId,
          staffName: "Carol Assembly",
          skills: [
            { station: "Assembly", proficiency: 5 },
            { station: "Prep", proficiency: 3 },
          ],
          preference: "preferred",
          currentWeekHours: 0,
          maxHoursPerWeek: 40,
          minHoursPerWeek: 0,
          overtimeWarning: false,
          preferredStations: ["Assembly"],
          roles: [],
        },
      ],
      hasSufficientCandidates: true,
    },
  ];

  return {
    date: TEST_WEEK_START,
    dayOfWeek: 1,
    dayName: "Monday",
    slots: overrides?.slots ?? defaultSlots,
    existingShifts: overrides?.existingShifts ?? [],
    previousDayClosingShifts: overrides?.previousDayClosingShifts ?? [],
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: 5,
    },
  };
}

// ============================================================================
// Test 1: Zod Schema Validation
// ============================================================================

async function testZodSchemas(): Promise<void> {
  logStep("Test 1: Zod Schema Validation");

  // Test 1a: Valid assignment
  const validAssignment = {
    staffId: "abc123",
    staffName: "John Doe",
    station: "Grill",
    startTime: "09:00",
    endTime: "17:00",
    reasoning: "Best available candidate for Grill station.",
  };
  const assignResult = generatedShiftAssignmentSchema.safeParse(validAssignment);
  assert(assignResult.success === true, "Valid assignment passes schema");

  // Test 1b: Invalid assignment -- missing staffId
  const invalidAssignment = {
    staffName: "John Doe",
    station: "Grill",
    startTime: "09:00",
    endTime: "17:00",
    reasoning: "Some reasoning.",
  };
  const invalidResult = generatedShiftAssignmentSchema.safeParse(invalidAssignment);
  assert(invalidResult.success === false, "Missing staffId fails schema");

  // Test 1c: Invalid time format
  const badTime = {
    staffId: "abc123",
    staffName: "John Doe",
    station: "Grill",
    startTime: "9:00",
    endTime: "17:00",
    reasoning: "Reasoning.",
  };
  const badTimeResult = generatedShiftAssignmentSchema.safeParse(badTime);
  assert(badTimeResult.success === false, "Invalid time format (9:00 instead of 09:00) fails schema");

  // Test 1d: Valid unfilled slot
  const validUnfilled = {
    station: "Assembly",
    startTime: "09:00",
    endTime: "17:00",
    needed: 2,
    assigned: 1,
    reason: "Only one candidate available.",
  };
  const unfilledResult = unfilledSlotSchema.safeParse(validUnfilled);
  assert(unfilledResult.success === true, "Valid unfilled slot passes schema");

  // Test 1e: Invalid unfilled slot -- negative needed
  const invalidUnfilled = {
    station: "Assembly",
    startTime: "09:00",
    endTime: "17:00",
    needed: -1,
    assigned: 0,
    reason: "Some reason.",
  };
  const invalidUnfilledResult = unfilledSlotSchema.safeParse(invalidUnfilled);
  assert(invalidUnfilledResult.success === false, "Negative 'needed' fails schema");

  // Test 1f: Valid day schedule
  const validDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [validAssignment],
    unfilledSlots: [],
    notes: "All slots filled.",
  };
  const dayResult = generatedDayScheduleSchema.safeParse(validDaySchedule);
  assert(dayResult.success === true, "Valid day schedule passes schema");

  // Test 1g: Invalid date format
  const badDate = {
    date: "March 9, 2026",
    dayOfWeek: "Monday",
    assignments: [],
    unfilledSlots: [],
    notes: "",
  };
  const badDateResult = generatedDayScheduleSchema.safeParse(badDate);
  assert(badDateResult.success === false, "Invalid date format fails schema");

  // Test 1h: Empty assignments is valid
  const emptyAssignments = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [],
    unfilledSlots: [],
    notes: "No assignments needed.",
  };
  const emptyResult = generatedDayScheduleSchema.safeParse(emptyAssignments);
  assert(emptyResult.success === true, "Empty assignments array passes schema");
}

// ============================================================================
// Test 2: Validator -- Valid Schedule
// ============================================================================

async function testValidSchedule(): Promise<void> {
  logStep("Test 2: Validator -- Valid Schedule");

  const annaId = staffIds.get("Anna Grill")!;
  const benId = staffIds.get("Ben Prep")!;
  const carolId = staffIds.get("Carol Assembly")!;

  const dayContext = buildMockDayContext();

  const validSchedule: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Best for Grill" },
      { staffId: benId, staffName: "Ben Prep", station: "Prep", startTime: "09:00", endTime: "17:00", reasoning: "Best for Prep" },
      { staffId: carolId, staffName: "Carol Assembly", station: "Assembly", startTime: "09:00", endTime: "17:00", reasoning: "Best for Assembly" },
    ],
    unfilledSlots: [],
    notes: "All slots filled.",
  };

  const result = ScheduleValidatorService.validate(validSchedule, dayContext, allStaffDTOs);

  assert(result.valid === true, "Valid schedule passes validation");
  assert(result.errors.length === 0, `No errors (got ${result.errors.length})`);
}

// ============================================================================
// Test 3: Validator -- Double Booking Detection
// ============================================================================

async function testDoubleBooking(): Promise<void> {
  logStep("Test 3: Validator -- Double Booking Detection");

  const annaId = staffIds.get("Anna Grill")!;

  const dayContext = buildMockDayContext();

  // Anna assigned to two overlapping shifts on the same day
  const doubleBooked: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Grill primary" },
      { staffId: annaId, staffName: "Anna Grill", station: "Prep", startTime: "10:00", endTime: "15:00", reasoning: "Also prep" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(doubleBooked, dayContext, allStaffDTOs);

  assert(result.valid === false, "Double-booked schedule fails validation");
  assert(result.errors.length >= 1, `At least 1 error (got ${result.errors.length})`);

  const dbError = result.errors.find((e) => e.type === "double_booking");
  assert(dbError !== undefined, "Error type is 'double_booking'");
  assert(
    dbError?.correctionHint !== undefined && dbError.correctionHint.length > 0,
    "Correction hint is present"
  );
  log(`  Double booking error: ${dbError?.message}`);
}

// ============================================================================
// Test 4: Validator -- Invalid Staff ID Detection
// ============================================================================

async function testInvalidStaffId(): Promise<void> {
  logStep("Test 4: Validator -- Invalid Staff ID Detection");

  const dayContext = buildMockDayContext();

  const invalidStaff: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: "nonexistent-id-12345", staffName: "Ghost Employee", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Invalid" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(invalidStaff, dayContext, allStaffDTOs);

  assert(result.valid === false, "Invalid staff ID fails validation");
  const idError = result.errors.find((e) => e.type === "invalid_staff_id");
  assert(idError !== undefined, "Error type is 'invalid_staff_id'");
  assert(idError?.staffId === "nonexistent-id-12345", "Error references the correct staff ID");
  log(`  Invalid staff ID error: ${idError?.message}`);
}

// ============================================================================
// Test 5: Validator -- Max Hours Exceeded Detection
// ============================================================================

async function testMaxHoursExceeded(): Promise<void> {
  logStep("Test 5: Validator -- Max Hours Exceeded");

  const evaId = staffIds.get("Eva PartTime")!;

  // Eva has maxHoursPerWeek: 20
  // Create a context where Eva already has 16 hours and we're assigning 8 more (= 24 > 20)
  const existingShifts: ShiftDTO[] = [
    {
      id: "existing-shift-1",
      orgId,
      locationId,
      scheduleId: "sched-1",
      staffId: evaId,
      start: new Date(2026, 2, 9, 9, 0),  // Monday 09:00
      end: new Date(2026, 2, 9, 17, 0),   // Monday 17:00 (8 hours)
      station: "Prep",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "existing-shift-2",
      orgId,
      locationId,
      scheduleId: "sched-1",
      staffId: evaId,
      start: new Date(2026, 2, 10, 9, 0),  // Tuesday 09:00
      end: new Date(2026, 2, 10, 17, 0),   // Tuesday 17:00 (8 hours = 16 total)
      station: "Prep",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  // Eva is a candidate for Prep on Wednesday with 16 hours existing
  const dayContext = buildMockDayContext({
    existingShifts,
    slots: [
      {
        slot: {
          station: "Prep",
          startTime: "09:00",
          endTime: "17:00",
          minStaff: 1,
          preferredStaff: 1,
          priority: "normal",
        },
        candidates: [
          {
            staffId: evaId,
            staffName: "Eva PartTime",
            skills: [
              { station: "Prep", proficiency: 4 },
              { station: "Grill", proficiency: 2 },
            ],
            preference: "available",
            currentWeekHours: 16,
            maxHoursPerWeek: 20,
            minHoursPerWeek: 0,
            overtimeWarning: true,
            preferredStations: ["Prep"],
            roles: [],
          },
        ],
        hasSufficientCandidates: true,
      },
    ],
  });

  // Assign Eva to another 8-hour shift (total: 24 > 20 max)
  const overworked: GeneratedDaySchedule = {
    date: "2026-03-11",  // Wednesday
    dayOfWeek: "Wednesday",
    assignments: [
      { staffId: evaId, staffName: "Eva PartTime", station: "Prep", startTime: "09:00", endTime: "17:00", reasoning: "Only candidate" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(overworked, dayContext, allStaffDTOs);

  assert(result.valid === false, "Max hours exceeded fails validation");
  const maxError = result.errors.find((e) => e.type === "max_hours_exceeded");
  assert(maxError !== undefined, "Error type is 'max_hours_exceeded'");
  assert(maxError?.staffId === evaId, "Error references Eva");
  log(`  Max hours error: ${maxError?.message}`);
}

// ============================================================================
// Test 6: Validator -- Skill Mismatch Detection
// ============================================================================

async function testSkillMismatch(): Promise<void> {
  logStep("Test 6: Validator -- Skill Mismatch");

  const benId = staffIds.get("Ben Prep")!;

  // Ben has skills for Prep and Grill, but NOT Assembly
  const dayContext = buildMockDayContext();

  const skillMismatch: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: benId, staffName: "Ben Prep", station: "Assembly", startTime: "09:00", endTime: "17:00", reasoning: "Assigned to Assembly" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(skillMismatch, dayContext, allStaffDTOs);

  assert(result.valid === false, "Skill mismatch fails validation");
  const skillError = result.errors.find((e) => e.type === "skill_mismatch");
  assert(skillError !== undefined, "Error type is 'skill_mismatch'");
  assert(skillError?.staffId === benId, "Error references Ben");
  log(`  Skill mismatch error: ${skillError?.message}`);
}

// ============================================================================
// Test 7: Validator -- Overlap with Existing Shifts
// ============================================================================

async function testOverlapWithExisting(): Promise<void> {
  logStep("Test 7: Validator -- Overlap with Existing Shifts");

  const annaId = staffIds.get("Anna Grill")!;

  // Anna already has a shift on this day
  const existingShifts: ShiftDTO[] = [
    {
      id: "existing-overlap",
      orgId,
      locationId,
      scheduleId: "sched-1",
      staffId: annaId,
      start: new Date(2026, 2, 9, 12, 0),  // Monday 12:00
      end: new Date(2026, 2, 9, 17, 0),    // Monday 17:00
      station: "Grill",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const dayContext = buildMockDayContext({ existingShifts });

  // Try to assign Anna to an overlapping shift
  const overlapping: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "14:00", reasoning: "Morning shift" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(overlapping, dayContext, allStaffDTOs);

  assert(result.valid === false, "Overlap with existing shift fails validation");
  const overlapError = result.errors.find((e) => e.type === "overlap");
  assert(overlapError !== undefined, "Error type is 'overlap'");
  assert(overlapError?.staffId === annaId, "Error references Anna");
  log(`  Overlap error: ${overlapError?.message}`);
}

// ============================================================================
// Test 8: Warnings -- Overtime Risk, Non-Preferred Station, Clopening Risk
// ============================================================================

async function testWarnings(): Promise<void> {
  logStep("Test 8: Warning Detection");

  const annaId = staffIds.get("Anna Grill")!;
  const benId = staffIds.get("Ben Prep")!;

  // -- Warning 8a: Preferred station stats --
  // Ben prefers "Prep" but we assign him to "Grill" -- validator returns
  // preferred station match stats instead of non_preferred_station warnings
  const dayContext = buildMockDayContext();

  const nonPreferred: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: benId, staffName: "Ben Prep", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Assigned to non-preferred" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const nonPrefResult = ScheduleValidatorService.validate(nonPreferred, dayContext, allStaffDTOs);
  assert(
    nonPrefResult.totalAssignmentsWithPreference === 1,
    "Ben has preferred stations so totalAssignmentsWithPreference should be 1"
  );
  assert(
    nonPrefResult.preferredStationMatches === 0,
    "Ben is on non-preferred station so preferredStationMatches should be 0"
  );

  // -- Warning 8b: Overtime risk --
  // Anna has maxHoursPerWeek: 40. Threshold is now 90% (36h).
  // Give her 30 existing hours, propose 8 more = 38, which is 95% of 40 = warning
  const overtimeExisting: ShiftDTO[] = [];
  // Create synthetic existing shifts: 30 hours total for Anna
  // Mon: 9-17 (8h), Tue: 9-17 (8h), Wed: 9-17 (8h), Thu: 9-15 (6h) = 30h
  for (let d = 0; d < 4; d++) {
    const h = d === 3 ? 6 : 8;
    overtimeExisting.push({
      id: `ot-shift-${d}`,
      orgId,
      locationId,
      scheduleId: "sched-1",
      staffId: annaId,
      start: new Date(2026, 2, 9 + d, 9, 0),
      end: new Date(2026, 2, 9 + d, 9 + h, 0),
      station: "Grill",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const overtimeContext = buildMockDayContext({ existingShifts: overtimeExisting });

  // Assign Anna 8 more hours on Friday (total: 38/40 = 95%)
  const overtimeSchedule: GeneratedDaySchedule = {
    date: "2026-03-13",  // Friday
    dayOfWeek: "Friday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Grill shift" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const otResult = ScheduleValidatorService.validate(overtimeSchedule, overtimeContext, allStaffDTOs);
  const otWarning = otResult.warnings.find(
    (w) => w.type === "overtime_risk" && w.staffId === annaId
  );
  assert(
    otWarning !== undefined,
    "Overtime risk warning detected for Anna at 95% of max hours"
  );
  if (otWarning) {
    log(`  Overtime warning: ${otWarning.message}`);
  }

  // -- Warning 8c: Clopening risk --
  // Anna closed at 21:00 previous day, opens at 09:00 today (12h gap >= 10h, NOT a clopening)
  // Use 22:00 close for < 10h gap
  const closingShifts: ShiftDTO[] = [
    {
      id: "close-shift",
      orgId,
      locationId,
      scheduleId: "sched-1",
      staffId: annaId,
      start: new Date(2026, 2, 8, 17, 0),  // Sunday 17:00
      end: new Date(2026, 2, 8, 23, 30),    // Sunday 23:30 -- gap to 09:00 Monday = 9.5h < 10h
      station: "Grill",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const clopeningContext = buildMockDayContext({
    previousDayClosingShifts: closingShifts,
  });

  // Assign Anna to open at 09:00 on Monday
  const clopeningSchedule: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Morning shift" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const clopResult = ScheduleValidatorService.validate(clopeningSchedule, clopeningContext, allStaffDTOs);
  const clopWarning = clopResult.warnings.find(
    (w) => w.type === "clopening_risk" && w.staffId === annaId
  );
  assert(
    clopWarning !== undefined,
    "Clopening risk warning detected for Anna (23:30 close -> 09:00 open = 9.5h gap)"
  );
  if (clopWarning) {
    log(`  Clopening warning: ${clopWarning.message}`);
  }
}

// ============================================================================
// Test 9: stripInvalidAssignments
// ============================================================================

async function testStripInvalidAssignments(): Promise<void> {
  logStep("Test 9: stripInvalidAssignments()");

  const annaId = staffIds.get("Anna Grill")!;
  const benId = staffIds.get("Ben Prep")!;

  const schedule: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Valid" },
      { staffId: "invalid-id", staffName: "Ghost", station: "Prep", startTime: "09:00", endTime: "17:00", reasoning: "Invalid" },
      { staffId: benId, staffName: "Ben Prep", station: "Prep", startTime: "09:00", endTime: "17:00", reasoning: "Valid" },
    ],
    unfilledSlots: [],
    notes: "Original notes.",
  };

  // Simulate errors on index 1 (the invalid one)
  const stripped = ScheduleValidatorService.stripInvalidAssignments(schedule, [
    {
      type: "invalid_staff_id",
      staffId: "invalid-id",
      staffName: "Ghost",
      shiftIndex: 1,
      message: "Invalid staff ID",
      correctionHint: "Remove Ghost",
    },
  ]);

  assert(stripped.assignments.length === 2, `Stripped to ${stripped.assignments.length} assignments (expected 2)`);
  assert(stripped.assignments[0].staffId === annaId, "Anna's assignment preserved");
  assert(stripped.assignments[1].staffId === benId, "Ben's assignment preserved");
  assert(stripped.notes.includes("1 invalid assignment(s) removed"), "Notes updated with removal info");
}

// ============================================================================
// Test 10: Empty Schedule is Valid
// ============================================================================

async function testEmptyScheduleValid(): Promise<void> {
  logStep("Test 10: Empty Schedule is Valid");

  const dayContext = buildMockDayContext();

  const emptySchedule: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [],
    unfilledSlots: [
      { station: "Grill", startTime: "09:00", endTime: "17:00", needed: 2, assigned: 0, reason: "No candidates" },
    ],
    notes: "All slots unfilled.",
  };

  const result = ScheduleValidatorService.validate(emptySchedule, dayContext, allStaffDTOs);

  assert(result.valid === true, "Empty schedule (no assignments) is valid");
  assert(result.errors.length === 0, "No errors on empty schedule");
  assert(result.warnings.length === 0, "No warnings on empty schedule");
}

// ============================================================================
// Test 11: Multiple Errors on One Schedule
// ============================================================================

async function testMultipleErrors(): Promise<void> {
  logStep("Test 11: Multiple Errors on One Schedule");

  const annaId = staffIds.get("Anna Grill")!;
  const benId = staffIds.get("Ben Prep")!;

  const dayContext = buildMockDayContext();

  // Schedule with: double-booking Anna + Ben on Assembly (skill mismatch)
  const multiError: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: annaId, staffName: "Anna Grill", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "First" },
      { staffId: annaId, staffName: "Anna Grill", station: "Prep", startTime: "10:00", endTime: "15:00", reasoning: "Double-booked" },
      { staffId: benId, staffName: "Ben Prep", station: "Assembly", startTime: "09:00", endTime: "17:00", reasoning: "No Assembly skill" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(multiError, dayContext, allStaffDTOs);

  assert(result.valid === false, "Schedule with multiple errors fails");
  assert(result.errors.length >= 2, `Multiple errors detected (got ${result.errors.length})`);

  const hasDoubleBooking = result.errors.some((e) => e.type === "double_booking");
  const hasSkillMismatch = result.errors.some((e) => e.type === "skill_mismatch");
  assert(hasDoubleBooking, "Double booking error detected");
  assert(hasSkillMismatch, "Skill mismatch error detected");

  log(`  Total errors: ${result.errors.length}`);
  for (const err of result.errors) {
    log(`    - [${err.type}] ${err.message}`);
  }
}

// ============================================================================
// Test 12: Integration -- generateDaySchedule with Validation
// ============================================================================

async function testIntegration(): Promise<void> {
  logStep("Test 12: Integration with generateDaySchedule() (SKIPPED -- requires presolvedBase)");
  skip(
    "generateDaySchedule integration test",
    "generateDaySchedule now requires a presolvedBase from the week-level CP solver. " +
    "Single-day standalone generation is no longer supported."
  );
}

// ============================================================================
// Test 13: generateWeekSchedule includes warnings
// ============================================================================

async function testWeekScheduleWarnings(): Promise<void> {
  logStep("Test 13: generateWeekSchedule() includes warnings");

  const ctx = await SchedulingAgentService.buildSchedulingContext(
    orgId,
    locationId,
    TEST_USER_ID,
    TEST_WEEK_START
  );

  const result = await SchedulingAgentService.generateWeekSchedule(ctx);

  assert(result.warnings !== undefined, "Week schedule has warnings array");
  assert(Array.isArray(result.warnings), "Warnings is an array");
  assert(result.days.length === 7, `Generated 7 day results`);
  assert(result.metadata.totalShiftsCreated > 0, `Shifts created: ${result.metadata.totalShiftsCreated}`);

  log(`  Total warnings: ${result.warnings.length}`);
  log(`  Summary: ${result.summary}`);

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      log(`    [${w.type}] ${w.staffName}: ${w.message}`);
    }
  }
}

// ============================================================================
// Test 14: Unavailable Staff (Per-Slot Candidate Check)
// ============================================================================

async function testUnavailableStaff(): Promise<void> {
  logStep("Test 14: Unavailable Staff (Per-Slot)");

  const carolId = staffIds.get("Carol Assembly")!;

  // Carol is only a candidate for Assembly slot, not Grill
  const dayContext = buildMockDayContext();

  const wrongSlot: GeneratedDaySchedule = {
    date: "2026-03-09",
    dayOfWeek: "Monday",
    assignments: [
      { staffId: carolId, staffName: "Carol Assembly", station: "Grill", startTime: "09:00", endTime: "17:00", reasoning: "Wrong slot" },
    ],
    unfilledSlots: [],
    notes: "",
  };

  const result = ScheduleValidatorService.validate(wrongSlot, dayContext, allStaffDTOs);

  assert(result.valid === false, "Unavailable staff for slot fails validation");
  const unavailError = result.errors.find((e) => e.type === "unavailable_staff");
  assert(unavailError !== undefined, "Error type is 'unavailable_staff'");
  assert(unavailError?.staffId === carolId, "Error references Carol");
  log(`  Unavailable staff error: ${unavailError?.message}`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  SPRINT 3.8 END-TO-END VERIFICATION");
  console.log("  Schedule Validator Service (Validator Layer)");
  console.log("═".repeat(60));
  console.log(`\nTest User ID: ${TEST_USER_ID}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? "[SET]" : "[NOT SET]"}`);
  console.log(`OpenAI Key: ${process.env.OPENAI_API_KEY ? "[SET]" : "[NOT SET - will use fallback]"}`);

  if (!process.env.MONGODB_URI) {
    console.error("\n✗ MONGODB_URI environment variable is not set");
    process.exit(1);
  }

  try {
    await dbConnect();
    log("Database connected");

    // Seed
    await seedTestData();

    // Tests
    await testZodSchemas();
    await testValidSchedule();
    await testDoubleBooking();
    await testInvalidStaffId();
    await testMaxHoursExceeded();
    await testSkillMismatch();
    await testOverlapWithExisting();
    await testWarnings();
    await testStripInvalidAssignments();
    await testEmptyScheduleValid();
    await testMultipleErrors();
    await testUnavailableStaff();
    await testIntegration();
    await testWeekScheduleWarnings();

    // Results
    console.log(`\n${"═".repeat(60)}`);
    console.log("  RESULTS");
    console.log(`${"═".repeat(60)}`);
    console.log(`  Total:   ${totalTests}`);
    console.log(`  Passed:  ${passedTests}`);
    console.log(`  Failed:  ${failedTests}`);
    console.log(`  Skipped: ${skippedTests}`);

    if (testErrors.length > 0) {
      console.log(`\n  FAILURES:`);
      for (const e of testErrors) {
        console.log(`    - ${e}`);
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    if (failedTests === 0) {
      console.log("  ✓ ALL TESTS PASSED");
    } else {
      console.log(`  ✗ ${failedTests} TEST(S) FAILED`);
    }
    console.log(`${"═".repeat(60)}\n`);
  } catch (error) {
    console.error(
      "\n✗ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    // Cleanup
    logStep("Final Cleanup");
    try {
      await cleanupTestData();
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
    await mongoose.disconnect();
    log("Database disconnected");
  }

  if (failedTests > 0) {
    process.exitCode = 1;
  }
}

main();
