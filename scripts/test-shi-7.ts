/**
 * SHI-7 service-layer smoke test.
 *
 * Validates the two service methods that back the mobile Home tab:
 *   - StaffService.getByClerkUserId
 *   - ShiftService.getNextForStaff
 *
 * Also re-checks AnnouncementService.list (already validated by SHI-11)
 * because the new /api/announcements route delegates straight to it.
 *
 * Runs against an in-memory MongoDB so no Atlas access is required.
 *
 * Usage from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-7.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Announcement from "../apps/web/src/server/models/Announcement";
import Shift from "../apps/web/src/server/models/Shift";
import Staff from "../apps/web/src/server/models/Staff";
import { AnnouncementService } from "../apps/web/src/server/services/announcement.service";
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

  await mongoose.connect(uri, { dbName: "sous_smoke_shi7" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();
  const scheduleId = new Types.ObjectId();
  const otherScheduleId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await Announcement.deleteMany({});
    await Shift.deleteMany({});
    await Staff.deleteMany({});
  };

  try {
    const clerkUserId = "user_test_shi7";

    const linkedStaff = await Staff.create({
      orgId,
      locationId,
      name: "Linked Cook",
      email: `linked-${Date.now()}@example.com`,
      phone: "5550001111",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      clerkUserId,
      invitationStatus: "accepted",
    });

    const unlinkedStaff = await Staff.create({
      orgId,
      locationId,
      name: "Lonely Cook",
      email: `lonely-${Date.now()}@example.com`,
      phone: "5550002222",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    // Cross-tenant noise: another Staff row with the same clerkUserId
    // in a different tenant. getByClerkUserId must NOT return it.
    await Staff.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      name: "Doppelgänger",
      email: `doppel-${Date.now()}@example.com`,
      phone: "5550003333",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      clerkUserId,
      invitationStatus: "accepted",
    });

    console.log("--- StaffService.getByClerkUserId ---");

    const resolved = await StaffService.getByClerkUserId(
      String(orgId),
      String(locationId),
      clerkUserId,
    );
    assert(
      resolved?.id === String(linkedStaff._id),
      "resolves the linked staff row in this tenant",
      `expected ${String(linkedStaff._id)}, got ${resolved?.id ?? "null"}`,
    );

    const wrongTenant = await StaffService.getByClerkUserId(
      String(orgId),
      String(otherLocationId),
      clerkUserId,
    );
    assert(
      wrongTenant === null,
      "does not leak cross-tenant rows (locationId mismatch)",
    );

    const noSuchUser = await StaffService.getByClerkUserId(
      String(orgId),
      String(locationId),
      "user_does_not_exist",
    );
    assert(
      noSuchUser === null,
      "returns null for unknown clerkUserId",
    );

    console.log("\n--- ShiftService.getNextForStaff ---");

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: linkedStaff._id,
      start: past,
      end: new Date(past.getTime() + 4 * 60 * 60 * 1000),
      station: "Prep",
      notes: "past",
    });

    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: linkedStaff._id,
      start: soon,
      end: new Date(soon.getTime() + 4 * 60 * 60 * 1000),
      station: "Sauté",
      notes: "next-up",
    });

    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await Shift.create({
      orgId,
      locationId,
      scheduleId,
      staffId: linkedStaff._id,
      start: later,
      end: new Date(later.getTime() + 4 * 60 * 60 * 1000),
      station: "Grill",
      notes: "later",
    });

    // Cross-tenant shift with the same staff document — must not leak.
    await Shift.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      scheduleId: otherScheduleId,
      staffId: linkedStaff._id,
      start: new Date(Date.now() + 30 * 60 * 1000),
      end: new Date(Date.now() + 90 * 60 * 1000),
      station: "Other Tenant",
      notes: "cross-tenant",
    });

    const nextShift = await ShiftService.getNextForStaff(
      String(orgId),
      String(locationId),
      String(linkedStaff._id),
    );
    assert(nextShift !== null, "returns the next shift");
    assert(
      nextShift?.notes === "next-up",
      "returns the soonest future shift (skips past, picks earliest of remaining)",
      `expected notes='next-up', got '${nextShift?.notes}'`,
    );
    assert(
      nextShift ? nextShift.start.getTime() >= Date.now() - 60_000 : false,
      "skips shifts whose start is in the past",
    );
    assert(
      nextShift?.station !== "Other Tenant",
      "does not return cross-tenant shifts",
    );

    const noneNext = await ShiftService.getNextForStaff(
      String(orgId),
      String(locationId),
      String(unlinkedStaff._id),
    );
    assert(
      noneNext === null,
      "returns null for staff with no upcoming shifts",
    );

    console.log("\n--- AnnouncementService.list (Home feed contract) ---");

    await Announcement.create({
      orgId,
      locationId,
      authorClerkUserId: clerkUserId,
      authorName: "Manager",
      title: "Older",
      body: "Older announcement.",
      priority: "normal",
      expiresAt: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await Announcement.create({
      orgId,
      locationId,
      authorClerkUserId: clerkUserId,
      authorName: "Manager",
      title: "Newer",
      body: "Newer announcement.",
      priority: "high",
      expiresAt: null,
    });
    // Cross-tenant noise
    await Announcement.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      authorClerkUserId: "user_other",
      authorName: "Other",
      title: "DO NOT LEAK",
      body: "Cross-tenant.",
      priority: "low",
      expiresAt: null,
    });

    const list = await AnnouncementService.list(
      String(orgId),
      String(locationId),
    );
    assert(
      list.length === 2,
      "returns only this tenant's announcements",
      `count=${list.length}`,
    );
    assert(
      list.every((a) => a.orgId === String(orgId)),
      "every row carries the caller's orgId",
    );
    assert(
      list[0].title === "Newer",
      "newest-first ordering",
      `got ${list.map((a) => a.title).join(", ")}`,
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
