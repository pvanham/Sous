/**
 * SHI-9 service-layer smoke test.
 *
 * Validates the persistence + DTO surface that backs the mobile
 * Time-off tab route handlers (`GET` and `POST` on `/api/time-off`):
 *   - TimeOffRequestService.create  (now persists `type`)
 *   - TimeOffRequestService.getByStaffId
 *   - submitTimeOffRequestSchema    (mobile-only Zod variant)
 *
 * Runs against an in-memory MongoDB so no Atlas access is required.
 *
 * Usage from the repo root:
 *   cd apps/web && npx tsx ../../scripts/test-shi-9.ts
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import TimeOffRequest from "../apps/web/src/server/models/TimeOffRequest";
import Staff from "../apps/web/src/server/models/Staff";
import { TimeOffRequestService } from "../apps/web/src/server/services/time-off-request.service";
import { submitTimeOffRequestSchema } from "@sous/types/validations/time-off-request.schema";

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

  await mongoose.connect(uri, { dbName: "sous_smoke_shi9" });
  console.log("Connected to in-memory MongoDB\n");

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await TimeOffRequest.deleteMany({});
    await Staff.deleteMany({});
  };

  try {
    // Seed two staff members in this tenant + one in a different
    // tenant to make sure scoping holds.
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

    const otherStaff = await Staff.create({
      orgId,
      locationId,
      name: "Jordan Other",
      email: `jordan-${Date.now()}@example.com`,
      phone: "5550000002",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    const crossTenantStaff = await Staff.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      name: "Cross Tenant",
      email: `xt-${Date.now()}@example.com`,
      phone: "5550000003",
      roles: ["Cook"],
      skills: [],
      isActive: true,
    });

    // Pick dates safely past the default 7-day advance-notice window
    // so we don't conflate the schema's "no past dates" rule with the
    // route handler's KitchenConfig rule.
    const startA = new Date();
    startA.setDate(startA.getDate() + 30);
    startA.setHours(0, 0, 0, 0);
    const endA = new Date(startA);
    endA.setDate(endA.getDate() + 2);

    const startB = new Date();
    startB.setDate(startB.getDate() + 60);
    startB.setHours(0, 0, 0, 0);
    const endB = new Date(startB);

    console.log("--- submitTimeOffRequestSchema ---");

    const validParse = submitTimeOffRequestSchema.safeParse({
      startDate: startA.toISOString(),
      endDate: endA.toISOString(),
      type: "sick",
      reason: "Flu",
    });
    assert(validParse.success, "accepts a well-formed mobile payload");

    const noStaffIdParse = submitTimeOffRequestSchema.safeParse({
      staffId: String(callerStaff._id),
      startDate: startA.toISOString(),
      endDate: endA.toISOString(),
      type: "pto",
    });
    // staffId is silently dropped (Zod default behavior), and the
    // critical thing is that it does not cause parse failure.
    assert(
      noStaffIdParse.success,
      "ignores a staffId field if the client mistakenly sends one",
    );

    const missingTypeParse = submitTimeOffRequestSchema.safeParse({
      startDate: startA.toISOString(),
      endDate: endA.toISOString(),
    });
    assert(
      !missingTypeParse.success,
      "rejects a mobile payload that is missing `type`",
    );

    const pastStartParse = submitTimeOffRequestSchema.safeParse({
      startDate: new Date("2020-01-01").toISOString(),
      endDate: new Date("2020-01-02").toISOString(),
      type: "pto",
    });
    assert(
      !pastStartParse.success,
      "rejects a start date in the past",
    );

    const reversedParse = submitTimeOffRequestSchema.safeParse({
      startDate: endA.toISOString(),
      endDate: startA.toISOString(),
      type: "pto",
    });
    assert(
      !reversedParse.success,
      "rejects an endDate that is before startDate",
    );

    console.log("\n--- TimeOffRequestService.create persists `type` ---");

    const createdSick = await TimeOffRequestService.create(
      String(orgId),
      String(locationId),
      {
        staffId: String(callerStaff._id),
        startDate: startA,
        endDate: endA,
        type: "sick",
        reason: "Flu",
      },
    );
    assert(
      createdSick.type === "sick",
      "round-trips the `type` field",
      `got ${createdSick.type}`,
    );
    assert(
      createdSick.status === "pending",
      "defaults `status` to pending on create",
    );
    assert(
      createdSick.staffId === String(callerStaff._id),
      "stamps the right staffId on the DTO",
    );

    const createdDefaulted = await TimeOffRequestService.create(
      String(orgId),
      String(locationId),
      {
        staffId: String(otherStaff._id),
        startDate: startB,
        endDate: endB,
        // type omitted — service should default to "pto"
        reason: "Family event",
      },
    );
    assert(
      createdDefaulted.type === "pto",
      "defaults `type` to 'pto' when omitted",
      `got ${createdDefaulted.type}`,
    );

    console.log("\n--- TimeOffRequestService.getByStaffId scoping ---");

    // Cross-tenant request that must NOT leak.
    await TimeOffRequest.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      staffId: crossTenantStaff._id,
      startDate: startA,
      endDate: endA,
      reason: "noise",
      status: "pending",
      type: "pto",
      notes: "",
    });

    const callerHistory = await TimeOffRequestService.getByStaffId(
      String(orgId),
      String(locationId),
      String(callerStaff._id),
    );
    assert(
      callerHistory.length === 1,
      "returns only the caller's requests",
      `got ${callerHistory.length}`,
    );
    assert(
      callerHistory[0]?.type === "sick",
      "history preserves the `type` field",
    );
    assert(
      callerHistory.every(
        (r) => r.orgId === String(orgId) && r.locationId === String(locationId),
      ),
      "does not leak cross-tenant requests",
    );

    const otherHistory = await TimeOffRequestService.getByStaffId(
      String(orgId),
      String(locationId),
      String(otherStaff._id),
    );
    assert(
      otherHistory.length === 1 && otherHistory[0].type === "pto",
      "isolates per-staff history",
    );

    console.log("\n--- legacy doc backfill ---");

    // Insert a row that pre-dates the `type` field. The DTO converter
    // should default it to "pto" so consumers always see a value.
    const legacy = await TimeOffRequest.collection.insertOne({
      orgId,
      locationId,
      staffId: callerStaff._id,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-03"),
      reason: "legacy row",
      status: "approved",
      notes: "",
      reviewedAt: new Date("2023-12-25"),
      reviewedBy: "user_manager",
      createdAt: new Date("2023-12-20"),
      updatedAt: new Date("2023-12-25"),
    });
    const allCallerRequests = await TimeOffRequestService.getByStaffId(
      String(orgId),
      String(locationId),
      String(callerStaff._id),
    );
    const legacyDto = allCallerRequests.find((r) => r.id === String(legacy.insertedId));
    assert(
      legacyDto?.type === "pto",
      "DTO converter backfills missing `type` to 'pto'",
      `got ${legacyDto?.type}`,
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
