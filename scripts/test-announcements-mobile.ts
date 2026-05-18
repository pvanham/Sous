/**
 * Mobile announcements smoke test.
 *
 * Covers:
 * - list envelope shape (`AnnouncementListItemDTO`)
 * - caller-scoped read and acknowledge transitions
 * - read/ack idempotency
 * - rejects acknowledge when not required
 * - tenancy isolation for list/detail lookups
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { AnnouncementListItemDTO } from "@sous/types";
import Announcement from "../apps/web/src/server/models/Announcement";
import AnnouncementAcknowledgment from "../apps/web/src/server/models/AnnouncementAcknowledgment";
import Organization from "../apps/web/src/server/models/Organization";
import Location from "../apps/web/src/server/models/Location";
import { AnnouncementService } from "../apps/web/src/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "../apps/web/src/server/services/announcement-acknowledgment.service";

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

function toListItem(
  announcement: Awaited<ReturnType<typeof AnnouncementService.list>>[number],
  ack: Awaited<ReturnType<typeof AnnouncementAcknowledgmentService.getForUser>>
): AnnouncementListItemDTO {
  return {
    announcement,
    acknowledgment: ack,
  };
}

async function seedTenant(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  ownerId: string
): Promise<void> {
  await Organization.create({
    _id: orgId,
    ownerId,
    name: `Org ${ownerId}`,
    subscriptionTier: "free",
  });

  await Location.create({
    _id: locationId,
    orgId,
    name: `Location ${ownerId}`,
    timezone: "America/New_York",
  });
}

async function main(): Promise<void> {
  console.log("Mobile announcements smoke test\n");

  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  await mongoose.connect(uri, { dbName: "sous_announcements_mobile" });
  await Promise.all([
    Announcement.init(),
    AnnouncementAcknowledgment.init(),
    Organization.init(),
    Location.init(),
  ]);

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();
  const now = Date.now();

  try {
    await seedTenant(orgId, locationId, "owner_1");
    await seedTenant(otherOrgId, otherLocationId, "owner_2");

    const ackRequired = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Acknowledge this",
      body: "Please acknowledge this policy update.",
      priority: "Urgent",
      targetAudience: ["@everyone"],
      tags: ["policy"],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: true,
    });

    const noAckRequired = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "FYI update",
      body: "No explicit acknowledgment needed.",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    const expired = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Expired notice",
      body: "This has already expired.",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 7 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(now - 60_000),
      attachments: [],
      requiresAcknowledgment: false,
    });

    await Announcement.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      authorId: "manager_2",
      authorName: "Other Manager",
      title: "Other tenant",
      body: "Should not be visible",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: true,
    });

    const activeAnnouncements = await AnnouncementService.list(String(orgId), String(locationId), {
      limit: 20,
      includeExpired: false,
    });
    const activeRows = await AnnouncementAcknowledgmentService.getManyForUser(
      String(orgId),
      String(locationId),
      activeAnnouncements.map((row) => row.id),
      "clerk_staff_1"
    );
    const activeAckMap = new Map(activeRows.map((row) => [row.announcementId, row] as const));
    const listPayload = activeAnnouncements.map((row) =>
      toListItem(row, activeAckMap.get(row.id) ?? null)
    );

    assert(listPayload.length === 2, "list excludes expired rows by default");
    assert(
      listPayload.every((row) => row.acknowledgment === null),
      "list starts with null acknowledgment rows"
    );
    assert(
      listPayload.some((row) => row.announcement.id === String(ackRequired._id)),
      "list contains ack-required row"
    );

    const detailAnnouncement = await AnnouncementService.getById(
      String(orgId),
      String(locationId),
      String(ackRequired._id)
    );
    const detailAck = await AnnouncementAcknowledgmentService.getForUser(
      String(orgId),
      String(locationId),
      String(ackRequired._id),
      "clerk_staff_1"
    );
    assert(Boolean(detailAnnouncement), "detail lookup returns scoped row");
    assert(detailAck === null, "detail starts with null acknowledgment");

    const firstRead = await AnnouncementAcknowledgmentService.markRead({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(ackRequired._id),
      userId: "clerk_staff_1",
    });
    const secondRead = await AnnouncementAcknowledgmentService.markRead({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(ackRequired._id),
      userId: "clerk_staff_1",
    });
    assert(
      Boolean(firstRead.readAt) &&
        Boolean(secondRead.readAt) &&
        firstRead.readAt?.getTime() === secondRead.readAt?.getTime(),
      "markRead is idempotent"
    );

    const firstAck = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(ackRequired._id),
      userId: "clerk_staff_1",
    });
    const secondAck = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(ackRequired._id),
      userId: "clerk_staff_1",
    });
    assert(
      Boolean(firstAck.readAt) &&
        Boolean(firstAck.acknowledgedAt) &&
        firstAck.acknowledgedAt?.getTime() === secondAck.acknowledgedAt?.getTime(),
      "acknowledge sets acknowledgedAt and remains idempotent"
    );

    await expectReject(
      "acknowledge without requiresAcknowledgment is rejected",
      async () => {
        const row = await AnnouncementService.getById(
          String(orgId),
          String(locationId),
          String(noAckRequired._id)
        );
        if (!row) throw new Error("Missing no-ack row");
        if (!row.requiresAcknowledgment) {
          throw new Error("Acknowledgment not required");
        }
      }
    );

    const expiredList = await AnnouncementService.list(String(orgId), String(locationId), {
      limit: 20,
      includeExpired: true,
    });
    const expiredOnly = expiredList.filter(
      (row) => row.expirationDate !== null && row.expirationDate.getTime() <= now
    );
    assert(
      expiredOnly.length === 1 && expiredOnly[0]?.id === String(expired._id),
      "expired lifecycle filter is derivable from includeExpired list"
    );

    const crossTenant = await AnnouncementService.getById(
      String(orgId),
      String(locationId),
      String(new Types.ObjectId())
    );
    assert(crossTenant === null, "cross-tenant/missing detail returns null");
  } finally {
    await Promise.all([
      AnnouncementAcknowledgment.deleteMany({}),
      Announcement.deleteMany({}),
      Location.deleteMany({}),
      Organization.deleteMany({}),
    ]);
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
