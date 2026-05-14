/**
 * SHI-11 backend smoke test.
 *
 * Validates the new Announcement and ExchangeShift backend layers
 * (model + service + DTO) against a real MongoDB. Runs in a
 * dedicated database (`sous_smoke_shi11`) and cleans up after itself.
 *
 * Run from the apps/web directory:
 *   cd apps/web && npx tsx ../../scripts/test-shi11.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Announcement from "../apps/web/src/server/models/Announcement";
import ExchangeShift from "../apps/web/src/server/models/ExchangeShift";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import { AnnouncementService } from "../apps/web/src/server/services/announcement.service";
import { ExchangeShiftService } from "../apps/web/src/server/services/exchange-shift.service";

// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE.

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
  // Spin up an in-memory replica set so we don't need Atlas
  // network access to validate the new layers.
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_smoke_shi11" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const scheduleId = new Types.ObjectId();

  const cleanup = async () => {
    await Announcement.deleteMany({ orgId });
    await ExchangeShift.deleteMany({ orgId });
    await Shift.deleteMany({ orgId });
    await Staff.deleteMany({ orgId });
  };

  try {
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

    console.log("--- AnnouncementService ---");

    const ann1 = await AnnouncementService.create({
      orgId: String(orgId),
      locationId: String(locationId),
      authorId: "user_test",
      authorName: "Manager Test",
      title: "Welcome Pat!",
      body: "First shift tomorrow",
      priority: "Urgent",
      targetAudience: ["Global"],
      tags: [],
      publishDate: new Date(Date.now() - 5 * 60 * 1000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });
    assert(Boolean(ann1.id), "create returns DTO with id");
    assert(ann1.priority === "Urgent", "priority passes through");

    const ann2 = await AnnouncementService.create({
      orgId: String(orgId),
      locationId: String(locationId),
      authorId: "user_test",
      authorName: "Manager Test",
      title: "Expired post",
      body: "should not appear",
      priority: "Standard",
      targetAudience: ["Global"],
      tags: [],
      publishDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expirationDate: new Date(Date.now() - 60_000),
      attachments: [],
      requiresAcknowledgment: false,
    });

    const list = await AnnouncementService.list(
      String(orgId),
      String(locationId)
    );
    assert(list.length === 1, "default list hides expired");
    assert(list[0]?.id === ann1.id, "visible row is the active one");

    const listWithExpired = await AnnouncementService.list(
      String(orgId),
      String(locationId),
      { includeExpired: true }
    );
    assert(listWithExpired.length === 2, "includeExpired returns both");

    const updated = await AnnouncementService.update(
      String(orgId),
      String(locationId),
      { announcementId: ann1.id, title: "Welcome Pat (updated)" }
    );
    assert(
      updated !== null && updated.title === "Welcome Pat (updated)",
      "update mutates the row"
    );

    const otherTenant = await AnnouncementService.update(
      new Types.ObjectId().toString(),
      String(locationId),
      { announcementId: ann1.id, title: "should not work" }
    );
    assert(otherTenant === null, "cross-tenant update returns null");

    const deleted = await AnnouncementService.delete(
      String(orgId),
      String(locationId),
      ann2.id
    );
    assert(deleted, "delete returns true on hit");

    const countActive = await AnnouncementService.countActive(
      String(orgId),
      String(locationId)
    );
    assert(countActive === 1, "countActive ignores expired");

    console.log("\n--- ExchangeShiftService ---");

    const dropped = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
      reason: "doctor appt",
    });
    assert(dropped.status === "available", "drop creates available row");
    assert(
      dropped.droppedByName === "Alex Dropper",
      "droppedByName denormalised from Staff"
    );
    assert(dropped.reason === "doctor appt", "reason persists");

    let rejectedDuplicate = false;
    try {
      await ExchangeShiftService.drop({
        orgId: String(orgId),
        locationId: String(locationId),
        shiftId: String(shift._id),
        staffId: String(dropper._id),
      });
    } catch {
      rejectedDuplicate = true;
    }
    assert(rejectedDuplicate, "second drop on same shift rejected");

    let selfPickupBlocked = false;
    try {
      await ExchangeShiftService.pickup({
        orgId: String(orgId),
        locationId: String(locationId),
        exchangeId: dropped.id,
        pickerStaffId: String(dropper._id),
      });
    } catch (e) {
      selfPickupBlocked = (e as Error).message.includes(
        "cannot pick up your own"
      );
    }
    assert(selfPickupBlocked, "self pickup rejected");

    const picked = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      pickerStaffId: String(picker._id),
      requireApproval: false,
    });
    assert(picked.status === "covered", "no-approval pickup → covered");

    const reloaded = await Shift.findById(shift._id).lean();
    assert(
      reloaded !== null &&
        String(reloaded.staffId) === String(picker._id),
      "underlying shift reassigned to picker"
    );

    const avail = await ExchangeShiftService.listAvailable(
      String(orgId),
      String(locationId),
      { excludeStaffId: String(picker._id) }
    );
    assert(avail.length === 0, "available board empty after pickup");

    const dropped2 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(picker._id),
    });
    assert(
      dropped2.status === "available",
      "fresh drop allowed after covered (partial unique index OK)"
    );

    const cancelled = await ExchangeShiftService.cancel({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped2.id,
      cancellerStaffId: String(picker._id),
    });
    assert(cancelled.status === "cancelled", "cancel transitions status");

    // Approval lifecycle: drop again, pickup with approval required.
    const dropped3 = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(picker._id),
    });

    const picked3 = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped3.id,
      pickerStaffId: String(dropper._id),
      requireApproval: true,
    });
    assert(
      picked3.status === "pending_coverage",
      "approval-required pickup → pending_coverage"
    );

    // Underlying shift should NOT be reassigned yet.
    const stillPicker = await Shift.findById(shift._id).lean();
    assert(
      stillPicker !== null &&
        String(stillPicker.staffId) === String(picker._id),
      "shift NOT reassigned during pending_coverage"
    );

    const approved = await ExchangeShiftService.approve({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: picked3.id,
      approverClerkUserId: "user_manager",
    });
    assert(
      approved.status === "manager_approved",
      "approve transitions to manager_approved"
    );
    assert(
      approved.approvedByClerkUserId === "user_manager",
      "approver recorded"
    );

    const nowDropper = await Shift.findById(shift._id).lean();
    assert(
      nowDropper !== null &&
        String(nowDropper.staffId) === String(dropper._id),
      "shift reassigned on approval"
    );

    console.log(`\n${passed} passed, ${failed} failed`);
  } finally {
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
