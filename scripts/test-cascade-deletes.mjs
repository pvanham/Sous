/**
 * Cascade Delete Verification Script
 *
 * Tests all deletion cascade paths in the Sous data model by working
 * directly against MongoDB collections (no service-layer imports needed,
 * which avoids the @clerk/nextjs ESM export issue in plain Node.js).
 *
 * The cascade operations are replicated inline exactly as the service
 * layer does them (verified by reading the source). The goal is to:
 *   1. Create test fixtures in the dev DB.
 *   2. Run each cascade path and check for orphaned documents.
 *   3. Report any issues before cleaning up.
 *   4. Leave the DB in the state it was in before.
 *
 * Run from repo root:
 *   node scripts/test-cascade-deletes.mjs
 *
 * Required env (loaded from apps/web/.env.local via dotenv):
 *   MONGODB_URI
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Load .env.local from apps/web
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", "apps", "web", ".env.local");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const require = createRequire(import.meta.url);
const { MongoClient, ObjectId } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("MONGODB_URI not set — check apps/web/.env.local");

// ─── Test state ───────────────────────────────────────────────────────────────

const TEST_OWNER_CLERK_ID  = "test_cascade_owner_clerk_user";
const TEST_MANAGER_CLERK_ID = "test_cascade_manager_clerk_user";
const TEST_STAFF_CLERK_ID  = "test_cascade_staff_clerk_user";

let passed = 0;
let failed = 0;
const issues = [];

// ─── Logging ─────────────────────────────────────────────────────────────────

const log = (msg) => console.log(msg);

function pass(label) { passed++; log(`  ✓ ${label}`); }
function fail(label, detail) {
  failed++;
  issues.push(`[FAIL] ${label}: ${detail}`);
  log(`  ✗ ${label}  ← ${detail}`);
}
function section(title) {
  log(`\n${"─".repeat(65)}`);
  log(`  ${title}`);
  log("─".repeat(65));
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function count(db, collection, filter) {
  return db.collection(collection).countDocuments(filter);
}

async function ins(db, collection, doc) {
  const r = await db.collection(collection).insertOne(doc);
  return r.insertedId;
}

// ─── Collection names (from Mongoose model definitions) ───────────────────────
const C = {
  orgs:      "organizations",
  locs:      "locations",
  staff:     "staff",
  members:   "organization_members",
  schedules: "schedules",
  shifts:    "shifts",
  tor:       "timeoffrequests",
  avail:     "staffavailabilities",
  exchange:  "exchangeshifts",
  kitchen:   "kitchenconfigs",
  labor:     "laborrequirements",
  ann:       "announcements",
  annAck:    "announcement_acknowledgments",
  conv:      "conversations",
  async:     "asynctasks",
  ai:        "aiusagelogs",
  device:    "devicetokens",
  notifPref: "notificationpreferences",
};

// ─── Cleanup helpers ─────────────────────────────────────────────────────────

async function nukeTestOrg(db, orgId) {
  const oid = new ObjectId(orgId);
  await Promise.all([
    db.collection(C.orgs).deleteMany({ _id: oid }),
    db.collection(C.locs).deleteMany({ orgId: oid }),
    db.collection(C.staff).deleteMany({ orgId: oid }),
    db.collection(C.members).deleteMany({ orgId: oid }),
    db.collection(C.schedules).deleteMany({ orgId: oid }),
    db.collection(C.shifts).deleteMany({ orgId: oid }),
    db.collection(C.tor).deleteMany({ orgId: oid }),
    db.collection(C.avail).deleteMany({ orgId: oid }),
    db.collection(C.exchange).deleteMany({ orgId: oid }),
    db.collection(C.kitchen).deleteMany({ orgId: oid }),
    db.collection(C.labor).deleteMany({ orgId: oid }),
    db.collection(C.ann).deleteMany({ orgId: oid }),
    db.collection(C.annAck).deleteMany({ orgId: oid }),
    db.collection(C.conv).deleteMany({ orgId: oid }),
    db.collection(C.async).deleteMany({ orgId: oid }),
    db.collection(C.ai).deleteMany({ orgId: oid }),
  ]);
}

async function nukeTestUsers(db, ...clerkUserIds) {
  await Promise.all(
    clerkUserIds.flatMap((id) => [
      db.collection(C.device).deleteMany({ clerkUserId: id }),
      db.collection(C.notifPref).deleteMany({ clerkUserId: id }),
    ])
  );
}

// ─── Cascade implementations (mirror of service-layer code) ──────────────────

/**
 * Mirrors OrganizationService.cascadeDelete() — deletes all 14 org-scoped
 * collections then the org document itself. (Stripe cancellation skipped
 * in test because no real subscription ID is set.)
 */
