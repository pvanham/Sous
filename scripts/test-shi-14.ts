/**
 * SHI-14 backend smoke test.
 *
 * Validates the new manager-side methods on `ExchangeShiftService`
 * (`listForManager`, `deny`, `cancelAsManager`, `getViability`) and
 * the `denied` lifecycle status / partial-unique-index interaction.
 *
 * Runs against an in-memory MongoDB replica set so it does not need
 * Atlas network access. Run from the repo root:
 *
 *   npx tsx scripts/test-shi-14.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import ExchangeShift from "../apps/web/src/server/models/ExchangeShift";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import KitchenConfig from "../apps/web/src/server/models/KitchenConfig";
import { ExchangeShiftService } from "../apps/web/src/server/services/exchange-shift.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  await mongoose.connect(uri, { dbName: "sous_smoke_shi14" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const scheduleId = new Types.ObjectId();

  const cleanup = async () => {
    await ExchangeShift.deleteMany({ orgId });
    await Shift.deleteMany({ orgId });
    await Staff.deleteMany({ orgId });
    await KitchenConfig.deleteMany({ orgId });
  };

  try {
    // KitchenConfig is read by getViability for the clopen
    // threshold; create a minimally valid one.
    await KitchenConfig.create({
      orgId,
      locationId,
      name: "Test Kitchen",
      stations: ["Sauté"],
      roles: ["Cook"],
      managerRoles: [],
      operatingHours: {
        monday: { isOpen: true, open: "08:00", close: "22:00" },
        tuesday: { isOpen: true, open: "08:00", close: "22:00" },
        wednesday: { isOpen: true, open: "08:00", close: "22:00" },
        thursday: { isOpen: true, open: "08:00", close: "22:00" },
        friday: { isOpen: true, open: "08:00", close: "22:00" },
        saturday: { isOpen: true, open: "08:00", close: "22:00" },
        sunday: { isOpen: true, open: "08:00", close: "22:00" },
      },
      minTimeOffAdvanceDays: 7,
    });

    // Two staff: dropper has matching skill+role, picker has skill+role too.
    const dropper = await Staff.create({
      orgId,
      locationId,
      name: "Alex Dropper",
      email: `dropper-${Date.now()}@example.com`,
      phone: "5555550101",
      roles: ["Cook"],
      skills: [{ station: "Sauté", proficiency: 3 }],
      isActive: true,
      maxHoursPerWeek: 40,
      minHoursPerWeek: 0,
      preferredStations: [],
      certifications: [],
      hourlyRate: 18,
      invitationStatus: "accepted",
    });

    const picker = await Staff.create({
      orgId,
      locationId,
      name: "Pat Picker",
      email: `picker-${Date.now()}@example.com`,
      phone: "5555550102",
      roles: ["Cook"],
      skills: [{ station: "Sauté", proficiency: 4 }],
      isActive: true,
      maxHoursPerWeek: 40,
      minHoursPerWeek: 0,
      preferredStations: [],
      certifications: [],
      hourlyRate: 19,
      invitationStatus: "accepted",
    });

    // The exchange row's shift starts at +1 day, 6h long.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(tomorrow.getTime() + 6 * 60 * 60 * 1000);
    const shift = await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: dropper._id,
      start: tomorrow,
      end: tomorrowEnd,
      station: "Sauté",
      notes: "",
    });

    // Pre-existing picker shift that ends a few hours before the
    // swap window (used to assert the clopen-warning path).
    const pickerPriorEnd = new Date(tomorrow.getTime() - 3 * 60 * 60 * 1000);
    const pickerPriorStart = new Date(pickerPriorEnd.getTime() - 5 * 60 * 60 * 1000);
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: picker._id,
      start: pickerPriorStart,
      end: pickerPriorEnd,
      station: "Sauté",
      notes: "",
    });

    console.log("--- listForManager / deny / cancelAsManager ---");

    const dropped = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
      reason: "doctor appt",
    });
    assert(dropped.status === "available", "drop creates available row");

    const allRows = await ExchangeShiftService.listForManager(
      String(orgId),
      String(locationId)
    );
    assert(allRows.length === 1, "listForManager returns 1 row");

    const availableOnly = await ExchangeShiftService.listForManager(
      String(orgId),
      String(locationId),
      { status: "available" }
    );
    assert(availableOnly.length === 1, "listForManager status filter (available)");

    const pendingOnly = await ExchangeShiftService.listForManager(
      String(orgId),
      String(locationId),
      { status: "pending_coverage" }
    );
    assert(pendingOnly.length === 0, "listForManager status filter (none pending)");

    // Manager cancels the available drop directly.
    const cancelled = await ExchangeShiftService.cancelAsManager({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
    });
    assert(cancelled.status === "cancelled", "cancelAsManager → cancelled");

    let cancelTwiceFailed = false;
    try {
      await ExchangeShiftService.cancelAsManager({
        orgId: String(orgId),
        locationId: String(locationId),
        exchangeId: dropped.id,
      });
    } catch (e) {
      cancelTwiceFailed = (e as Error).message.includes(
        "Only available drops can be cancelled"
      );
    }
    assert(cancelTwiceFailed, "cancelAsManager rejects non-available rows");

    console.log("\n--- pending_coverage → deny path ---");

    const dropped2 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
    });
    assert(
      dropped2.status === "available",
      "fresh drop allowed after cancelled (partial unique index)"
    );

    const pending = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped2.id,
      pickerStaffId: String(picker._id),
      requireApproval: true,
    });
    assert(
      pending.status === "pending_coverage",
      "pickup w/ requireApproval → pending_coverage"
    );

    const denied = await ExchangeShiftService.deny({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: pending.id,
      deniedByClerkUserId: "user_test_manager",
      notes: "Conflicts with prep meeting",
    });
    assert(denied.status === "denied", "deny → denied");
    assert(
      denied.approvedByClerkUserId === "user_test_manager",
      "deny records reviewer clerkUserId"
    );
    assert(
      denied.managerNotes === "Conflicts with prep meeting",
      "deny records manager notes"
    );

    // Underlying shift should remain with the dropper (deny does not reassign).
    const shiftAfterDeny = await Shift.findById(shift._id).lean();
    assert(
      shiftAfterDeny !== null && String(shiftAfterDeny.staffId) === String(dropper._id),
      "deny leaves underlying shift with dropper"
    );

    let denyTwiceFailed = false;
    try {
      await ExchangeShiftService.deny({
        orgId: String(orgId),
        locationId: String(locationId),
        exchangeId: pending.id,
        deniedByClerkUserId: "user_test_manager",
      });
    } catch (e) {
      denyTwiceFailed = (e as Error).message.includes("not awaiting approval");
    }
    assert(denyTwiceFailed, "deny rejects non-pending rows");

    console.log("\n--- getViability ---");

    // After the deny, the row is denied. Re-drop and pickup again so
    // we have a covered row whose viability we can compute against
    // the picker's existing prior-day shift.
    const dropped3 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
    });
    const picked = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped3.id,
      pickerStaffId: String(picker._id),
      requireApproval: true,
    });
    assert(picked.status === "pending_coverage", "second pickup → pending");

    const viability = await ExchangeShiftService.getViability(
      String(orgId),
      String(locationId),
      picked.id
    );
    assert(viability !== null, "getViability returns a result");
    if (viability) {
      assert(viability.dropperName === "Alex Dropper", "viability dropperName");
      assert(viability.pickerName === "Pat Picker", "viability pickerName");
      assert(viability.pickerHasSkill === true, "picker has Sauté skill");
      assert(
        viability.pickerStationProficiency === 4,
        "picker proficiency captured"
      );
      assert(viability.pickerHasMatchingRole === true, "shared Cook role");
      assert(viability.pickerHasOverlap === false, "no overlapping shift");
      // dropper had only this 6h shift this week.
      assert(viability.dropperHoursBefore === 6, "dropper before = 6h");
      assert(viability.dropperHoursAfter === 0, "dropper after = 0h");
      // picker had a 5h prior shift, swap adds 6h.
      assert(viability.pickerHoursBefore === 5, "picker before = 5h");
      assert(viability.pickerHoursAfter === 11, "picker after = 11h");
      assert(viability.pickerOvertime === false, "picker under 40h cap");
      // Prior shift ends 3h before the swap → clopen risk vs default 10h threshold.
      assert(
        viability.pickerMinTurnaroundHours !== null &&
          viability.pickerMinTurnaroundHours <= 3,
        "turnaround ≤ 3h",
      );
      assert(viability.pickerClopenRisk === true, "clopen risk flagged");
      assert(viability.dropperIsActive === true, "dropper active");
      assert(viability.pickerIsActive === true, "picker active");
    }

    console.log("\n--- listForManager sees terminal statuses ---");

    const everything = await ExchangeShiftService.listForManager(
      String(orgId),
      String(locationId)
    );
    const statuses = new Set(everything.map((r) => r.status));
    assert(statuses.has("denied"), "denied row visible to manager");
    assert(statuses.has("cancelled"), "cancelled row visible to manager");
    assert(statuses.has("pending_coverage"), "pending row visible to manager");
  } finally {
    await cleanup();
    await mongoose.connection.close();
    await repl.stop();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
