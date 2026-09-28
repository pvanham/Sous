/**
 * Staff account sync smoke test.
 *
 * Covers the name helpers and the Mongo write rules that keep a linked
 * roster row aligned with Clerk:
 *   - splitName / composeAccountName round-trip
 *   - extractLastName still strips generational suffixes
 *   - bulkUpsert does not overwrite name on a linked row
 *   - clearPendingInvitation only resets a pending, unlinked invite
 *   - update still derives lastName for an unlinked row
 *
 * mirrorAccountFromClerk itself calls Clerk, so the UI walk-through
 * covers that path. This script stays on an in-memory MongoDB.
 *
 * Usage from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-staff-account-sync.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Staff from "../apps/web/src/server/models/Staff";
import {
  composeAccountName,
  extractLastName,
  splitName,
  StaffService,
} from "../apps/web/src/server/services/staff.service";

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

function staffInput(name: string, email: string) {
  return {
    name,
    email,
    phone: "5551234567",
    roles: ["Cook"],
    skills: [] as Array<{ station: string; proficiency: 1 | 2 | 3 | 4 | 5 }>,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 0,
    preferredStations: [] as string[],
    certifications: [] as string[],
    hourlyRate: 0,
  };
}

async function main(): Promise<void> {
  console.log("--- name helpers ---");

  const split = splitName("  Mary   Ann Smith  ");
  assert(split.firstName === "Mary", "splitName takes the first token", split.firstName);
  assert(
    split.lastName === "Ann Smith",
    "splitName keeps the rest as the last name",
    split.lastName,
  );
  assert(
    splitName("Cher").lastName === "",
    "a single token leaves the last name empty",
  );
  assert(
    composeAccountName("Mary", "Ann Smith") === "Mary Ann Smith",
    "composeAccountName joins with one space",
  );
  assert(
    composeAccountName("Cher", "") === "Cher",
    "composeAccountName drops an empty last name",
  );
  assert(
    composeAccountName("  ", null) === "",
    "composeAccountName is empty when Clerk has no name",
  );
  assert(
    composeAccountName(split.firstName, split.lastName) === "Mary Ann Smith",
    "split then compose round-trips a multi-word name",
  );
  assert(
    extractLastName("John Smith Jr.") === "smith",
    "extractLastName strips a generational suffix",
    extractLastName("John Smith Jr."),
  );

  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri(), { dbName: "sous_staff_account_sync" });
  console.log("\nConnected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const org = String(orgId);
  const location = String(locationId);

  try {
    console.log("--- bulkUpsert ---");

    await Staff.create({
      orgId,
      locationId,
      name: "Ashley Brooks",
      email: "ashley.brooks@example.com",
      phone: "5551000001",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      clerkUserId: "user_linked",
      invitationStatus: "accepted",
    });
    await Staff.create({
      orgId,
      locationId,
      name: "Pending Person",
      email: "pending.person@example.com",
      phone: "5551000002",
      roles: ["Cook"],
      skills: [],
      isActive: true,
      invitationStatus: "pending",
      clerkInvitationId: "inv_old",
    });

    await StaffService.bulkUpsert(org, location, [
      staffInput("Ashley Overwrite", "ashley.brooks@example.com"),
      staffInput("Pending Renamed", "pending.person@example.com"),
      staffInput("New Hire", "new.hire@example.com"),
    ]);

    const linked = await Staff.findOne({ email: "ashley.brooks@example.com" }).lean();
    const pending = await Staff.findOne({ email: "pending.person@example.com" }).lean();
    const created = await Staff.findOne({ email: "new.hire@example.com" }).lean();

    assert(linked?.name === "Ashley Brooks", "CSV leaves a linked name alone", linked?.name);
    assert(
      linked?.phone === "5551234567",
      "CSV still updates other fields on a linked row",
      linked?.phone,
    );
    assert(pending?.name === "Pending Renamed", "CSV renames an unlinked row", pending?.name);
    assert(
      pending?.lastName === "renamed",
      "CSV refreshes lastName on an unlinked row",
      pending?.lastName,
    );
    assert(created?.name === "New Hire", "CSV insert sets the name", created?.name);
    assert(created?.lastName === "hire", "CSV insert sets lastName", created?.lastName);

    console.log("--- clearPendingInvitation ---");

    const cleared = await StaffService.clearPendingInvitation(
      org,
      location,
      String(pending?._id),
    );
    assert(
      cleared?.invitationStatus === "not_invited",
      "clearing a pending invite resets the status",
      cleared?.invitationStatus,
    );
    const clearedDoc = await Staff.findById(pending?._id).lean();
    assert(
      clearedDoc?.clerkInvitationId === null,
      "clearing a pending invite drops the invitation id",
      String(clearedDoc?.clerkInvitationId),
    );

    const acceptedUntouched = await StaffService.clearPendingInvitation(
      org,
      location,
      String(linked?._id),
    );
    assert(
      acceptedUntouched?.invitationStatus === "accepted",
      "clearing does not downgrade an accepted row",
      acceptedUntouched?.invitationStatus,
    );

    console.log("--- unlinked update ---");

    const updated = await StaffService.update(org, location, String(pending?._id), {
      name: "Pending Person Jr.",
    });
    assert(updated?.name === "Pending Person Jr.", "update writes the new name");
    assert(
      updated ? extractLastName(updated.name) === "person" : false,
      "update derives lastName and strips Jr",
    );
    const updatedDoc = await Staff.findById(pending?._id).lean();
    assert(updatedDoc?.lastName === "person", "stored lastName is person", updatedDoc?.lastName);
  } finally {
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