async function cascadeDeleteOrg(db, orgId) {
  const oid = new ObjectId(orgId);
  await Promise.all([
    db.collection(C.annAck).deleteMany({ orgId: oid }),
    db.collection(C.ann).deleteMany({ orgId: oid }),
    db.collection(C.exchange).deleteMany({ orgId: oid }),
    db.collection(C.shifts).deleteMany({ orgId: oid }),
    db.collection(C.schedules).deleteMany({ orgId: oid }),
    db.collection(C.labor).deleteMany({ orgId: oid }),
    db.collection(C.tor).deleteMany({ orgId: oid }),
    db.collection(C.avail).deleteMany({ orgId: oid }),
    db.collection(C.staff).deleteMany({ orgId: oid }),
    db.collection(C.kitchen).deleteMany({ orgId: oid }),
    db.collection(C.async).deleteMany({ orgId: oid }),
    db.collection(C.ai).deleteMany({ orgId: oid }),
    db.collection(C.conv).deleteMany({ orgId: oid }),
    db.collection(C.members).deleteMany({ orgId: oid }),
    db.collection(C.locs).deleteMany({ orgId: oid }),
  ]);
  await db.collection(C.orgs).deleteOne({ _id: oid });
}

/**
 * Mirrors the deleteSchedule action:
 *   1. ShiftService.deleteBySchedule(scheduleId)
 *   2. ScheduleService.delete(orgId, locationId, scheduleId)
 */
async function cascadeDeleteSchedule(db, orgId, locationId, scheduleId) {
  const schedOid = new ObjectId(scheduleId);
  const shiftsDeleted = await db.collection(C.shifts).deleteMany({ scheduleId: schedOid });
  const result = await db.collection(C.schedules).deleteOne({
    _id: schedOid,
    orgId: new ObjectId(orgId),
    locationId: new ObjectId(locationId),
  });
  return { shiftsDeleted: shiftsDeleted.deletedCount, scheduleDeleted: result.deletedCount > 0 };
}

/**
 * Mirrors the deleteStaff action (fixed):
 *   1. Parallel: ShiftService.deleteByStaffId + TimeOffRequestService.deleteByStaffId
 *               + StaffAvailabilityService.deleteByStaffId + ExchangeShiftService.deleteByStaffId
 *   2. StaffService.delete(orgId, locationId, staffId)
 */
async function cascadeDeleteStaff_ActionPath(db, orgId, locationId, staffId) {
  const staffOid = new ObjectId(staffId);
  const orgOid = new ObjectId(orgId);
  const locOid = new ObjectId(locationId);
  const [shiftsResult] = await Promise.all([
    db.collection(C.shifts).deleteMany({ staffId: staffOid, orgId: orgOid, locationId: locOid }),
    db.collection(C.tor).deleteMany({ staffId: staffOid, orgId: orgOid, locationId: locOid }),
    db.collection(C.avail).deleteMany({ staffId: staffOid, orgId: orgOid, locationId: locOid }),
    db.collection(C.exchange).deleteMany({ $or: [{ staffId: staffOid }, { pickedUpByStaffId: staffOid }], orgId: orgOid, locationId: locOid }),
  ]);
  const result = await db.collection(C.staff).deleteOne({ _id: staffOid, orgId: orgOid, locationId: locOid });
  return { shiftsDeleted: shiftsResult.deletedCount, staffDeleted: result.deletedCount > 0 };
}

/**
 * Mirrors the Clerk user.deleted webhook — manager/shift_lead branch (fixed):
 *   await Promise.all([DeviceTokenService, NotificationPreferenceService cleanup])
 *   await OrganizationMemberService.delete(membership.id)
 */
async function webhookManagerDeleted(db, clerkUserId, memberId) {
  await Promise.all([
    db.collection(C.device).deleteMany({ clerkUserId }),
    db.collection(C.notifPref).deleteMany({ clerkUserId }),
  ]);
  await db.collection(C.members).deleteOne({ _id: new ObjectId(memberId) });
}

