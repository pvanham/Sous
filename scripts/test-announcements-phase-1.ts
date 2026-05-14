/**
 * PHASE-1 ANNOUNCEMENTS data-layer smoke test.
 *
 * Covers:
 * - Announcement model validators + indexes
 * - AnnouncementAcknowledgment model validators + indexes
 * - lifecycle helper behavior
 * - tenancy isolation expectations
 *
 * Run from apps/web:
 *   npm run test:announcements-phase-1
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Announcement from "../apps/web/src/server/models/Announcement";
import AnnouncementAcknowledgment from "../apps/web/src/server/models/AnnouncementAcknowledgment";
import { computeAnnouncementLifecycle } from "../apps/web/src/types/announcement";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(
      `  FAIL: ${label}${detail ? `  — ${detail}` : ""}`
    );
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

function urls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://files.example.com/${i}.pdf`);
}

async function main(): Promise<void> {
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = repl.getUri();

  await mongoose.connect(uri, { dbName: "sous_announcements_phase_1" });
  console.log("Connected to in-memory MongoDB\n");
  await Announcement.init();
  await AnnouncementAcknowledgment.init();

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();

  const cleanup = async (): Promise<void> => {
    await Announcement.deleteMany({});
    await AnnouncementAcknowledgment.deleteMany({});
  };

  try {
    const now = Date.now();

    const standard = await Announcement.create({
      orgId,
      locationId,
      authorId: "user_manager_1",
      authorName: "Manager One",
      title: "Kitchen update",
      body: "<p>Body</p>",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: ["menu update"],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: ["https://cdn.example.com/file-a.pdf"],
      requiresAcknowledgment: false,
    });

    assert(Boolean(standard._id), "creates valid Standard announcement");

    const urgent = await Announcement.create({
      orgId,
      locationId,
      authorId: "user_manager_2",
      authorName: "Manager Two",
      title: "Urgent note",
      body: "<p>Important</p>",
      priority: "Urgent",
      targetAudience: ["Line Cook", "Prep"],
      tags: ["safety"],
      publishDate: new Date(now + 30 * 60_000),
      expirationDate: new Date(now + 2 * 60 * 60_000),
      attachments: [],
      requiresAcknowledgment: true,
    });

    assert(Boolean(urgent._id), "creates valid Urgent announcement");

    const dto = standard.toObject();
    assert(dto.priority === "Standard", "document round-trip preserves priority");

    await expectReject("rejects invalid priority enum", async () => {
      await Announcement.create({
        orgId,
        locationId,
        authorId: "user_bad",
        authorName: "Bad",
        title: "Bad priority",
        body: "Body",
        priority: "high",
        targetAudience: ["@everyone"],
        tags: [],
        publishDate: new Date(now),
        expirationDate: null,
        attachments: [],
        requiresAcknowledgment: false,
      });
    });

    await expectReject("rejects expirationDate <= publishDate", async () => {
      await Announcement.create({
        orgId,
        locationId,
        authorId: "user_bad",
        authorName: "Bad",
        title: "Bad dates",
        body: "Body",
        priority: "Standard",
        targetAudience: ["@everyone"],
        tags: [],
        publishDate: new Date(now),
        expirationDate: new Date(now),
        attachments: [],
        requiresAcknowledgment: false,
      });
    });

    await expectReject("rejects empty targetAudience", async () => {
      await Announcement.create({
        orgId,
        locationId,
        authorId: "user_bad",
        authorName: "Bad",
        title: "No audience",
        body: "Body",
        priority: "Standard",
        targetAudience: [],
        tags: [],
        publishDate: new Date(now),
        expirationDate: null,
        attachments: [],
        requiresAcknowledgment: false,
      });
    });

    await expectReject("rejects > 10 attachments", async () => {
      await Announcement.create({
        orgId,
        locationId,
        authorId: "user_bad",
        authorName: "Bad",
        title: "Too many files",
        body: "Body",
        priority: "Standard",
        targetAudience: ["@everyone"],
        tags: [],
        publishDate: new Date(now),
        expirationDate: null,
        attachments: urls(11),
        requiresAcknowledgment: false,
      });
    });

    await expectReject("rejects body > 10000 chars", async () => {
      await Announcement.create({
        orgId,
        locationId,
        authorId: "user_bad",
        authorName: "Bad",
        title: "Long body",
        body: "x".repeat(10001),
        priority: "Standard",
        targetAudience: ["@everyone"],
        tags: [],
        publishDate: new Date(now),
        expirationDate: null,
        attachments: [],
        requiresAcknowledgment: false,
      });
    });

    const draft = await Announcement.create({
      orgId,
      locationId,
      authorId: "user_manager_3",
      authorName: "Manager Draft",
      title: "Draft post",
      body: "Draft content",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: null,
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });
    assert(draft.publishDate === null, "allows publishDate null for Draft");

    const indexes = await Announcement.collection.indexes();
    const hasIndex = (expected: Record<string, number>): boolean =>
      indexes.some((index) => {
        const key = index.key as Record<string, number>;
        return Object.entries(expected).every(([k, v]) => key[k] === v);
      });
    assert(
      hasIndex({ orgId: 1, locationId: 1, createdAt: -1 }),
      "has createdAt tenancy index"
    );
    assert(
      hasIndex({ orgId: 1, locationId: 1, publishDate: 1 }),
      "has publishDate lifecycle index"
    );
    assert(
      hasIndex({ orgId: 1, locationId: 1, expirationDate: 1 }),
      "has expirationDate lifecycle index"
    );
    assert(
      hasIndex({ orgId: 1, locationId: 1, tags: 1 }),
      "has tags multikey index"
    );

    const ack1 = await AnnouncementAcknowledgment.create({
      orgId,
      locationId,
      announcementId: standard._id,
      userId: "user_staff_1",
      readAt: new Date(now),
      acknowledgedAt: null,
    });
    assert(Boolean(ack1._id), "creates acknowledgment with readAt only");

    await expectReject(
      "rejects acknowledgedAt without readAt",
      async () => {
        await AnnouncementAcknowledgment.create({
          orgId,
          locationId,
          announcementId: standard._id,
          userId: "user_staff_bad",
          readAt: null,
          acknowledgedAt: new Date(now),
        });
      }
    );

    await expectReject(
      "rejects duplicate announcementId + userId",
      async () => {
        await AnnouncementAcknowledgment.create({
          orgId,
          locationId,
          announcementId: standard._id,
          userId: "user_staff_1",
          readAt: new Date(now),
          acknowledgedAt: null,
        });
      }
    );

    const ackIndexes = await AnnouncementAcknowledgment.collection.indexes();
    const hasAckIndex = (expected: Record<string, number>): boolean =>
      ackIndexes.some((index) => {
        const key = index.key as Record<string, number>;
        return Object.entries(expected).every(([k, v]) => key[k] === v);
      });
    assert(
      hasAckIndex({ announcementId: 1, userId: 1 }),
      "has unique ack key index"
    );
    assert(
      hasAckIndex({ orgId: 1, locationId: 1, userId: 1, readAt: 1 }),
      "has user read-state index"
    );
    assert(
      hasAckIndex({ announcementId: 1, acknowledgedAt: 1 }),
      "has acknowledgedAt roster index"
    );

    assert(
      computeAnnouncementLifecycle({
        publishDate: null,
        expirationDate: null,
      }) === "draft",
      "lifecycle helper returns draft"
    );
    assert(
      computeAnnouncementLifecycle({
        publishDate: new Date(now + 60_000),
        expirationDate: null,
      }) === "scheduled",
      "lifecycle helper returns scheduled"
    );
    assert(
      computeAnnouncementLifecycle({
        publishDate: new Date(now - 60_000),
        expirationDate: new Date(now + 60_000),
      }) === "active",
      "lifecycle helper returns active"
    );
    assert(
      computeAnnouncementLifecycle({
        publishDate: new Date(now - 120_000),
        expirationDate: new Date(now - 60_000),
      }) === "expired",
      "lifecycle helper returns expired"
    );

    await Announcement.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      authorId: "user_other_tenant",
      authorName: "Other Tenant",
      title: "Other",
      body: "Other tenant",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    const thisTenantCount = await Announcement.countDocuments({
      orgId,
      locationId,
    });
    const otherTenantCount = await Announcement.countDocuments({
      orgId: otherOrgId,
      locationId: otherLocationId,
    });
    assert(thisTenantCount >= 3, "tenant query returns this-tenant rows only");
    assert(otherTenantCount === 1, "sibling tenant rows remain isolated");
  } finally {
    await cleanup();
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
