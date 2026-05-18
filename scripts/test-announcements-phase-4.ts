/**
 * PHASE-4 ANNOUNCEMENTS manager-dashboard smoke test.
 *
 * Covers:
 * - lifecycle bucketing (draft/scheduled/active/expired)
 * - tenancy isolation for listByLifecycle/getById
 * - force-expire style transition via service update
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Announcement from "../apps/web/src/server/models/Announcement";
import { AnnouncementService } from "../apps/web/src/server/services/announcement.service";

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

async function main(): Promise<void> {
  console.log("Phase 4 announcements manager-dashboard smoke test\n");

  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  await mongoose.connect(uri, { dbName: "sous_announcements_phase_4" });
  await Announcement.init();

  const orgId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const otherLocationId = new Types.ObjectId();
  const now = Date.now();

  try {
    const draftOne = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Draft one",
      body: "<p>Draft one body</p>",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: null,
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    const draftTwo = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Draft two",
      body: "<p>Draft two body</p>",
      priority: "Standard",
      targetAudience: ["Line Cook"],
      tags: [],
      publishDate: null,
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Scheduled one",
      body: "<p>Scheduled body</p>",
      priority: "Urgent",
      targetAudience: ["@managers"],
      tags: [],
      publishDate: new Date(now + 60 * 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: true,
    });

    const active = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Active one",
      body: "<p>Active body</p>",
      priority: "Standard",
      targetAudience: ["Prep"],
      tags: [],
      publishDate: new Date(now - 60 * 60_000),
      expirationDate: new Date(now + 2 * 60 * 60_000),
      attachments: [],
      requiresAcknowledgment: false,
    });

    await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Expired one",
      body: "<p>Expired body</p>",
      priority: "Standard",
      targetAudience: ["Prep"],
      tags: [],
      publishDate: new Date(now - 4 * 60 * 60_000),
      expirationDate: new Date(now - 60_000),
      attachments: [],
      requiresAcknowledgment: false,
    });

    const otherTenantAnnouncement = await Announcement.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      authorId: "manager_other",
      authorName: "Other Manager",
      title: "Other tenant active",
      body: "<p>Other</p>",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 30 * 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    const lifecycle = await AnnouncementService.listByLifecycle(
      String(orgId),
      String(locationId)
    );

    assert(lifecycle.draft.length === 2, "listByLifecycle returns 2 drafts");
    assert(lifecycle.scheduled.length === 1, "listByLifecycle returns 1 scheduled");
    assert(lifecycle.active.length === 1, "listByLifecycle returns 1 active");
    assert(lifecycle.expired.length === 1, "listByLifecycle returns 1 expired");

    const sameTenant = await AnnouncementService.getById(
      String(orgId),
      String(locationId),
      String(draftOne._id)
    );
    assert(Boolean(sameTenant), "getById returns row in same tenant");

    const crossTenant = await AnnouncementService.getById(
      String(orgId),
      String(locationId),
      String(otherTenantAnnouncement._id)
    );
    assert(crossTenant === null, "getById returns null for missing/cross-tenant id");

    const forceExpired = await AnnouncementService.update(
      String(orgId),
      String(locationId),
      {
        announcementId: String(active._id),
        expirationDate: new Date(now),
      }
    );
    assert(Boolean(forceExpired), "update can set expirationDate to now");

    const lifecycleAfterExpire = await AnnouncementService.listByLifecycle(
      String(orgId),
      String(locationId)
    );
    assert(
      lifecycleAfterExpire.active.length === 0,
      "active bucket decrements after force-expire"
    );
    assert(
      lifecycleAfterExpire.expired.length === 2,
      "expired bucket increments after force-expire"
    );

    const stillDraft = await AnnouncementService.getById(
      String(orgId),
      String(locationId),
      String(draftTwo._id)
    );
    assert(Boolean(stillDraft), "other records remain accessible after update");
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