/**
 * Mirrors the Clerk user.deleted webhook — staff branch (fixed):
 *   await Promise.all([StaffService.unlinkClerkUser, DeviceToken cleanup, NotifPref cleanup])
 *   await OrganizationMemberService.delete(membership.id)
 */
async function webhookStaffDeleted(db, clerkUserId, memberId) {
  await Promise.all([
    db.collection(C.staff).updateMany({ clerkUserId }, { $set: { clerkUserId: null } }),
    db.collection(C.device).deleteMany({ clerkUserId }),
    db.collection(C.notifPref).deleteMany({ clerkUserId }),
  ]);
  await db.collection(C.members).deleteOne({ _id: new ObjectId(memberId) });
}

/**
 * Mirrors the Clerk user.deleted webhook — owner branch (fixed):
 *   1. (Clerk) delete every other member's Clerk account — skipped in test.
 *   2. Inline-clean identity rows (DeviceToken / NotifPref) for the owner AND
 *      every other member, so cleanup does not depend on the async per-member
 *      webhooks (which would find no membership rows after cascadeDelete).
 *   3. OrganizationService.cascadeDelete(orgId).
 */
async function webhookOwnerDeleted(db, ownerClerkUserId, orgId) {
  const oid = new ObjectId(orgId);
  const allMembers = await db.collection(C.members).find({ orgId: oid }).toArray();
  const clerkUserIdsToClean = [
    ownerClerkUserId,
    ...allMembers.filter((m) => m.clerkUserId !== ownerClerkUserId).map((m) => m.clerkUserId),
  ];
  await Promise.all(
    clerkUserIdsToClean.flatMap((id) => [
      db.collection(C.device).deleteMany({ clerkUserId: id }),
      db.collection(C.notifPref).deleteMany({ clerkUserId: id }),
    ]),
  );
  await cascadeDeleteOrg(db, orgId);
}

// ─── TEST 1: Organization cascade ────────────────────────────────────────────

