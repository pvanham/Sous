/**
 * SHI-15 service-layer smoke test — Sous AI insight on agreed swaps.
 *
 * Validates the propagation of the new `aiInsight*` fields through
 * `ExchangeShiftService` and the wiring into
 * `ExchangeInsightService.generateForExchange`.
 *
 * The OpenAI client is short-circuited via the test-only
 * `__setExchangeInsightLLMCaller` hook so the test runs without a
 * network call. We assert:
 *   1. `ExchangeShiftService.pickup` flips `aiInsightStatus` to
 *      `pending` atomically with the status transition.
 *   2. `ExchangeInsightService.generateForExchange` materializes
 *      a non-empty insight and persists it as `ready`.
 *   3. The prompt the service hands to the model includes the
 *      key context fields (date, station, both staff names,
 *      week hours, dropper reason). This is what the issue
 *      explicitly asks for: "the llm should be provided with all
 *      relevant information."
 *   4. A failed model call lands the row in `aiInsightStatus:
 *      "failed"` (never stuck in `pending`).
 *   5. An empty model output is treated as failed (no leaked text).
 *   6. The `setAIInsight` service method is tenant-scoped.
 *
 * Runs from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-15.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { startOfWeek } from "date-fns";

import ExchangeShift from "../apps/web/src/server/models/ExchangeShift";
import LaborRequirement from "../apps/web/src/server/models/LaborRequirement";
import Schedule from "../apps/web/src/server/models/Schedule";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import { ExchangeShiftService } from "../apps/web/src/server/services/exchange-shift.service";
import {
  ExchangeInsightService,
  __setExchangeInsightLLMCaller,
} from "../apps/web/src/server/services/exchange-insight.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

interface CapturedCall {
  systemPrompt: string;
  userPrompt: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
}

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_smoke_shi15" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await ExchangeShift.deleteMany({});
    await Shift.deleteMany({});
    await Staff.deleteMany({});
    await Schedule.deleteMany({});
    await LaborRequirement.deleteMany({});
  };

  let capturedCalls: CapturedCall[] = [];

  try {
    const dropper = await Staff.create({
      orgId,
      locationId,
      name: "Alex Dropper",
      email: `alex-${Date.now()}@example.com`,
      phone: "5555550101",
      roles: ["Cook"],
      skills: [{ station: "Sauté", proficiency: 3 }],
      isActive: true,
      maxHoursPerWeek: 40,
      minHoursPerWeek: 0,
      preferredStations: ["Sauté"],
      certifications: [],
      hourlyRate: 18,
      clerkUserId: "user_dropper",
      invitationStatus: "accepted",
    });

    const picker = await Staff.create({
      orgId,
      locationId,
      name: "Pat Picker",
      email: `pat-${Date.now()}@example.com`,
      phone: "5555550102",
      roles: ["Cook"],
      skills: [{ station: "Sauté", proficiency: 4 }],
      isActive: true,
      maxHoursPerWeek: 40,
      minHoursPerWeek: 0,
      preferredStations: ["Sauté"],
      certifications: [],
      hourlyRate: 19,
      clerkUserId: "user_picker",
      invitationStatus: "accepted",
    });

    // Pick a Wednesday next week so the dayOfWeek is stable.
    const baseMonday = startOfWeek(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      { weekStartsOn: 1 },
    );
    const start = new Date(baseMonday);
    start.setDate(start.getDate() + 2); // Wed
    start.setHours(11, 0, 0, 0);
    const end = new Date(start);
    end.setHours(17, 0, 0, 0);

    const schedule = await Schedule.create({
      orgId,
      locationId,
      weekStartDate: baseMonday,
      status: "DRAFT",
      notes: "",
    });

    const shift = await Shift.create({
      orgId,
      locationId,
      scheduleId: schedule._id,
      staffId: dropper._id,
      start,
      end,
      station: "Sauté",
      notes: "",
    });

    await LaborRequirement.create({
      orgId,
      locationId,
      dayOfWeek: start.getDay(),
      station: "Sauté",
      startTime: "11:00",
      endTime: "17:00",
      minStaff: 1,
      preferredStaff: 2,
      priority: "normal",
    });

    console.log("--- ExchangeShiftService.pickup flips aiInsightStatus → pending ---");

    const dropped = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
      reason: "doctor appointment in the morning",
    });
    assert(
      dropped.aiInsightStatus === "not_applicable",
      "fresh drop has aiInsightStatus = not_applicable",
    );

    const picked = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      pickerStaffId: String(picker._id),
    });
    assert(picked.status === "covered", "pickup transitions to covered");
    assert(
      picked.aiInsightStatus === "pending",
      "pickup also flips aiInsightStatus → pending in same write",
    );
    assert(picked.aiInsight === null, "pending row has null aiInsight");

    console.log("\n--- ExchangeInsightService.generateForExchange (success) ---");

    capturedCalls = [];
    __setExchangeInsightLLMCaller(async (input) => {
      capturedCalls.push({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        orgId: input.orgId,
        locationId: input.locationId,
        clerkUserId: input.clerkUserId,
      });
      return {
        insight:
          "Pat is a strong sauté cook (proficiency 4) and this swap brings them to 6 hours, well under their 40h cap. Coverage stays at minimum staffing for that shift.",
      };
    });

    const result = await ExchangeInsightService.generateForExchange({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      triggeredByClerkUserId: "user_picker",
    });
    assert(
      result.status === "ready",
      "generation returns ready",
      JSON.stringify(result),
    );
    assert(capturedCalls.length === 1, "exactly one model call");

    const call = capturedCalls[0];
    assert(call.clerkUserId === "user_picker", "clerkUserId forwarded");
    assert(
      call.systemPrompt.includes("Sous"),
      "system prompt mentions Sous identity",
    );
    assert(
      call.systemPrompt.toLowerCase().includes("json"),
      "system prompt requires JSON output",
    );
    assert(
      call.userPrompt.includes("Alex"),
      "user prompt includes dropper first name",
    );
    assert(
      call.userPrompt.includes("Pat"),
      "user prompt includes picker first name",
    );
    assert(
      call.userPrompt.includes("Sauté"),
      "user prompt includes the station",
    );
    assert(
      call.userPrompt.includes("doctor appointment"),
      "user prompt includes the dropper's reason",
    );
    assert(
      call.userPrompt.includes("proficiencyAtStation"),
      "user prompt carries skill proficiency context",
    );
    assert(
      call.userPrompt.includes("weekHoursAfterSwap"),
      "user prompt carries the picker's post-swap weekly load",
    );
    assert(
      call.userPrompt.includes("coverage"),
      "user prompt carries labor-requirement coverage context",
    );
    assert(
      call.userPrompt.includes("picker_overtime_after_swap"),
      "user prompt surfaces the overtime flag",
    );
    assert(
      call.userPrompt.includes("minStaff"),
      "user prompt includes labor min/preferred staff numbers",
    );

    const refreshed = await ExchangeShiftService.getById(
      String(orgId),
      String(locationId),
      dropped.id,
    );
    assert(refreshed !== null, "row still exists after generation");
    assert(
      refreshed?.aiInsightStatus === "ready",
      "row aiInsightStatus persisted as ready",
    );
    assert(
      typeof refreshed?.aiInsight === "string" &&
        (refreshed!.aiInsight!.length ?? 0) > 20,
      "row aiInsight contains a non-trivial string",
    );
    assert(
      refreshed?.aiInsightGeneratedAt instanceof Date,
      "row aiInsightGeneratedAt is set",
    );

    console.log("\n--- ExchangeInsightService.generateForExchange (model error) ---");

    // Drop a SECOND shift to test the error path.
    const start2 = new Date(start);
    start2.setDate(start2.getDate() + 1);
    const end2 = new Date(end);
    end2.setDate(end2.getDate() + 1);
    const shift2 = await Shift.create({
      orgId,
      locationId,
      scheduleId: schedule._id,
      staffId: dropper._id,
      start: start2,
      end: end2,
      station: "Sauté",
      notes: "",
    });
    const dropped2 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift2._id),
      staffId: String(dropper._id),
    });
    await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped2.id,
      pickerStaffId: String(picker._id),
    });

    capturedCalls = [];
    __setExchangeInsightLLMCaller(async () => {
      throw new Error("simulated upstream error");
    });
    const failResult = await ExchangeInsightService.generateForExchange({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped2.id,
      triggeredByClerkUserId: "user_picker",
    });
    assert(
      failResult.status === "failed",
      "model error surfaces as failed status (no throw)",
      JSON.stringify(failResult),
    );

    const refreshed2 = await ExchangeShiftService.getById(
      String(orgId),
      String(locationId),
      dropped2.id,
    );
    assert(
      refreshed2?.aiInsightStatus === "failed",
      "row aiInsightStatus persisted as failed",
    );
    assert(
      refreshed2?.aiInsight === null,
      "failed row has null aiInsight (no leaked partial text)",
    );

    console.log("\n--- ExchangeInsightService.generateForExchange (empty model output) ---");

    // Re-drop the original shift (ownership now sits with picker after
    // the first pickup) and have dropper pick it up.
    const dropped3 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(picker._id),
    });
    await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped3.id,
      pickerStaffId: String(dropper._id),
    });

    capturedCalls = [];
    __setExchangeInsightLLMCaller(async () => ({ insight: "" }));
    const emptyResult = await ExchangeInsightService.generateForExchange({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped3.id,
      triggeredByClerkUserId: "user_dropper",
    });
    assert(
      emptyResult.status === "failed",
      "empty model output handled as failed",
    );

    console.log("\n--- ExchangeShiftService.setAIInsight tenant scoping ---");

    const wrongTenantUpdate = await ExchangeShiftService.setAIInsight({
      orgId: String(otherOrgId),
      locationId: String(otherLocationId),
      exchangeId: dropped.id,
      outcome: "ready",
      insight: "should not land here",
    });
    assert(
      wrongTenantUpdate === null,
      "setAIInsight returns null for cross-tenant attempt",
    );

    const stillReady = await ExchangeShiftService.getById(
      String(orgId),
      String(locationId),
      dropped.id,
    );
    assert(
      stillReady?.aiInsight !== "should not land here",
      "cross-tenant write did not stomp the original row",
    );

    console.log(`\n${passed} passed, ${failed} failed`);
  } finally {
    __setExchangeInsightLLMCaller(null);
    await cleanup();
    await mongoose.disconnect();
    await repl.stop();
  }
}

main()
  .then(() => {
    if (failed > 0) process.exit(1);
  })
  .catch((e) => {
    console.error("SMOKE TEST CRASHED:", e);
    process.exit(1);
  });
