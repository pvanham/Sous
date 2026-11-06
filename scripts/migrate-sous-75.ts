/**
 * Migration Script: SOUS-75 stale tenant data
 *
 * One-time cleanup of rows written before the current schema defaults:
 *
 *   1. Staff rows with no `invitationStatus` get one derived from what is
 *      already stored: a linked `clerkUserId` means `accepted`, a stored
 *      `clerkInvitationId` means `pending`, anything else `not_invited`.
 *   2. KitchenConfig rows missing `weekStartsOn` or `managerRoles` get the
 *      schema defaults (`"monday"` and `[]`).
 *   3. Locations with no KitchenConfig get one copied from another config
 *      in the same org (stations, roles, manager roles, hours, week
 *      start). A location whose org has no config to copy is reported
 *      instead, because a config needs real stations and roles.
 *
 * Reported only, never deleted:
 *
 *   - OrganizationMember rows whose org or location no longer exists, or
 *     whose location belongs to a different org.
 *   - Documents in the legacy `organizationmembers` collection. The app
 *     reads and writes `organization_members`.
 *
 * The script is idempotent; a second `--apply` run reports zero writes.
 *
 * Two run modes (from the repo root):
 *
 *   npm run migrate:sous-75                # dry-run (default)
 *   npm run migrate:sous-75 -- --apply     # writes
 *
 * Required env (read from `apps/web/.env.local`):
 *   - MONGODB_URI            Mongo Atlas connection string
 *
 * IMPORTANT: Back your database up before passing `--apply`.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ENV_PATH = path.resolve(__dirname, "..", "apps", "web", ".env.local");
dotenv.config({ path: WEB_ENV_PATH });

import mongoose, { Types } from "mongoose";
import Staff from "../apps/web/src/server/models/Staff";
import KitchenConfig from "../apps/web/src/server/models/KitchenConfig";
import Location from "../apps/web/src/server/models/Location";
import Organization from "../apps/web/src/server/models/Organization";
import OrganizationMember from "../apps/web/src/server/models/OrganizationMember";

const APPLY = process.argv.includes("--apply");
const LEGACY_MEMBERS_COLLECTION = "organizationmembers";

const missingInvitationStatus = {
  $or: [{ invitationStatus: { $exists: false } }, { invitationStatus: null }],
};

async function backfillInvitationStatus(): Promise<void> {
  const hasClerkUser = { clerkUserId: { $nin: [null, ""] } };
  const hasInvitation = { clerkInvitationId: { $nin: [null, ""] } };
  const groups: {
    status: "accepted" | "pending" | "not_invited";
    filter: { $and: Record<string, unknown>[] };
  }[] = [
    {
      status: "accepted",
      filter: { $and: [missingInvitationStatus, hasClerkUser] },
    },
    {
      status: "pending",
      filter: {
        $and: [
          missingInvitationStatus,
          { $nor: [hasClerkUser] },
          hasInvitation,
        ],
      },
    },
    {
      status: "not_invited",
      filter: {
        $and: [
          missingInvitationStatus,
          { $nor: [hasClerkUser] },
          { $nor: [hasInvitation] },
        ],
      },
    },
  ];

  console.log("\nStaff.invitationStatus");
  for (const { status, filter } of groups) {
    const count = await Staff.countDocuments(filter);
    if (count === 0 || !APPLY) {
      console.log(`  ${count} row(s) to set to "${status}"`);
      continue;
    }
    const result = await Staff.updateMany(filter, {
      $set: { invitationStatus: status },
    });
    console.log(`  set ${result.modifiedCount} row(s) to "${status}"`);
  }
}

async function backfillKitchenConfigDefaults(): Promise<void> {
  const fields = [
    { field: "weekStartsOn", value: "monday" },
    { field: "managerRoles", value: [] as string[] },
  ];

  console.log("\nKitchenConfig defaults");
  for (const { field, value } of fields) {
    const filter = { [field]: { $exists: false } };
    const count = await KitchenConfig.countDocuments(filter);
    if (count === 0 || !APPLY) {
      console.log(`  ${count} config(s) missing ${field}`);
      continue;
    }
    const result = await KitchenConfig.updateMany(filter, {
      $set: { [field]: value },
    });
    console.log(`  set ${field} on ${result.modifiedCount} config(s)`);
  }
}

async function createMissingKitchenConfigs(): Promise<void> {
  const [locations, configs] = await Promise.all([
    Location.find({}).select("_id orgId name").lean(),
    KitchenConfig.find({}).lean(),
  ]);
  const configuredLocations = new Set(configs.map((c) => String(c.locationId)));
  const missing = locations.filter(
    (loc) => !configuredLocations.has(String(loc._id)),
  );

  console.log("\nLocations without a KitchenConfig");
  if (missing.length === 0) {
    console.log("  none");
    return;
  }

  for (const loc of missing) {
    const template = configs.find((c) => String(c.orgId) === String(loc.orgId));
    const label = `location ${String(loc._id)} ("${loc.name}", org ${String(loc.orgId)})`;
    if (!template) {
      console.log(`  ${label}: no config in this org to copy; set it up in Settings`);
      continue;
    }
    if (!APPLY) {
      console.log(`  ${label}: would copy config ${String(template._id)}`);
      continue;
    }
    await KitchenConfig.create({
      orgId: loc.orgId,
      locationId: loc._id,
      name: loc.name,
      stations: template.stations,
      roles: template.roles,
      managerRoles: template.managerRoles ?? [],
      operatingHours: template.operatingHours,
      minTimeOffAdvanceDays: template.minTimeOffAdvanceDays,
      allowStaffToManageOwnSkills: template.allowStaffToManageOwnSkills,
      weekStartsOn: template.weekStartsOn ?? "monday",
    });
    console.log(`  ${label}: created from config ${String(template._id)}`);
  }
}

async function reportOrphanMemberships(): Promise<void> {
  const [orgs, locations, members] = await Promise.all([
    Organization.find({}).select("_id").lean(),
    Location.find({}).select("_id orgId").lean(),
    OrganizationMember.find({}).lean(),
  ]);
  const orgIds = new Set(orgs.map((o) => String(o._id)));
  const locationOrg = new Map(
    locations.map((l) => [String(l._id), String(l.orgId)]),
  );

  console.log("\nOrphan organization_members rows (not deleted)");
  let orphanCount = 0;
  for (const m of members) {
    const orgId = String(m.orgId);
    const locationId = m.locationId ? String(m.locationId) : null;
    let reason: string | null = null;
    if (!orgIds.has(orgId)) {
      reason = `org ${orgId} does not exist`;
    } else if (locationId && !locationOrg.has(locationId)) {
      reason = `location ${locationId} does not exist`;
    } else if (locationId && locationOrg.get(locationId) !== orgId) {
      reason = `location ${locationId} belongs to org ${locationOrg.get(locationId)}`;
    }
    if (!reason) continue;
    orphanCount += 1;
    console.log(
      `  member ${String(m._id)} (${m.role}, clerk user ${m.clerkUserId}): ${reason}`,
    );
  }
  if (orphanCount === 0) console.log("  none");
}

async function reportLegacyMembersCollection(): Promise<void> {
  const db = mongoose.connection.db;
  console.log(`\nLegacy "${LEGACY_MEMBERS_COLLECTION}" collection (not deleted)`);
  if (!db) {
    console.log("  skipped: no database handle");
    return;
  }
  const exists =
    (await db.listCollections({ name: LEGACY_MEMBERS_COLLECTION }).toArray())
      .length > 0;
  if (!exists) {
    console.log("  not present");
    return;
  }
  const docs = await db
    .collection<{ _id: Types.ObjectId; clerkUserId?: string; role?: string }>(
      LEGACY_MEMBERS_COLLECTION,
    )
    .find({}, { projection: { _id: 1, clerkUserId: 1, role: 1 } })
    .toArray();
  console.log(`  ${docs.length} document(s); the app does not read this collection`);
  for (const doc of docs) {
    console.log(
      `  ${String(doc._id)} (${doc.role ?? "no role"}, clerk user ${doc.clerkUserId ?? "none"})`,
    );
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set. Add it to apps/web/.env.local before running.",
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to ${maskUri(uri)}`);
  console.log(APPLY ? "Mode: APPLY (writes)" : "Mode: DRY-RUN (no writes)");

  await backfillInvitationStatus();
  await backfillKitchenConfigDefaults();
  await createMissingKitchenConfigs();
  await reportOrphanMemberships();
  await reportLegacyMembersCollection();

  if (!APPLY) {
    console.log("\nRe-run with --apply to write the changes listed above.");
  }

  await mongoose.disconnect();
}

function maskUri(uri: string): string {
  return uri.replace(/:[^:@/]+@/, ":***@");
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore disconnect errors during failure path */
  }
  process.exit(1);
});