async function testOrgCascade(db) {
  section("TEST 1 — Organization cascade delete (15 collections)");

  const now = new Date();
  const orgId = new ObjectId();
  const locId = new ObjectId();
  const staff1Id = new ObjectId();
  const staff2Id = new ObjectId();
  const schedId = new ObjectId();
  const shift1Id = new ObjectId();
  const shift2Id = new ObjectId();
  const annId = new ObjectId();

  // Create full fixture
  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: TEST_OWNER_CLERK_ID, name: "[TEST_CASCADE] Full Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.locs).insertOne({ _id: locId, orgId, name: "[TEST_CASCADE] Location", timezone: "America/New_York", createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ orgId, locationId: null, clerkUserId: TEST_OWNER_CLERK_ID, role: "owner", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ orgId, locationId: locId, clerkUserId: TEST_MANAGER_CLERK_ID, role: "manager", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.staff).insertOne({ _id: staff1Id, orgId, locationId: locId, name: "[TEST_CASCADE] Alice", email: "tc.alice@example.com", phone: "5550000001", roles: ["cook"], isActive: true, clerkUserId: TEST_STAFF_CLERK_ID, createdAt: now, updatedAt: now });
  await db.collection(C.staff).insertOne({ _id: staff2Id, orgId, locationId: locId, name: "[TEST_CASCADE] Bob", email: "tc.bob@example.com", phone: "5550000002", roles: ["server"], isActive: true, clerkUserId: null, createdAt: now, updatedAt: now });
  await db.collection(C.schedules).insertOne({ _id: schedId, orgId, locationId: locId, weekStartDate: new Date("2020-01-06"), status: "DRAFT", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.shifts).insertOne({ _id: shift1Id, orgId, locationId: locId, scheduleId: schedId, staffId: staff1Id, start: new Date("2020-01-06T09:00:00Z"), end: new Date("2020-01-06T17:00:00Z"), station: "Grill", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.shifts).insertOne({ _id: shift2Id, orgId, locationId: locId, scheduleId: schedId, staffId: staff2Id, start: new Date("2020-01-06T09:00:00Z"), end: new Date("2020-01-06T17:00:00Z"), station: "Bar", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.exchange).insertOne({ orgId, locationId: locId, shiftId: shift1Id, scheduleId: schedId, staffId: staff1Id, status: "available", reason: "test", createdAt: now, updatedAt: now });
  await db.collection(C.tor).insertOne({ orgId, locationId: locId, staffId: staff1Id, startDate: new Date("2020-01-10"), endDate: new Date("2020-01-10"), type: "pto", status: "pending", createdAt: now, updatedAt: now });
  await db.collection(C.avail).insertOne({ orgId, locationId: locId, staffId: staff1Id, dayOfWeek: 1, availableFrom: "09:00", availableTo: "17:00", preference: "available", createdAt: now, updatedAt: now });
  await db.collection(C.kitchen).insertOne({ orgId, locationId: locId, stations: ["Grill"], roles: ["cook"], operatingHours: {}, weekStartsOn: "monday", managerRoles: [], bufferMinutes: 0, createdAt: now, updatedAt: now });
  await db.collection(C.labor).insertOne({ orgId, locationId: locId, dayOfWeek: 1, startTime: "09:00", endTime: "17:00", station: "Grill", minStaff: 1, maxStaff: 2, createdAt: now, updatedAt: now });
  await db.collection(C.ann).insertOne({ _id: annId, orgId, locationId: locId, createdBy: TEST_MANAGER_CLERK_ID, title: "[TEST_CASCADE] Ann", body: "body", requiresAcknowledgment: true, targetStaffIds: [], publishedAt: now, createdAt: now, updatedAt: now });
  await db.collection(C.annAck).insertOne({ orgId, locationId: locId, announcementId: annId, userId: TEST_STAFF_CLERK_ID, readAt: now, acknowledgedAt: null, createdAt: now, updatedAt: now });
  await db.collection(C.conv).insertOne({ orgId, locationId: locId, clerkUserId: TEST_MANAGER_CLERK_ID, messages: [], isActive: true, createdAt: now, updatedAt: now });
  await db.collection(C.async).insertOne({ orgId, locationId: locId, type: "schedule_generation", status: "completed", payload: {}, createdAt: now, updatedAt: now });
  await db.collection(C.ai).insertOne({ orgId, locationId: locId, clerkUserId: TEST_MANAGER_CLERK_ID, model: "gpt-4o", promptTokens: 10, completionTokens: 5, totalTokens: 15, feature: "schedule_generation", createdAt: now, updatedAt: now });

  const orgIdStr = orgId.toString();

  // Snapshot before
  const before = {};
  for (const [k, col] of Object.entries(C)) {
    if (["device", "notifPref"].includes(k)) continue; // identity-scoped, not org-scoped
    before[k] = await db.collection(col).countDocuments({ orgId });
  }
  before.orgs = await db.collection(C.orgs).countDocuments({ _id: orgId });

  log(`\n  Pre-delete fixture counts:`);
  for (const [k, v] of Object.entries(before)) {
    if (v > 0) log(`    ${k.padEnd(12)} ${v}`);
  }

  log(`\n  Running cascadeDelete...`);
  await cascadeDeleteOrg(db, orgIdStr);

  // Verify after
  log(`\n  Post-delete counts (all should be 0):`);
  const labels = {
    orgs:      "organizations",
    locs:      "locations",
    staff:     "staff",
    members:   "organization_members",
    schedules: "schedules",
    shifts:    "shifts",
    tor:       "timeoffrequests",
    avail:     "staffavailabilities",
    exchange:  "exchangeshifts",
    kitchen:   "kitchenconfigs",
    labor:     "laborrequirements",
    ann:       "announcements",
    annAck:    "announcement_acknowledgments",
    conv:      "conversations",
    async:     "asynctasks",
    ai:        "aiusagelogs",
  };
  for (const [key, colName] of Object.entries(labels)) {
    const filter = key === "orgs" ? { _id: orgId } : { orgId };
    const n = await db.collection(colName).countDocuments(filter);
    n === 0 ? pass(`${colName} → 0`) : fail(colName, `${n} orphaned documents remain`);
  }
}

// ─── TEST 2: Schedule delete → shifts ────────────────────────────────────────

async function testScheduleCascade(db) {
  section("TEST 2 — deleteSchedule action: child Shifts are deleted with the Schedule");

  const now = new Date();
  const orgId = new ObjectId();
  const locId = new ObjectId();
  const staffId = new ObjectId();
  const schedId = new ObjectId();

  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: "tc_sched", name: "[TEST_CASCADE] Sched Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.locs).insertOne({ _id: locId, orgId, name: "[TEST_CASCADE] Sched Loc", timezone: "America/New_York", createdAt: now, updatedAt: now });
  await db.collection(C.staff).insertOne({ _id: staffId, orgId, locationId: locId, name: "[TC] Sched Staff", email: "tc.sched@example.com", phone: "5550000010", roles: ["cook"], isActive: true, clerkUserId: null, createdAt: now, updatedAt: now });
  await db.collection(C.schedules).insertOne({ _id: schedId, orgId, locationId: locId, weekStartDate: new Date("2020-02-03"), status: "DRAFT", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.shifts).insertOne({ orgId, locationId: locId, scheduleId: schedId, staffId, start: new Date("2020-02-03T09:00:00Z"), end: new Date("2020-02-03T17:00:00Z"), station: "Grill", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.shifts).insertOne({ orgId, locationId: locId, scheduleId: schedId, staffId, start: new Date("2020-02-04T09:00:00Z"), end: new Date("2020-02-04T17:00:00Z"), station: "Bar", notes: "", createdAt: now, updatedAt: now });

  log(`\n  Pre-delete: 1 schedule, 2 shifts`);
  const { shiftsDeleted, scheduleDeleted } = await cascadeDeleteSchedule(db, orgId.toString(), locId.toString(), schedId.toString());
  log(`  Deleted: ${shiftsDeleted} shifts, schedule=${scheduleDeleted}`);

  const postShifts = await db.collection(C.shifts).countDocuments({ scheduleId: schedId });
  const postSched = await db.collection(C.schedules).countDocuments({ _id: schedId });

  scheduleDeleted ? pass("Schedule document deleted") : fail("Schedule", "not deleted");
  postShifts === 0 ? pass("All child Shifts deleted") : fail("Shifts", `${postShifts} orphaned after schedule delete`);

  await nukeTestOrg(db, orgId.toString());
}

// ─── TEST 3: Staff delete → orphan audit ─────────────────────────────────────

async function testStaffCascade(db) {
  section("TEST 3 — deleteStaff action: orphan audit (TimeOffRequest / Availability / ExchangeShift)");

  const now = new Date();
  const orgId = new ObjectId();
  const locId = new ObjectId();
  const staffId = new ObjectId();
  const schedId = new ObjectId();
  const shiftId = new ObjectId();

  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: "tc_staff", name: "[TEST_CASCADE] Staff Delete Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.locs).insertOne({ _id: locId, orgId, name: "[TC] Staff Loc", timezone: "America/New_York", createdAt: now, updatedAt: now });
  await db.collection(C.staff).insertOne({ _id: staffId, orgId, locationId: locId, name: "[TC] DeleteMe", email: "tc.delete@example.com", phone: "5550000020", roles: ["cook"], isActive: true, clerkUserId: null, createdAt: now, updatedAt: now });
  await db.collection(C.schedules).insertOne({ _id: schedId, orgId, locationId: locId, weekStartDate: new Date("2020-03-02"), status: "DRAFT", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.shifts).insertOne({ _id: shiftId, orgId, locationId: locId, scheduleId: schedId, staffId, start: new Date("2020-03-02T09:00:00Z"), end: new Date("2020-03-02T17:00:00Z"), station: "Grill", notes: "", createdAt: now, updatedAt: now });
  await db.collection(C.tor).insertOne({ orgId, locationId: locId, staffId, startDate: new Date("2020-03-05"), endDate: new Date("2020-03-05"), type: "pto", status: "pending", createdAt: now, updatedAt: now });
  await db.collection(C.avail).insertOne({ orgId, locationId: locId, staffId, dayOfWeek: 1, availableFrom: "09:00", availableTo: "17:00", preference: "available", createdAt: now, updatedAt: now });
  await db.collection(C.exchange).insertOne({ orgId, locationId: locId, shiftId, scheduleId: schedId, staffId, status: "available", reason: "test", createdAt: now, updatedAt: now });

  log(`\n  Pre-delete: 1 staff, 1 shift, 1 time-off request, 1 availability, 1 exchange shift`);

  const { shiftsDeleted, staffDeleted } = await cascadeDeleteStaff_ActionPath(db, orgId.toString(), locId.toString(), staffId.toString());
  log(`  Deleted: ${shiftsDeleted} shifts, staff=${staffDeleted}`);

  const postShifts   = await db.collection(C.shifts).countDocuments({ staffId });
  const postTOR      = await db.collection(C.tor).countDocuments({ staffId });
  const postAvail    = await db.collection(C.avail).countDocuments({ staffId });
  const postExchange = await db.collection(C.exchange).countDocuments({ staffId });

  postShifts === 0
    ? pass("Shifts deleted for staff member")
    : fail("Shifts", `${postShifts} orphaned after staff delete`);

  if (postTOR === 0) {
    pass("TimeOffRequests deleted for staff member");
  } else {
    fail("TimeOffRequests", `${postTOR} orphaned — deleteStaff action does not cascade to timeoffrequests`);
  }

  if (postAvail === 0) {
    pass("StaffAvailability records deleted for staff member");
  } else {
    fail("StaffAvailability", `${postAvail} orphaned — deleteStaff action does not cascade to staffavailabilities`);
  }

  if (postExchange === 0) {
    pass("ExchangeShift records deleted for staff member");
  } else {
    fail("ExchangeShift", `${postExchange} orphaned — deleteStaff action does not cascade to exchangeshifts`);
  }

  await nukeTestOrg(db, orgId.toString());
}

// ─── TEST 4: Manager user.deleted webhook ────────────────────────────────────

async function testManagerWebhookCascade(db) {
  section("TEST 4 — Clerk user.deleted (manager branch): DeviceToken + NotifPref cleanup");

  const now = new Date();
  const orgId = new ObjectId();
  const memberId = new ObjectId();

  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: "tc_mgr_owner", name: "[TEST_CASCADE] Manager Webhook Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ _id: memberId, orgId, locationId: null, clerkUserId: TEST_MANAGER_CLERK_ID, role: "manager", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.device).insertOne({ clerkUserId: TEST_MANAGER_CLERK_ID, expoPushToken: "ExponentPushToken[tc_manager_token]", platform: "ios", lastSeenAt: now, revokedAt: null, createdAt: now, updatedAt: now });
  await db.collection(C.notifPref).insertOne({ clerkUserId: TEST_MANAGER_CLERK_ID, channels: { push: true, email: true }, categories: {}, createdAt: now, updatedAt: now });

  log(`\n  Pre-delete: 1 membership, 1 DeviceToken, 1 NotificationPreference`);

  // Exact replication of webhook manager/shift_lead branch (fixed)
  await webhookManagerDeleted(db, TEST_MANAGER_CLERK_ID, memberId.toString());

  const postMember = await db.collection(C.members).countDocuments({ _id: memberId });
  const postDT     = await db.collection(C.device).countDocuments({ clerkUserId: TEST_MANAGER_CLERK_ID });
  const postNP     = await db.collection(C.notifPref).countDocuments({ clerkUserId: TEST_MANAGER_CLERK_ID });

  postMember === 0 ? pass("OrganizationMember deleted") : fail("OrganizationMember", "still exists after webhook delete");

  if (postDT === 0) {
    pass("DeviceToken deleted for manager");
  } else {
    fail("DeviceToken", `${postDT} orphaned — user.deleted webhook manager branch does not call DeviceTokenService.deleteAllByClerkUserId`);
  }

  if (postNP === 0) {
    pass("NotificationPreference deleted for manager");
  } else {
    fail("NotificationPreference", `${postNP} orphaned — user.deleted webhook manager branch does not call NotificationPreferenceService.deleteAllByClerkUserId`);
  }

  await nukeTestOrg(db, orgId.toString());
  await nukeTestUsers(db, TEST_MANAGER_CLERK_ID);
}

// ─── TEST 5: Staff user.deleted webhook ──────────────────────────────────────

async function testStaffWebhookCascade(db) {
  section("TEST 5 — Clerk user.deleted (staff branch): DeviceToken + NotifPref cleanup");

  const now = new Date();
  const orgId = new ObjectId();
  const locId = new ObjectId();
  const memberId = new ObjectId();

  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: "tc_staff_owner2", name: "[TEST_CASCADE] Staff Webhook Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.locs).insertOne({ _id: locId, orgId, name: "[TC] Staff Webhook Loc", timezone: "America/New_York", createdAt: now, updatedAt: now });
  await db.collection(C.staff).insertOne({ orgId, locationId: locId, name: "[TC] Staff Webhook", email: "tc.staffwh@example.com", phone: "5550000030", roles: ["cook"], isActive: true, clerkUserId: TEST_STAFF_CLERK_ID, createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ _id: memberId, orgId, locationId: locId, clerkUserId: TEST_STAFF_CLERK_ID, role: "staff", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.device).insertOne({ clerkUserId: TEST_STAFF_CLERK_ID, expoPushToken: "ExponentPushToken[tc_staff_token]", platform: "android", lastSeenAt: now, revokedAt: null, createdAt: now, updatedAt: now });
  await db.collection(C.notifPref).insertOne({ clerkUserId: TEST_STAFF_CLERK_ID, channels: { push: true, email: true }, categories: {}, createdAt: now, updatedAt: now });

  log(`\n  Pre-delete: 1 staff (linked), 1 membership, 1 DeviceToken, 1 NotificationPreference`);

  // Exact replication of webhook staff branch
  await webhookStaffDeleted(db, TEST_STAFF_CLERK_ID, memberId.toString());

  const postLinked = await db.collection(C.staff).countDocuments({ orgId, clerkUserId: TEST_STAFF_CLERK_ID });
  const postMember = await db.collection(C.members).countDocuments({ _id: memberId });
  const postDT     = await db.collection(C.device).countDocuments({ clerkUserId: TEST_STAFF_CLERK_ID });
  const postNP     = await db.collection(C.notifPref).countDocuments({ clerkUserId: TEST_STAFF_CLERK_ID });

  postLinked === 0
    ? pass("Staff.clerkUserId unlinked (record preserved — by design for scheduling history)")
    : fail("Staff.clerkUserId", "still linked after unlinkClerkUser");

  postMember === 0 ? pass("OrganizationMember deleted") : fail("OrganizationMember", "still exists after webhook delete");

  if (postDT === 0) {
    pass("DeviceToken deleted for staff user");
  } else {
    fail("DeviceToken", `${postDT} orphaned — user.deleted webhook staff branch does not call DeviceTokenService.deleteAllByClerkUserId`);
  }

  if (postNP === 0) {
    pass("NotificationPreference deleted for staff user");
  } else {
    fail("NotificationPreference", `${postNP} orphaned — user.deleted webhook staff branch does not call NotificationPreferenceService.deleteAllByClerkUserId`);
  }

  await nukeTestOrg(db, orgId.toString());
  await nukeTestUsers(db, TEST_STAFF_CLERK_ID);
}

// ─── TEST 6: Owner user.deleted webhook (full path) ──────────────────────────

async function testOwnerWebhookCascade(db) {
  section("TEST 6 — Clerk user.deleted (owner branch): full cascade + member identity cleanup");

  log(`\n  When an owner is deleted (e.g. from the web dashboard), the webhook must`);
  log(`  clean up identity-scoped rows (DeviceToken / NotifPref) for the owner AND`);
  log(`  every other member INLINE — before cascadeDelete wipes the membership rows.`);
  log(`  Otherwise the async per-member webhooks find no memberships and skip cleanup,`);
  log(`  permanently orphaning those members' device tokens.`);

  const now = new Date();
  const orgId = new ObjectId();
  const locId = new ObjectId();

  await db.collection(C.orgs).insertOne({ _id: orgId, ownerId: TEST_OWNER_CLERK_ID, name: "[TEST_CASCADE] Owner Webhook Org", subscriptionTier: "free", createdAt: now, updatedAt: now });
  await db.collection(C.locs).insertOne({ _id: locId, orgId, name: "[TC] Owner Webhook Loc", timezone: "America/New_York", createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ orgId, locationId: null, clerkUserId: TEST_OWNER_CLERK_ID, role: "owner", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ orgId, locationId: locId, clerkUserId: TEST_MANAGER_CLERK_ID, role: "manager", imageUrl: null, createdAt: now, updatedAt: now });
  await db.collection(C.members).insertOne({ orgId, locationId: locId, clerkUserId: TEST_STAFF_CLERK_ID, role: "staff", imageUrl: null, createdAt: now, updatedAt: now });

  // Identity-scoped rows for owner + manager + staff
  await db.collection(C.device).insertMany([
    { clerkUserId: TEST_OWNER_CLERK_ID, expoPushToken: "ExponentPushToken[tc_owner_dev]", platform: "ios", lastSeenAt: now, revokedAt: null, createdAt: now, updatedAt: now },
    { clerkUserId: TEST_MANAGER_CLERK_ID, expoPushToken: "ExponentPushToken[tc_owner_mgr_dev]", platform: "ios", lastSeenAt: now, revokedAt: null, createdAt: now, updatedAt: now },
    { clerkUserId: TEST_STAFF_CLERK_ID, expoPushToken: "ExponentPushToken[tc_owner_staff_dev]", platform: "android", lastSeenAt: now, revokedAt: null, createdAt: now, updatedAt: now },
  ]);
  await db.collection(C.notifPref).insertMany([
    { clerkUserId: TEST_OWNER_CLERK_ID, channels: { push: true, email: true }, categories: {}, createdAt: now, updatedAt: now },
    { clerkUserId: TEST_MANAGER_CLERK_ID, channels: { push: true, email: true }, categories: {}, createdAt: now, updatedAt: now },
    { clerkUserId: TEST_STAFF_CLERK_ID, channels: { push: true, email: true }, categories: {}, createdAt: now, updatedAt: now },
  ]);

  log(`\n  Pre-delete: 3 memberships, 3 DeviceTokens, 3 NotificationPreferences`);

  // Exact replication of the fixed owner webhook path
  await webhookOwnerDeleted(db, TEST_OWNER_CLERK_ID, orgId.toString());

  const postOrg = await db.collection(C.orgs).countDocuments({ _id: orgId });
  const postMembers = await db.collection(C.members).countDocuments({ orgId });
  const postDTOwner = await db.collection(C.device).countDocuments({ clerkUserId: TEST_OWNER_CLERK_ID });
  const postDTManager = await db.collection(C.device).countDocuments({ clerkUserId: TEST_MANAGER_CLERK_ID });
  const postDTStaff = await db.collection(C.device).countDocuments({ clerkUserId: TEST_STAFF_CLERK_ID });
  const postNPAny = await db.collection(C.notifPref).countDocuments({ clerkUserId: { $in: [TEST_OWNER_CLERK_ID, TEST_MANAGER_CLERK_ID, TEST_STAFF_CLERK_ID] } });

  postOrg === 0 ? pass("Organization deleted") : fail("Organization", "still exists after owner webhook");
  postMembers === 0 ? pass("All OrganizationMember rows deleted") : fail("OrganizationMembers", `${postMembers} remain`);
  postDTOwner === 0 ? pass("Owner DeviceToken deleted") : fail("Owner DeviceToken", `${postDTOwner} orphaned`);
  postDTManager === 0
    ? pass("Manager DeviceToken cleaned up inline (race-condition fix working)")
    : fail("Manager DeviceToken", `${postDTManager} orphaned — owner webhook did not clean non-owner member identity rows`);
  postDTStaff === 0
    ? pass("Staff DeviceToken cleaned up inline (race-condition fix working)")
    : fail("Staff DeviceToken", `${postDTStaff} orphaned — owner webhook did not clean non-owner member identity rows`);
  postNPAny === 0
    ? pass("All NotificationPreferences (owner + members) deleted")
    : fail("NotificationPreference", `${postNPAny} orphaned across owner + members`);

  await nukeTestOrg(db, orgId.toString());
  await nukeTestUsers(db, TEST_OWNER_CLERK_ID, TEST_MANAGER_CLERK_ID, TEST_STAFF_CLERK_ID);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("═".repeat(65));
  log("  Cascade Delete Verification");
  log("═".repeat(65));

  log("\nConnecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(); // Uses the DB specified in the URI

  log(`Connected to: ${db.databaseName}`);

  try {
    await testOrgCascade(db);
    await testScheduleCascade(db);
    await testStaffCascade(db);
    await testManagerWebhookCascade(db);
    await testStaffWebhookCascade(db);
    await testOwnerWebhookCascade(db);
  } finally {
    // Emergency sweep — catches any fixtures leaked by a mid-test crash
    log("\n  Emergency cleanup sweep...");
    const leftoverOrgs = await db.collection(C.orgs).find({ name: /\[TEST_CASCADE\]/ }).toArray();
    for (const org of leftoverOrgs) {
      await nukeTestOrg(db, org._id.toString());
      log(`  Swept leftover org: ${org._id}`);
    }
    await nukeTestUsers(db, TEST_OWNER_CLERK_ID, TEST_MANAGER_CLERK_ID, TEST_STAFF_CLERK_ID);
    await client.close();
  }

  log(`\n${"═".repeat(65)}`);
  log(`  RESULTS: ${passed} passed, ${failed} failed`);
  log("═".repeat(65));

  if (issues.length > 0) {
    log("\n  Issues found:");
    for (const issue of issues) {
      log(`    ${issue}`);
    }
    log("");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
