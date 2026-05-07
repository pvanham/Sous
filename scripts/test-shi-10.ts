/**
 * SHI-10 service-layer smoke test.
 *
 * Validates the two service methods that back the mobile Schedule tab
 * route handlers (`/api/shifts` and `/api/shifts/[shiftId]/roster`):
 *   - ShiftService.getByStaffAndWeek
 *   - ShiftService.getRoster
 *   - StaffService.getByIds
 *
 * Runs against an in-memory MongoDB so no Atlas access is required.
 *
 * Usage from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-10.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
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
    console.error(
      `  FAIL: ${label}${detail ? `  — ${detail}` : ""}`,
    );
  }
}

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_smoke_shi10" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();
  const scheduleId = new Types.ObjectId();
  const otherScheduleId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await Shift.deleteMany({});
    await Staff.deleteMany({});
  };

  try {
    // ── Seed staff ─────────────────────────────────────────────
    const callerStaff = await Staff.create({
      orgId,
      locationId,
      name: "Alex Caller",
      email: `alex-${Date.now()}@example.com`,
      phone: "5550000001",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      clerkUserId: "user_caller",
      invitationStatus: "accepted",
    });

    const teammateStaff = await Staff.create({
      orgId,
      locationId,
      name: "Jordan Teammate",
      email: `jordan-${Date.now()}@example.com`,
      phone: "5550000002",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    const offShiftStaff = await Staff.create({
      orgId,
      locationId,
      name: "Sam Offshift",
      email: `sam-${Date.now()}@example.com`,
      phone: "5550000003",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    // Cross-tenant noise
    const otherTenantStaff = await Staff.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      name: "Cross Tenant",
      email: `xt-${Date.now()}@example.com`,
      phone: "5550000004",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    // ── Seed shifts ───────────────────────────────────────────
    // Use a Sunday-aligned weekStart that is well-defined in UTC.
    const weekStart = new Date("2026-04-12T00:00:00.000Z"); // Sun
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // In-week shift for caller — Tuesday 9am-5pm
    const inWeekStart = new Date("2026-04-14T09:00:00.000Z");
    const inWeekEnd = new Date("2026-04-14T17:00:00.000Z");
    const callerInWeek = await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: callerStaff._id,
      start: inWeekStart,
      end: inWeekEnd,
      station: "Sauté",
      notes: "in-week",
    });

    // Overlapping shift for teammate (same window, different station)
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: teammateStaff._id,
      start: new Date("2026-04-14T08:00:00.000Z"),
      end: new Date("2026-04-14T16:00:00.000Z"),
      station: "Grill",
      notes: "teammate-overlap",
    });

    // Off-shift staff: same day but non-overlapping window
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: offShiftStaff._id,
      start: new Date("2026-04-14T18:00:00.000Z"),
      end: new Date("2026-04-14T22:00:00.000Z"),
      station: "Dish",
      notes: "later-same-day",
    });

    // Different schedule, overlapping time — must NOT appear in roster
    await Shift.create({
      orgId,
      locationId,
      scheduleId: otherScheduleId,
      staffId: teammateStaff._id,
      start: new Date("2026-04-14T10:00:00.000Z"),
      end: new Date("2026-04-14T14:00:00.000Z"),
      station: "Other Schedule",
      notes: "wrong-schedule",
    });

    // Out-of-week shift for caller (week before)
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: callerStaff._id,
      start: new Date("2026-04-05T09:00:00.000Z"),
      end: new Date("2026-04-05T17:00:00.000Z"),
      station: "Prep",
      notes: "previous-week",
    });

    // Boundary: shift that starts exactly at weekEnd (should be excluded)
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: callerStaff._id,
      start: weekEnd,
      end: new Date(weekEnd.getTime() + 4 * 60 * 60 * 1000),
      station: "Boundary",
      notes: "next-week-boundary",
    });

    // Cross-tenant shift in the same window — must NOT leak
    await Shift.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      scheduleId: otherScheduleId,
      staffId: callerStaff._id,
      start: new Date("2026-04-14T09:00:00.000Z"),
      end: new Date("2026-04-14T17:00:00.000Z"),
      station: "Cross Tenant",
      notes: "cross-tenant",
    });

    console.log("--- ShiftService.getByStaffAndWeek ---");

    const weekShifts = await ShiftService.getByStaffAndWeek(
      String(orgId),
      String(locationId),
      String(callerStaff._id),
      weekStart,
      weekEnd,
    );

    assert(
      weekShifts.length === 1,
      "returns exactly the in-week shift for the caller",
      `got ${weekShifts.length}: ${weekShifts.map((s) => s.notes).join(", ")}`,
    );
    assert(
      weekShifts[0]?.notes === "in-week",
      "the returned shift is the right one",
    );
    assert(
      weekShifts.every((s) => s.station !== "Cross Tenant"),
      "does not leak cross-tenant shifts",
    );
    assert(
      weekShifts.every((s) => s.notes !== "next-week-boundary"),
      "excludes shifts that start exactly at weekEnd (half-open window)",
    );
    assert(
      weekShifts.every((s) => s.notes !== "previous-week"),
      "excludes shifts from the previous week",
    );

    const noShiftsStaff = await ShiftService.getByStaffAndWeek(
      String(orgId),
      String(locationId),
      String(offShiftStaff._id),
      weekStart,
      weekEnd,
    );
    // off-shift staff has one shift in-week (the later-same-day one)
    assert(
      noShiftsStaff.length === 1 && noShiftsStaff[0].notes === "later-same-day",
      "returns the right shifts for a different staff member",
      `got ${noShiftsStaff.length}`,
    );

    console.log("\n--- ShiftService.getRoster ---");

    const roster = await ShiftService.getRoster(
      String(orgId),
      String(locationId),
      String(scheduleId),
      callerInWeek.start,
      callerInWeek.end,
    );

    assert(
      roster.length === 2,
      "returns the caller plus the overlapping teammate",
      `got ${roster.length}: ${roster.map((s) => s.notes).join(", ")}`,
    );
    assert(
      roster.some((s) => s.notes === "in-week"),
      "includes the caller's own shift",
    );
    assert(
      roster.some((s) => s.notes === "teammate-overlap"),
      "includes the teammate whose window overlaps",
    );
    assert(
      roster.every((s) => s.notes !== "later-same-day"),
      "excludes non-overlapping same-day shifts",
    );
    assert(
      roster.every((s) => s.notes !== "wrong-schedule"),
      "excludes shifts from a different schedule",
    );
    assert(
      roster.every((s) => s.station !== "Cross Tenant"),
      "does not leak cross-tenant shifts",
    );

    console.log("\n--- StaffService.getByIds ---");

    const staffIds = roster.map((s) => s.staffId);
    const rosterStaff = await StaffService.getByIds(
      String(orgId),
      String(locationId),
      staffIds,
    );

    assert(
      rosterStaff.length === 2,
      "returns one StaffDTO per unique staff id on the roster",
      `got ${rosterStaff.length}`,
    );
    assert(
      rosterStaff.some((s) => s.id === String(callerStaff._id)),
      "includes the caller",
    );
    assert(
      rosterStaff.some((s) => s.id === String(teammateStaff._id)),
      "includes the teammate",
    );
    assert(
      rosterStaff.every((s) => s.id !== String(otherTenantStaff._id)),
      "does not leak cross-tenant staff even if asked",
    );

    const empty = await StaffService.getByIds(
      String(orgId),
      String(locationId),
      [],
    );
    assert(empty.length === 0, "returns [] for an empty input array");

    const garbage = await StaffService.getByIds(
      String(orgId),
      String(locationId),
      ["not-an-objectid", "also-bad"],
    );
    assert(
      garbage.length === 0,
      "filters out invalid ObjectId strings without throwing",
    );

    const dedup = await StaffService.getByIds(
      String(orgId),
      String(locationId),
      [String(callerStaff._id), String(callerStaff._id)],
    );
    assert(
      dedup.length === 1,
      "deduplicates the input set",
      `got ${dedup.length}`,
    );

    // Cross-tenant: ask the wrong tenant for a staff id from this tenant
    const crossTenantAsk = await StaffService.getByIds(
      String(otherOrgId),
      String(otherLocationId),
      [String(callerStaff._id)],
    );
    assert(
      crossTenantAsk.length === 0,
      "refuses to return staff outside the requested tenant",
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
    await repl.stop();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
