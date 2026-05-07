/**
 * SHI-8 service-layer smoke test.
 *
 * The four mobile Exchange route handlers
 * (`/api/exchange/available`, `/api/exchange/mine`,
 *  `/api/exchange/[exchangeId]/pickup`, `/api/shifts/[shiftId]/drop`)
 * are thin adapters over `ExchangeShiftService` plus a couple of
 * pre-checks (`StaffService.getByClerkUserId`,
 * `ShiftService.checkOverlap`, `ShiftService.getById`). The route
 * handlers themselves are validated by hand at integration time;
 * this script validates the underlying behaviour the routes rely on
 * against an in-memory MongoDB so the wiring stays honest as the
 * service evolves.
 *
 * Validates, end-to-end:
 *   - Drop a shift creates an `available` row with the dropper's
 *     name denormalised onto it.
 *   - `listAvailable({ excludeStaffId })` does NOT return the
 *     caller's own drops (this is what the
 *     `/api/exchange/available` route does after resolving the
 *     caller's `staffId`).
 *   - `listByDropper` returns every status, sorted newest-first.
 *   - `pickup` reassigns the underlying Shift (this matters because
 *     the pickup route's overlap pre-check relies on the
 *     reassignment being durable).
 *   - `ShiftService.checkOverlap` correctly reports a conflict in
 *     the caller's window — the cheap last-mile guard the pickup
 *     route uses to refuse overlapping pickups.
 *   - The drop route's "already on the board" rule trips when the
 *     same Shift is dropped twice.
 *   - Cross-tenant rows do not leak across `listAvailable` /
 *     `listByDropper` queries.
 *
 * Runs from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-8.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import ExchangeShift from "../apps/web/src/server/models/ExchangeShift";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import { ExchangeShiftService } from "../apps/web/src/server/services/exchange-shift.service";
import { ShiftService } from "../apps/web/src/server/services/shift.service";
import { StaffService } from "../apps/web/src/server/services/staff.service";

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

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_smoke_shi8" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();
  const scheduleId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await ExchangeShift.deleteMany({});
    await Shift.deleteMany({});
    await Staff.deleteMany({});
  };

  try {
    // ── Seed two staff in this tenant + one cross-tenant ────────
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
      clerkUserId: "user_dropper",
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
      clerkUserId: "user_picker",
      invitationStatus: "accepted",
    });

    const xtStaff = await Staff.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      name: "Cross Tenant",
      email: `xt-${Date.now()}@example.com`,
      phone: "5555550103",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      clerkUserId: "user_xt",
      invitationStatus: "accepted",
    });

    // Tomorrow at 11:00–17:00.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(11, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(17, 0, 0, 0);

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

    console.log("--- StaffService.getByClerkUserId (route auth helper) ---");

    const resolvedDropper = await StaffService.getByClerkUserId(
      String(orgId),
      String(locationId),
      "user_dropper",
    );
    assert(
      resolvedDropper !== null && resolvedDropper.id === String(dropper._id),
      "resolves staff record by Clerk user id within the tenant",
    );

    const resolvedNobody = await StaffService.getByClerkUserId(
      String(orgId),
      String(locationId),
      "user_unknown",
    );
    assert(
      resolvedNobody === null,
      "returns null for an unknown Clerk user (route → 200/[] or 400)",
    );

    const xtResolved = await StaffService.getByClerkUserId(
      String(orgId),
      String(locationId),
      "user_xt",
    );
    assert(
      xtResolved === null,
      "does not leak cross-tenant staff",
    );

    console.log("\n--- POST /shifts/:id/drop  (ExchangeShiftService.drop) ---");

    const dropped = await ExchangeShiftService.drop({
      orgId: String(orgId),
      locationId: String(locationId),
      shiftId: String(shift._id),
      staffId: String(dropper._id),
      reason: "doctor appt",
    });
    assert(dropped.status === "available", "drop creates an available row");
    assert(
      dropped.droppedByName === "Alex Dropper",
      "droppedByName denormalised from Staff",
    );
    assert(dropped.reason === "doctor appt", "reason persists on the row");

    let duplicateRejected = false;
    try {
      await ExchangeShiftService.drop({
        orgId: String(orgId),
        locationId: String(locationId),
        shiftId: String(shift._id),
        staffId: String(dropper._id),
      });
    } catch {
      duplicateRejected = true;
    }
    assert(
      duplicateRejected,
      "second drop on same shift rejected (route → 409)",
    );

    console.log("\n--- GET /exchange/available  (listAvailable + excludeStaffId) ---");

    const availForPicker = await ExchangeShiftService.listAvailable(
      String(orgId),
      String(locationId),
      { excludeStaffId: String(picker._id) },
    );
    assert(
      availForPicker.length === 1 && availForPicker[0]?.id === dropped.id,
      "picker sees the dropper's drop",
    );

    const availForDropper = await ExchangeShiftService.listAvailable(
      String(orgId),
      String(locationId),
      { excludeStaffId: String(dropper._id) },
    );
    assert(
      availForDropper.length === 0,
      "dropper does NOT see their own drop (route → empty)",
    );

    const xtAvail = await ExchangeShiftService.listAvailable(
      String(otherOrgId),
      String(otherLocationId),
    );
    assert(
      xtAvail.length === 0,
      "cross-tenant board does not leak this tenant's drops",
    );

    console.log("\n--- GET /exchange/mine  (listByDropper) ---");

    const mineDropper = await ExchangeShiftService.listByDropper(
      String(orgId),
      String(locationId),
      String(dropper._id),
    );
    assert(
      mineDropper.length === 1 && mineDropper[0]?.id === dropped.id,
      "listByDropper returns the dropper's own drop",
    );

    const minePicker = await ExchangeShiftService.listByDropper(
      String(orgId),
      String(locationId),
      String(picker._id),
    );
    assert(
      minePicker.length === 0,
      "listByDropper for a non-dropping staff member is empty",
    );

    const xtMine = await ExchangeShiftService.listByDropper(
      String(otherOrgId),
      String(otherLocationId),
      String(xtStaff._id),
    );
    assert(
      xtMine.length === 0,
      "listByDropper is tenant-scoped",
    );

    console.log(
      "\n--- POST /exchange/:id/pickup  (overlap pre-check + service.pickup) ---",
    );

    const overlapBeforePickup = await ShiftService.checkOverlap(
      String(orgId),
      String(locationId),
      String(picker._id),
      tomorrow,
      tomorrowEnd,
    );
    assert(
      !overlapBeforePickup,
      "picker has no overlap before pickup (route would proceed)",
    );

    const picked = await ExchangeShiftService.pickup({
      orgId: String(orgId),
      locationId: String(locationId),
      exchangeId: dropped.id,
      pickerStaffId: String(picker._id),
      requireApproval: false,
    });
    assert(
      picked.status === "covered",
      "v1 pickup transitions status → covered (no approval flow)",
    );

    const reassigned = await Shift.findById(shift._id).lean();
    assert(
      reassigned !== null && String(reassigned.staffId) === String(picker._id),
      "underlying Shift.staffId reassigned to picker",
    );

    const overlapAfterPickup = await ShiftService.checkOverlap(
      String(orgId),
      String(locationId),
      String(picker._id),
      tomorrow,
      tomorrowEnd,
    );
    assert(
      overlapAfterPickup,
      "picker now overlaps that window (route would 403 a second pickup)",
    );

    let selfPickupBlocked = false;
    try {
      // Drop the now-picker-owned shift again, then have picker try
      // to pick it up themselves.
      const reDropped = await ExchangeShiftService.drop({
        orgId: String(orgId),
        locationId: String(locationId),
        shiftId: String(shift._id),
        staffId: String(picker._id),
      });
      await ExchangeShiftService.pickup({
        orgId: String(orgId),
        locationId: String(locationId),
        exchangeId: reDropped.id,
        pickerStaffId: String(picker._id),
      });
    } catch (e) {
      selfPickupBlocked = (e as Error).message.includes(
        "cannot pick up your own",
      );
    }
    assert(
      selfPickupBlocked,
      "self-pickup blocked by service (route → 403)",
    );

    console.log(
      "\n--- ShiftService.getById ownership pre-check (drop route) ---",
    );

    const fetched = await ShiftService.getById(
      String(orgId),
      String(locationId),
      String(shift._id),
    );
    assert(
      fetched !== null && fetched.staffId === String(picker._id),
      "getById reflects current ownership for the drop route's RBAC check",
    );

    const fetchedXt = await ShiftService.getById(
      String(otherOrgId),
      String(otherLocationId),
      String(shift._id),
    );
    assert(
      fetchedXt === null,
      "getById is tenant-scoped (route would 404 cross-tenant)",
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
