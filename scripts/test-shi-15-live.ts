/**
 * SHI-15 LIVE end-to-end demo (NOT part of CI).
 *
 * Runs the same in-memory-Mongo setup as `test-shi-15.ts` but
 * lets the real OpenAI call happen so we can eyeball the actual
 * Sous insight string for the demo / PR walkthrough. Reads
 * `OPENAI_API_KEY` from `apps/web/.env.local`.
 *
 * Run from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-15-live.ts
 */

import "dotenv/config";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { startOfWeek } from "date-fns";

import ExchangeShift from "../apps/web/src/server/models/ExchangeShift";
import LaborRequirement from "../apps/web/src/server/models/LaborRequirement";
import Schedule from "../apps/web/src/server/models/Schedule";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import { ExchangeShiftService } from "../apps/web/src/server/services/exchange-shift.service";
import { ExchangeInsightService } from "../apps/web/src/server/services/exchange-insight.service";

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_smoke_shi15_live" });

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();

  try {
    const dropper = await Staff.create({
      orgId,
      locationId,
      name: "Alex Reyes",
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
      name: "Pat Tanaka",
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

    const baseMonday = startOfWeek(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      { weekStartsOn: 1 },
    );
    const start = new Date(baseMonday);
    start.setDate(start.getDate() + 4); // Friday
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

    // Pre-seed Pat with three other shifts this week so the prompt
    // shows the LLM a meaningful weekly load: 3 * 8 = 24h before
    // the swap, 30h after.
    for (let i = 0; i < 3; i++) {
      const otherStart = new Date(baseMonday);
      otherStart.setDate(otherStart.getDate() + i);
      otherStart.setHours(11, 0, 0, 0);
      const otherEnd = new Date(otherStart);
      otherEnd.setHours(19, 0, 0, 0);
      await Shift.create({
        orgId,
        locationId,
        scheduleId: schedule._id,
        staffId: picker._id,
        start: otherStart,
        end: otherEnd,
        station: "Sauté",
        notes: "",
      });
    }

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

    const dropped = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
      reason: "doctor's appointment that morning",
    });
    await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      pickerStaffId: String(picker._id),
    });

    console.log("\nCalling OpenAI for real...");
    const result = await ExchangeInsightService.generateForExchange({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      triggeredByClerkUserId: "user_picker",
    });

    console.log("\nResult:", result);

    const refreshed = await ExchangeShiftService.getById(
      String(orgId),
      String(locationId),
      dropped.id,
    );
    console.log("\nPersisted row:");
    console.log(`  status:          ${refreshed?.status}`);
    console.log(`  aiInsightStatus: ${refreshed?.aiInsightStatus}`);
    console.log(`  aiInsight:       ${refreshed?.aiInsight}`);
  } finally {
    await ExchangeShift.deleteMany({});
    await Shift.deleteMany({});
    await Staff.deleteMany({});
    await Schedule.deleteMany({});
    await LaborRequirement.deleteMany({});
    await mongoose.disconnect();
    await repl.stop();
  }
}

main().catch((e) => {
  console.error("LIVE DEMO CRASHED:", e);
  process.exit(1);
});
