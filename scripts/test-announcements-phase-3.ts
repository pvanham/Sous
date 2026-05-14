/**
 * PHASE-3 ANNOUNCEMENTS audience-targeting smoke test.
 *
 * Covers:
 * - audience encode/decode helpers
 * - shared createAnnouncementSchema audience refinements
 * - action-level audience role validation helper
 * - Announcement model @-prefix guard
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { createAnnouncementSchema } from "../apps/web/src/lib/validations/announcement.schema";
import {
  decodeAudience,
  encodeAudience,
  validateAudienceEntriesWithRoleSet,
} from "../apps/web/src/lib/announcement/audience";
import Announcement from "../apps/web/src/server/models/Announcement";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectReject(label: string, fn: () => Promise<unknown>) {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

function assertSchemaPasses(targetAudience: string[], label: string): void {
  const parsed = createAnnouncementSchema.safeParse({
    title: "Phase 3 test",
    body: "<p>Body</p>",
    priority: "Standard",
    targetAudience,
    publishDate: new Date("2026-07-01T12:00:00.000Z"),
    expirationDate: null,
    tags: [],
    attachments: [],
    requiresAcknowledgment: false,
  });
  assert(parsed.success, label);
}

function assertSchemaFails(targetAudience: string[], label: string): void {
  const parsed = createAnnouncementSchema.safeParse({
    title: "Phase 3 test",
    body: "<p>Body</p>",
    priority: "Standard",
    targetAudience,
    publishDate: new Date("2026-07-01T12:00:00.000Z"),
    expirationDate: null,
    tags: [],
    attachments: [],
    requiresAcknowledgment: false,
  });
  assert(!parsed.success, label);
}

async function main(): Promise<void> {
  console.log("Phase 3 announcements audience smoke test\n");

  const everyone = encodeAudience({
    includeEveryone: true,
    includeManagers: false,
    specificRoles: ["Line Cook"],
  });
  assert(
    everyone.length === 1 && everyone[0] === "@everyone",
    "encodeAudience returns @everyone singleton"
  );

  const managersAndRole = encodeAudience({
    includeEveryone: false,
    includeManagers: true,
    specificRoles: ["Line Cook"],
  });
  assert(
    managersAndRole.includes("@managers") &&
      managersAndRole.includes("Line Cook"),
    "encodeAudience supports managers + specific roles"
  );

  const decodedEveryone = decodeAudience(["@everyone"]);
  assert(
    decodedEveryone.includeEveryone &&
      !decodedEveryone.includeManagers &&
      decodedEveryone.specificRoles.length === 0,
    "decodeAudience handles @everyone"
  );

  const decodedManagersAndRole = decodeAudience(["@managers", "Prep"]);
  assert(
    !decodedManagersAndRole.includeEveryone &&
      decodedManagersAndRole.includeManagers &&
      decodedManagersAndRole.specificRoles.includes("Prep"),
    "decodeAudience handles managers + specific role"
  );

  assertSchemaPasses(["@everyone"], "schema accepts @everyone");
  assertSchemaPasses(["@managers"], "schema accepts @managers");
  assertSchemaPasses(
    ["@managers", "Line Cook"],
    "schema accepts @managers + specific role"
  );
  assertSchemaPasses(["Line Cook", "Prep"], "schema accepts specific roles");

  assertSchemaFails([], "schema rejects empty targetAudience");
  assertSchemaFails(
    ["@everyone", "Line Cook"],
    "schema rejects @everyone combined with other entries"
  );
  assertSchemaFails(["@unknown"], "schema rejects unknown @-prefixed token");

  assert(
    validateAudienceEntriesWithRoleSet(["@everyone"], ["Line Cook"]) === null,
    "action validator allows @everyone token"
  );
  assert(
    validateAudienceEntriesWithRoleSet(
      ["@managers", "Line Cook"],
      ["Line Cook", "Prep"]
    ) === null,
    "action validator allows known roles with @managers"
  );
  assert(
    validateAudienceEntriesWithRoleSet(["Dishwasher"], ["Line Cook", "Prep"]) ===
      'Unknown audience role: "Dishwasher"',
    "action validator rejects unknown role"
  );

  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  await mongoose.connect(uri, { dbName: "sous_announcements_phase_3" });
  await Announcement.init();

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const now = Date.now();

  try {
    await expectReject(
      "model rejects unknown @-prefixed targetAudience entries",
      async () => {
        await Announcement.create({
          orgId,
          locationId,
          authorId: "user_manager_1",
          authorName: "Manager One",
          title: "Bad audience token",
          body: "<p>Body</p>",
          priority: "Standard",
          targetAudience: ["@notreal"],
          tags: [],
          publishDate: new Date(now),
          expirationDate: null,
          attachments: [],
          requiresAcknowledgment: false,
        });
      }
    );
  } finally {
    await Announcement.deleteMany({});
    await mongoose.disconnect();
    await repl.stop();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL", error);
  process.exit(1);
});
