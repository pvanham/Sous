/**
 * Sprint 3.7 End-to-End Verification Script
 *
 * Self-contained: seeds test data, runs all tests, cleans up.
 *
 * Verifies:
 *   1. SchedulingAgentService.buildSchedulingContext -- parallel data fetch
 *   2. Prompt builder -- buildSystemPrompt() and buildDayUserPrompt()
 *   3. Algorithmic fallback -- deterministic assignment logic
 *   4. generateDaySchedule -- AI generation or fallback
 *   5. generateWeekSchedule -- day-by-day orchestration and shift accumulation
 *   6. Clopening detection -- previous day closing shifts are passed
 *   7. Edge cases -- closed days, empty requirements, no candidates
 *
 * Run: npm run test:sprint-3.7
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
import { SchedulingAgentService } from "../src/server/services/ai/scheduling-agent.service";

// Prompt builder imports
import {
  buildSystemPrompt,
  buildDayUserPrompt,
} from "../src/server/services/ai/prompts/schedule-generation";

// Type imports
import type { KitchenConfigInput } from "../src/lib/validations/kitchen-config.schema";
import type { SlotCandidates } from "../src/types/candidate";
import type { DaySchedulingContext } from "../src/types/ai-scheduling";

// ============================================================================
// Test Constants
// ============================================================================

const TEST_USER_ID = "user_test_sprint_3_7";

// Test week: Monday, March 2, 2026
const TEST_WEEK_START = new Date(2026, 2, 2, 0, 0, 0, 0);

const TEST_KITCHEN_CONFIG: KitchenConfigInput = {
  name: "Sprint 3.7 Test Kitchen",
  stations: ["Grill", "Prep", "Assembly"],
  roles: ["Cook", "Lead Cook"],
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
};

const STAFF_DEFS = [
  {
    name: "Anna Grill",
    email: "anna@test37.com",
    phone: "5550370001",
    roles: ["Lead Cook"],
    skills: [
      { station: "Grill", proficiency: 5 },
      { station: "Prep", proficiency: 3 },
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
    email: "ben@test37.com",
    phone: "5550370002",
    roles: ["Cook"],
    skills: [
      { station: "Prep", proficiency: 5 },
      { station: "Grill", proficiency: 2 },
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
    email: "carol@test37.com",
    phone: "5550370003",
    roles: ["Cook"],
    skills: [
      { station: "Assembly", proficiency: 5 },
      { station: "Prep", proficiency: 3 },
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
    email: "dave@test37.com",
    phone: "5550370004",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 3 },
      { station: "Prep", proficiency: 3 },
      { station: "Assembly", proficiency: 3 },
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
    email: "eva@test37.com",
    phone: "5550370005",
    roles: ["Cook"],
    skills: [
      { station: "Grill", proficiency: 2 },
      { station: "Prep", proficiency: 4 },
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

// Labor requirements: Mon-Fri
const LABOR_DEFS = [
  // Monday (dayOfWeek = 1)
  { dayOfWeek: 1, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "high" as const },
  { dayOfWeek: 1, station: "Prep", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "normal" as const },
  { dayOfWeek: 1, station: "Assembly", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" as const },
  // Tuesday (dayOfWeek = 2)
  { dayOfWeek: 2, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "high" as const },
  { dayOfWeek: 2, station: "Prep", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 2, priority: "normal" as const },
  { dayOfWeek: 2, station: "Assembly", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" as const },
  // Wednesday (dayOfWeek = 3) -- just Grill
  { dayOfWeek: 3, station: "Grill", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" as const },
];

// ============================================================================
// Test Infrastructure
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;
const errors: string[] = [];

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
    errors.push(msg);
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
    name: "Sprint 3.7 Test Kitchen Co",
  });
  orgId = org.id;

  const location = await LocationService.create(orgId, {
    name: "Sprint 3.7 Test Location",
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
// Test 1: buildSchedulingContext
// ============================================================================

async function testBuildSchedulingContext(): Promise<void> {
  logStep("Test 1: buildSchedulingContext()");

  const ctx = await SchedulingAgentService.buildSchedulingContext(
    orgId,
    locationId,
    TEST_USER_ID,
    TEST_WEEK_START
  );

  assert(ctx.orgId === orgId, "orgId matches");
  assert(ctx.locationId === locationId, "locationId matches");
  assert(ctx.clerkUserId === TEST_USER_ID, "clerkUserId matches");
  assert(ctx.weekStart.getTime() === TEST_WEEK_START.getTime(), "weekStart matches");

  // Config
  assert(ctx.config !== null && ctx.config !== undefined, "config is not null");
  assert(ctx.config.stations.length === 3, `config has ${ctx.config.stations.length} stations (expected 3)`);
  assert(ctx.config.operatingHours !== undefined, "config has operatingHours");

  // Staff (all 5 defined, but only 5 active since all are active in this test)
  assert(ctx.staff.length === 5, `staff count: ${ctx.staff.length} (expected 5)`);

  // Labor requirements
  assert(
    ctx.laborRequirements.length === LABOR_DEFS.length,
    `labor requirements: ${ctx.laborRequirements.length} (expected ${LABOR_DEFS.length})`
  );

  // Schedule
  assert(ctx.schedule !== null && ctx.schedule !== undefined, "schedule record exists");
  assert(ctx.schedule.status === "DRAFT", "schedule status is DRAFT");

  // Existing shifts (should be empty -- no shifts seeded)
  assert(ctx.existingShifts.length === 0, `existing shifts: ${ctx.existingShifts.length} (expected 0)`);
}

// ============================================================================
// Test 2: Prompt Builder
// ============================================================================

async function testPromptBuilder(): Promise<void> {
  logStep("Test 2: Prompt Builder");

  // System prompt
  const systemPrompt = buildSystemPrompt();
  assert(systemPrompt.length > 100, `system prompt is substantial (${systemPrompt.length} chars)`);
  assert(systemPrompt.includes("Sous"), "system prompt mentions Sous");
  assert(systemPrompt.includes("VALID CANDIDATES"), "system prompt mentions VALID CANDIDATES");
  assert(systemPrompt.includes("staffId"), "system prompt mentions staffId");
  assert(systemPrompt.includes("unfilledSlots"), "system prompt mentions unfilledSlots");
  assert(systemPrompt.includes("clopening") || systemPrompt.includes("Clopening") || systemPrompt.includes("closing"), "system prompt mentions clopening avoidance");
  assert(systemPrompt.includes("JSON"), "system prompt mentions JSON output");

  // Day user prompt
  const mockSlots: SlotCandidates[] = [
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
          staffId: "staff-1",
          staffName: "Anna Grill",
          skills: [{ station: "Grill", proficiency: 5 }],
          preference: "preferred",
          currentWeekHours: 8,
          maxHoursPerWeek: 40,
          overtimeWarning: false,
          preferredStations: ["Grill"],
        },
        {
          staffId: "staff-2",
          staffName: "Dave AllRound",
          skills: [{ station: "Grill", proficiency: 3 }],
          preference: "available",
          currentWeekHours: 16,
          maxHoursPerWeek: 40,
          overtimeWarning: false,
          preferredStations: [],
        },
      ],
      hasSufficientCandidates: true,
    },
  ];

  const dayCtx: DaySchedulingContext = {
    date: TEST_WEEK_START,
    dayOfWeek: 1,
    dayName: "Monday",
    slots: mockSlots,
    existingShifts: [],
    previousDayClosingShifts: [],
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: 5,
    },
  };

  const userPrompt = buildDayUserPrompt(dayCtx);
  assert(userPrompt.length > 50, `user prompt is substantial (${userPrompt.length} chars)`);
  assert(userPrompt.includes("Monday"), "user prompt includes day name");
  assert(userPrompt.includes("Grill"), "user prompt includes station name");
  assert(userPrompt.includes("staff-1"), "user prompt includes staff IDs");
  assert(userPrompt.includes("Anna Grill"), "user prompt includes staff names");
  assert(userPrompt.includes("5/5"), "user prompt includes proficiency");
  assert(userPrompt.includes("09:00"), "user prompt includes times");

  // Test with previous day closing shifts
  const dayCtxWithClopening: DaySchedulingContext = {
    ...dayCtx,
    previousDayClosingShifts: [
      {
        id: "shift-prev",
        orgId,
        locationId,
        scheduleId: "sched-1",
        staffId: "staff-1",
        start: new Date(2026, 2, 1, 17, 0),
        end: new Date(2026, 2, 1, 21, 0),
        station: "Grill",
        notes: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  const userPromptClopening = buildDayUserPrompt(dayCtxWithClopening);
  assert(
    userPromptClopening.includes("PREVIOUS DAY CLOSING SHIFTS"),
    "user prompt includes clopening section when closing shifts exist"
  );
  assert(
    userPromptClopening.includes("staff-1"),
    "clopening section includes the staff ID"
  );
}

// ============================================================================
// Test 3: Algorithmic Fallback
// ============================================================================

async function testAlgorithmicFallback(): Promise<void> {
  logStep("Test 3: Algorithmic Fallback");

  // Build a real day context using CandidateService
  const ctx = await SchedulingAgentService.buildSchedulingContext(
    orgId,
    locationId,
    TEST_USER_ID,
    TEST_WEEK_START
  );

  // Monday requirements
  const mondayRequirements = ctx.laborRequirements.filter(
    (r) => r.dayOfWeek === 1
  );

  const { CandidateService } = await import(
    "../src/server/services/candidate.service"
  );

  const slotCandidates = await CandidateService.getCandidatesForDay(
    orgId,
    locationId,
    TEST_WEEK_START,
    mondayRequirements,
    ctx.existingShifts
  );

  assert(slotCandidates.length === mondayRequirements.length, `got ${slotCandidates.length} slot candidate groups for ${mondayRequirements.length} requirements`);

  // Build day context for fallback
  const dayCtx: DaySchedulingContext = {
    date: TEST_WEEK_START,
    dayOfWeek: 1,
    dayName: "Monday",
    slots: slotCandidates,
    existingShifts: ctx.existingShifts,
    previousDayClosingShifts: [],
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: ctx.staff.length,
    },
  };

  // Test fallback via generateDaySchedule by triggering it with a fake error
  // Instead, we'll test the fallback path by calling generateDaySchedule
  // which will fall back if OpenAI key is missing
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  if (!hasApiKey) {
    // Without API key, generateDaySchedule should fall back
    const result = await SchedulingAgentService.generateDaySchedule(dayCtx, {
      orgId,
      locationId,
      clerkUserId: TEST_USER_ID,
      action: "schedule_generation",
    });

    assert(result.usedFallback === true, "used fallback when no API key");
    assert(result.daySchedule.assignments.length > 0, `fallback generated ${result.daySchedule.assignments.length} assignments`);
    assert(
      result.daySchedule.notes.includes("basic assignment") ||
        result.daySchedule.notes.includes("AI unavailable"),
      "fallback notes mention AI unavailable"
    );

    // Verify no double-booking: same staff should not have overlapping assignments
    const staffSlots = new Map<string, string[]>();
    let noOverlap = true;
    for (const a of result.daySchedule.assignments) {
      const existing = staffSlots.get(a.staffId) ?? [];
      for (const range of existing) {
        const [eStart, eEnd] = range.split("-");
        // Simple overlap check
        if (a.startTime < eEnd && a.endTime > eStart) {
          noOverlap = false;
          break;
        }
      }
      existing.push(`${a.startTime}-${a.endTime}`);
      staffSlots.set(a.staffId, existing);
    }
    assert(noOverlap, "fallback has no overlapping assignments for same staff");

    // Verify all staffIds are from candidate lists
    const allValidIds = new Set<string>();
    for (const sc of slotCandidates) {
      for (const c of sc.candidates) {
        allValidIds.add(c.staffId);
      }
    }
    const allFromCandidates = result.daySchedule.assignments.every((a) =>
      allValidIds.has(a.staffId)
    );
    assert(allFromCandidates, "all fallback assignments use valid candidate IDs");

    // Each assignment should have the fallback reasoning
    const allHaveFallbackReasoning = result.daySchedule.assignments.every(
      (a) => a.reasoning.includes("fallback") || a.reasoning.includes("algorithmic")
    );
    assert(allHaveFallbackReasoning, "all fallback assignments have fallback reasoning text");
  } else {
    skip("Fallback via missing API key", "API key is present -- testing AI path instead");

    // With API key, test actual AI generation
    const result = await SchedulingAgentService.generateDaySchedule(dayCtx, {
      orgId,
      locationId,
      clerkUserId: TEST_USER_ID,
      action: "schedule_generation",
    });

    assert(result.usedFallback === false, "did NOT use fallback with API key");
    assert(result.daySchedule.assignments.length > 0, `AI generated ${result.daySchedule.assignments.length} assignments`);
    assert(result.tokenUsage.totalTokens > 0, `token usage tracked: ${result.tokenUsage.totalTokens} tokens`);

    // Verify staffIds are from candidate lists
    const allValidIds = new Set<string>();
    for (const sc of slotCandidates) {
      for (const c of sc.candidates) {
        allValidIds.add(c.staffId);
      }
    }
    const allFromCandidates = result.daySchedule.assignments.every((a) =>
      allValidIds.has(a.staffId)
    );
    assert(allFromCandidates, "all AI assignments use valid candidate IDs");

    // Verify reasoning is present
    const allHaveReasoning = result.daySchedule.assignments.every(
      (a) => a.reasoning && a.reasoning.length > 0
    );
    assert(allHaveReasoning, "all AI assignments have reasoning");
  }
}

// ============================================================================
// Test 4: generateWeekSchedule
// ============================================================================

async function testGenerateWeekSchedule(): Promise<void> {
  logStep("Test 4: generateWeekSchedule()");

  const ctx = await SchedulingAgentService.buildSchedulingContext(
    orgId,
    locationId,
    TEST_USER_ID,
    TEST_WEEK_START
  );

  const result = await SchedulingAgentService.generateWeekSchedule(ctx);

  // Should have 7 days (Mon-Sun)
  assert(result.days.length === 7, `generated ${result.days.length} day results (expected 7)`);

  // Sunday should be empty (kitchen closed)
  const sunday = result.days.find((d) => d.dayOfWeek === "Sunday");
  assert(sunday !== undefined, "Sunday day result exists");
  assert(
    sunday!.assignments.length === 0,
    `Sunday has ${sunday!.assignments.length} assignments (expected 0 -- closed)`
  );
  assert(
    sunday!.notes.includes("closed") || sunday!.notes.includes("No labor"),
    "Sunday notes mention closed or no requirements"
  );

  // Monday should have assignments (has labor requirements)
  const monday = result.days.find((d) => d.dayOfWeek === "Monday");
  assert(monday !== undefined, "Monday day result exists");
  assert(
    monday!.assignments.length > 0,
    `Monday has ${monday!.assignments.length} assignments (expected > 0)`
  );

  // Tuesday should have assignments
  const tuesday = result.days.find((d) => d.dayOfWeek === "Tuesday");
  assert(tuesday !== undefined, "Tuesday day result exists");
  assert(
    tuesday!.assignments.length > 0,
    `Tuesday has ${tuesday!.assignments.length} assignments (expected > 0)`
  );

  // Wednesday should have assignments (just Grill)
  const wednesday = result.days.find((d) => d.dayOfWeek === "Wednesday");
  assert(wednesday !== undefined, "Wednesday day result exists");
  assert(
    wednesday!.assignments.length > 0,
    `Wednesday has ${wednesday!.assignments.length} assignments (expected > 0)`
  );

  // Thursday-Saturday: no labor requirements, should be empty
  const thursday = result.days.find((d) => d.dayOfWeek === "Thursday");
  assert(thursday !== undefined, "Thursday day result exists");
  assert(
    thursday!.assignments.length === 0,
    `Thursday has ${thursday!.assignments.length} assignments (expected 0 -- no labor requirements)`
  );

  // Metadata
  assert(result.metadata.totalShiftsCreated > 0, `totalShiftsCreated: ${result.metadata.totalShiftsCreated}`);
  assert(result.metadata.generationTimeMs > 0, `generationTimeMs: ${result.metadata.generationTimeMs}ms`);
  assert(result.summary.length > 0, "summary is not empty");

  const hasApiKey = !!process.env.OPENAI_API_KEY;
  if (!hasApiKey) {
    assert(result.metadata.usedFallback === true, "metadata shows fallback was used (no API key)");
  }

  log(`Summary: ${result.summary}`);
  log(`Metadata: ${result.metadata.totalShiftsCreated} shifts, ${result.metadata.totalUnfilledSlots} unfilled, ${result.metadata.generationTimeMs}ms`);
}

// ============================================================================
// Test 5: Clopening Detection in Prompt
// ============================================================================

async function testClopeningDetection(): Promise<void> {
  logStep("Test 5: Clopening Detection");

  // Create a shift that ends late on Monday (closing shift)
  const schedule = await ScheduleService.getOrCreateForWeek(orgId, locationId, TEST_WEEK_START);
  const annaId = staffIds.get("Anna Grill")!;

  // Monday closing shift: 17:00-21:00
  const closingShift = await ShiftService.create({
    orgId,
    locationId,
    scheduleId: schedule.id,
    staffId: annaId,
    start: new Date(2026, 2, 2, 17, 0),
    end: new Date(2026, 2, 2, 21, 0),
    station: "Grill",
  });
  log(`Created Monday closing shift for Anna: 17:00-21:00`);

  // Build context for Tuesday
  const tuesdayDate = new Date(2026, 2, 3); // Tuesday
  const tuesdayRequirements = LABOR_DEFS
    .filter((r) => r.dayOfWeek === 2)
    .map((r, i) => ({
      ...r,
      id: `mock-${i}`,
      orgId,
      locationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  const allShifts = await ShiftService.getBySchedule(schedule.id);

  const { CandidateService } = await import(
    "../src/server/services/candidate.service"
  );

  const slots = await CandidateService.getCandidatesForDay(
    orgId,
    locationId,
    tuesdayDate,
    tuesdayRequirements,
    allShifts
  );

  // Get Monday closing shifts -- compare using local date parts (not ISO/UTC)
  const mondayDate = new Date(2026, 2, 2);
  const closingShifts = allShifts.filter((s) => {
    const shiftEnd = new Date(s.end);
    // Compare local year/month/date to avoid UTC timezone conversion issues
    const sameDay =
      shiftEnd.getFullYear() === mondayDate.getFullYear() &&
      shiftEnd.getMonth() === mondayDate.getMonth() &&
      shiftEnd.getDate() === mondayDate.getDate();
    return sameDay && shiftEnd.getHours() >= 20;
  });

  const dayCtx: DaySchedulingContext = {
    date: tuesdayDate,
    dayOfWeek: 2,
    dayName: "Tuesday",
    slots,
    existingShifts: allShifts,
    previousDayClosingShifts: closingShifts,
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: 5,
    },
  };

  const prompt = buildDayUserPrompt(dayCtx);

  // The closing shift ends at 21:00, so it should be included
  if (closingShifts.length > 0) {
    assert(
      prompt.includes("PREVIOUS DAY CLOSING SHIFTS"),
      "Tuesday prompt includes clopening section"
    );
    assert(
      prompt.includes(annaId),
      "clopening section includes Anna's staff ID"
    );
  } else {
    // Shift ends at 21:00 which is >= 20:00, so it should be found
    // If not found, the threshold logic might differ
    assert(
      closingShifts.length > 0,
      `found ${closingShifts.length} closing shift(s) for Monday (expected >= 1)`
    );
  }

  // Clean up the test shift
  await ShiftService.delete(orgId, locationId, closingShift.id);
  log("Cleaned up test closing shift");
}

// ============================================================================
// Test 6: Edge Cases
// ============================================================================

async function testEdgeCases(): Promise<void> {
  logStep("Test 6: Edge Cases");

  // Test 6a: Empty slots (no candidates)
  const emptyDayCtx: DaySchedulingContext = {
    date: TEST_WEEK_START,
    dayOfWeek: 1,
    dayName: "Monday",
    slots: [
      {
        slot: {
          station: "Grill",
          startTime: "09:00",
          endTime: "17:00",
          minStaff: 2,
          preferredStaff: 3,
          priority: "high",
        },
        candidates: [],
        hasSufficientCandidates: false,
      },
    ],
    existingShifts: [],
    previousDayClosingShifts: [],
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: 5,
    },
  };

  const emptyResult = await SchedulingAgentService.generateDaySchedule(
    emptyDayCtx,
    { orgId, locationId, clerkUserId: TEST_USER_ID, action: "schedule_generation" }
  );
  assert(
    emptyResult.daySchedule.assignments.length === 0,
    "no assignments when zero candidates"
  );
  assert(
    emptyResult.daySchedule.unfilledSlots.length === 1,
    `unfilled slots: ${emptyResult.daySchedule.unfilledSlots.length} (expected 1)`
  );

  // Test 6b: No slots at all
  const noSlotsDayCtx: DaySchedulingContext = {
    date: TEST_WEEK_START,
    dayOfWeek: 1,
    dayName: "Monday",
    slots: [],
    existingShifts: [],
    previousDayClosingShifts: [],
    kitchenContext: {
      operatingHours: { open: "09:00", close: "21:00" },
      totalStaffCount: 5,
    },
  };

  const noSlotsResult = await SchedulingAgentService.generateDaySchedule(
    noSlotsDayCtx,
    { orgId, locationId, clerkUserId: TEST_USER_ID, action: "schedule_generation" }
  );
  assert(
    noSlotsResult.daySchedule.assignments.length === 0,
    "no assignments when no slots"
  );
  assert(
    noSlotsResult.daySchedule.notes.includes("No labor requirements"),
    "notes mention no labor requirements"
  );
}

// ============================================================================
// Test 7: Shift Accumulation Across Days
// ============================================================================

async function testShiftAccumulation(): Promise<void> {
  logStep("Test 7: Shift Accumulation Across Days");

  // The generateWeekSchedule should accumulate shifts across days
  // This means if Anna is assigned Monday, she should appear in
  // Tuesday's existing shifts (which affects candidate filtering)

  // We already tested this implicitly in Test 4, but let's verify
  // the metadata reflects multi-day generation
  const ctx = await SchedulingAgentService.buildSchedulingContext(
    orgId,
    locationId,
    TEST_USER_ID,
    TEST_WEEK_START
  );

  const result = await SchedulingAgentService.generateWeekSchedule(ctx);

  // Collect all unique staff assigned across all days
  const staffAssignedByDay = new Map<string, Set<string>>();
  for (const day of result.days) {
    const dayStaff = new Set<string>();
    for (const a of day.assignments) {
      dayStaff.add(a.staffId);
    }
    if (dayStaff.size > 0) {
      staffAssignedByDay.set(day.dayOfWeek, dayStaff);
    }
  }

  log(`Days with assignments: ${staffAssignedByDay.size}`);
  for (const [day, staffSet] of staffAssignedByDay) {
    log(`  ${day}: ${staffSet.size} unique staff assigned`);
  }

  // Verify the total from metadata matches the sum
  const sumFromDays = result.days.reduce(
    (sum, d) => sum + d.assignments.length,
    0
  );
  assert(
    result.metadata.totalShiftsCreated === sumFromDays,
    `metadata totalShiftsCreated (${result.metadata.totalShiftsCreated}) matches sum of day assignments (${sumFromDays})`
  );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  SPRINT 3.7 END-TO-END VERIFICATION");
  console.log("  AI Scheduling Agent Service (Selector Layer)");
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
    await testBuildSchedulingContext();
    await testPromptBuilder();
    await testAlgorithmicFallback();
    await testGenerateWeekSchedule();
    await testClopeningDetection();
    await testEdgeCases();
    await testShiftAccumulation();

    // Results
    console.log(`\n${"═".repeat(60)}`);
    console.log("  RESULTS");
    console.log(`${"═".repeat(60)}`);
    console.log(`  Total:   ${totalTests}`);
    console.log(`  Passed:  ${passedTests}`);
    console.log(`  Failed:  ${failedTests}`);
    console.log(`  Skipped: ${skippedTests}`);

    if (errors.length > 0) {
      console.log(`\n  FAILURES:`);
      for (const e of errors) {
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
