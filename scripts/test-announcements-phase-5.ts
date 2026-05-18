/**
 * PHASE-5 ANNOUNCEMENTS accountability-and-analytics smoke test.
 *
 * Covers:
 * - audience resolver behavior (`@everyone`, `@managers`, mixed roles)
 * - acknowledgment service idempotency
 * - analytics service metrics + roster grouping inputs
 * - tenancy isolation for analytics + acknowledgments
 */

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Announcement from "../apps/web/src/server/models/Announcement";
import AnnouncementAcknowledgment from "../apps/web/src/server/models/AnnouncementAcknowledgment";
import Staff from "../apps/web/src/server/models/Staff";
import KitchenConfig from "../apps/web/src/server/models/KitchenConfig";
import Organization from "../apps/web/src/server/models/Organization";
import Location from "../apps/web/src/server/models/Location";
import { resolveAudienceStaff } from "../apps/web/src/lib/announcement/resolve-audience";
import { AnnouncementAcknowledgmentService } from "../apps/web/src/server/services/announcement-acknowledgment.service";
import { AnnouncementAnalyticsService } from "../apps/web/src/server/services/announcement-analytics.service";

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
  console.log("Phase 5 announcements accountability smoke test\n");

  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  await mongoose.connect(uri, { dbName: "sous_announcements_phase_5" });
  await Promise.all([
    Announcement.init(),
    AnnouncementAcknowledgment.init(),
    Staff.init(),
    KitchenConfig.init(),
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

    await KitchenConfig.create({
      orgId,
      locationId,
      name: "Main kitchen",
      stations: ["grill"],
      roles: ["Line Cook", "Prep", "Supervisor"],
      managerRoles: ["Supervisor"],
      operatingHours: {
        monday: { isOpen: true, open: "09:00", close: "21:00" },
        tuesday: { isOpen: true, open: "09:00", close: "21:00" },
        wednesday: { isOpen: true, open: "09:00", close: "21:00" },
        thursday: { isOpen: true, open: "09:00", close: "21:00" },
        friday: { isOpen: true, open: "09:00", close: "22:00" },
        saturday: { isOpen: true, open: "09:00", close: "22:00" },
        sunday: { isOpen: false },
      },
      weekStartsOn: "monday",
      minTimeOffAdvanceDays: 7,
    });

    const staffLineCook = await Staff.create({
      orgId,
      locationId,
      name: "Alex Cook",
      email: "alex@example.com",
      phone: "1111111111",
      roles: ["Line Cook"],
      skills: [],
      isActive: true,
      clerkUserId: "clerk_alex",
    });

    const staffManager = await Staff.create({
      orgId,
      locationId,
      name: "Morgan Lead",
      email: "morgan@example.com",
      phone: "2222222222",
      roles: ["Supervisor"],
      skills: [],
      isActive: true,
      clerkUserId: "clerk_morgan",
    });

    await Staff.create({
      orgId,
      locationId,
      name: "Inactive Prep",
      email: "inactive@example.com",
      phone: "3333333333",
      roles: ["Prep"],
      skills: [],
      isActive: false,
      clerkUserId: "clerk_inactive",
    });

    const staffUnlinked = await Staff.create({
      orgId,
      locationId,
      name: "Taylor Unlinked",
      email: "taylor@example.com",
      phone: "4444444444",
      roles: ["Prep"],
      skills: [],
      isActive: true,
      clerkUserId: null,
    });

    await Staff.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      name: "Other Tenant",
      email: "other@example.com",
      phone: "5555555555",
      roles: ["Supervisor"],
      skills: [],
      isActive: true,
      clerkUserId: "clerk_other",
    });

    const everyoneAudience = await resolveAudienceStaff(
      String(orgId),
      String(locationId),
      ["@everyone"]
    );
    assert(
      everyoneAudience.length === 3,
      "resolveAudienceStaff @everyone includes only active staff"
    );

    const managersAudience = await resolveAudienceStaff(
      String(orgId),
      String(locationId),
      ["@managers"]
    );
    assert(
      managersAudience.length === 1 &&
        managersAudience[0]?.name === "Morgan Lead",
      "resolveAudienceStaff @managers expands via KitchenConfig.managerRoles"
    );

    const mixedAudience = await resolveAudienceStaff(
      String(orgId),
      String(locationId),
      ["@managers", "Line Cook"]
    );
    const mixedNames = mixedAudience.map((entry) => entry.name).sort();
    assert(
      mixedNames.length === 2 &&
        mixedNames[0] === "Alex Cook" &&
        mixedNames[1] === "Morgan Lead",
      "resolveAudienceStaff mixes @managers with explicit roles without duplicates"
    );

    const unknownTokenAudience = await resolveAudienceStaff(
      String(orgId),
      String(locationId),
      ["@unknown", "Prep"]
    );
    assert(
      unknownTokenAudience.length === 1 &&
        unknownTokenAudience[0]?.name === "Taylor Unlinked",
      "resolveAudienceStaff skips unknown tokens and still resolves valid roles"
    );

    const requiresAckAnnouncement = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Policy Update",
      body: "<p>Acknowledge this update</p>",
      priority: "Urgent",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: true,
    });

    const readOnlyAnnouncement = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "FYI Notice",
      body: "<p>Read-only notice</p>",
      priority: "Standard",
      targetAudience: ["Prep"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });

    await Announcement.create({
      orgId: otherOrgId,
      locationId: otherLocationId,
      authorId: "manager_other",
      authorName: "Other Manager",
      title: "Other tenant policy",
      body: "<p>Other tenant</p>",
      priority: "Standard",
      targetAudience: ["@everyone"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: true,
    });

    const firstRead = await AnnouncementAcknowledgmentService.markRead({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(requiresAckAnnouncement._id),
      userId: "clerk_alex",
    });
    const secondRead = await AnnouncementAcknowledgmentService.markRead({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(requiresAckAnnouncement._id),
      userId: "clerk_alex",
    });
    assert(
      firstRead.readAt !== null &&
        secondRead.readAt !== null &&
        firstRead.readAt.getTime() === secondRead.readAt.getTime(),
      "markRead is idempotent and preserves first read timestamp"
    );

    const firstAck = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(requiresAckAnnouncement._id),
      userId: "clerk_morgan",
    });
    const secondAck = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: String(orgId),
      locationId: String(locationId),
      announcementId: String(requiresAckAnnouncement._id),
      userId: "clerk_morgan",
    });
    assert(
      firstAck.readAt !== null &&
        firstAck.acknowledgedAt !== null &&
        secondAck.acknowledgedAt !== null &&
        firstAck.acknowledgedAt.getTime() === secondAck.acknowledgedAt.getTime(),
      "acknowledge sets read + acknowledged and remains idempotent"
    );

    const duplicateAttempt = async () => {
      await AnnouncementAcknowledgment.create({
        orgId,
        locationId,
        announcementId: requiresAckAnnouncement._id,
        userId: "clerk_alex",
        readAt: new Date(),
      });
    };
    await expectReject(
      "unique announcementId/userId index prevents duplicate acknowledgment rows",
      duplicateAttempt
    );

    const analyticsRequired = await AnnouncementAnalyticsService.get(
      String(orgId),
      String(locationId),
      String(requiresAckAnnouncement._id)
    );
    assert(Boolean(analyticsRequired), "analytics service returns payload for scoped row");
    assert(
      analyticsRequired?.metrics.totalAudience === 3,
      "analytics computes audience size from resolved active staff"
    );
    assert(
      analyticsRequired?.metrics.readCount === 2,
      "analytics counts reads correctly"
    );
    assert(
      analyticsRequired?.metrics.acknowledgedCount === 1,
      "analytics counts acknowledgments correctly"
    );
    assert(
      analyticsRequired?.metrics.openRate === 2 / 3 &&
        analyticsRequired?.metrics.acknowledgmentRate === 1 / 3,
      "analytics computes open/ack rates as fractions"
    );
    const rosterSorted = analyticsRequired?.roster.map((entry) => entry.name) ?? [];
    assert(
      rosterSorted.join(",") === "Alex Cook,Morgan Lead,Taylor Unlinked",
      "analytics roster is sorted by staff name"
    );
    const unlinkedEntry = analyticsRequired?.roster.find(
      (entry) => entry.staffId === String(staffUnlinked._id)
    );
    assert(
      Boolean(unlinkedEntry && !unlinkedEntry.hasClerkLink && unlinkedEntry.readAt === null),
      "unlinked staff stay pending/unread"
    );

    const analyticsReadOnly = await AnnouncementAnalyticsService.get(
      String(orgId),
      String(locationId),
      String(readOnlyAnnouncement._id)
    );
    assert(
      analyticsReadOnly?.requiresAcknowledgment === false,
      "analytics payload preserves requiresAcknowledgment=false mode"
    );

    const emptyAudienceAnnouncement = await Announcement.create({
      orgId,
      locationId,
      authorId: "manager_1",
      authorName: "Manager One",
      title: "Legacy Unknown Role",
      body: "<p>No resolved audience</p>",
      priority: "Standard",
      targetAudience: ["LegacyRole"],
      tags: [],
      publishDate: new Date(now - 60_000),
      expirationDate: null,
      attachments: [],
      requiresAcknowledgment: false,
    });
    const emptyAnalytics = await AnnouncementAnalyticsService.get(
      String(orgId),
      String(locationId),
      String(emptyAudienceAnnouncement._id)
    );
    assert(
      emptyAnalytics?.metrics.totalAudience === 0 &&
        emptyAnalytics.metrics.openRate === 0 &&
        emptyAnalytics.metrics.acknowledgmentRate === 0,
      "analytics uses zero-safe rates for empty resolved audiences"
    );

    const crossTenantAnalytics = await AnnouncementAnalyticsService.get(
      String(orgId),
      String(locationId),
      String(new Types.ObjectId())
    );
    assert(
      crossTenantAnalytics === null,
      "analytics returns null for missing/cross-tenant announcement id"
    );

    const listAckRows = await AnnouncementAcknowledgmentService.listByAnnouncement(
      String(orgId),
      String(locationId),
      String(requiresAckAnnouncement._id)
    );
    assert(
      listAckRows.length === 2,
      "listByAnnouncement returns only rows for the scoped tenant announcement"
    );

    const userAck = await AnnouncementAcknowledgmentService.getForUser(
      String(orgId),
      String(locationId),
      String(requiresAckAnnouncement._id),
      "clerk_morgan"
    );
    assert(
      Boolean(userAck?.acknowledgedAt),
      "getForUser returns acknowledgment for scoped user"
    );

    assert(
      String(staffLineCook.orgId) === String(orgId) &&
        String(staffManager.locationId) === String(locationId),
      "seeded staff remained in expected tenant scope"
    );
  } finally {
    await Promise.all([
      AnnouncementAcknowledgment.deleteMany({}),
      Announcement.deleteMany({}),
      Staff.deleteMany({}),
      KitchenConfig.deleteMany({}),
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
