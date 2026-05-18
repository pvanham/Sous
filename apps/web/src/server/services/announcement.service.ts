import { Types } from "mongoose";
import Announcement from "@/server/models/Announcement";
import {
  AnnouncementDTO,
  computeAnnouncementLifecycle,
  toAnnouncementDTO,
} from "@/types/announcement";
import type {
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "@/lib/validations/announcement.schema";

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
 *
 * This service is a migration shim for the clean-break schema rewrite.
 * Do not reintroduce pre-Phase-1 field names, `authorClerkUserId`, or
 * the 4-tier priority enum in this layer.
 *
 * Phase 3 audience sentinel contract:
 * - `@everyone` means broadcast to all staff in location.
 * - `@managers` means every role listed in KitchenConfig.managerRoles.
 * - legacy `Global` sentinel must not be reintroduced.
 *
 * Internal create payload — what the service actually consumes.
 *
 * We split this from the Zod-derived `CreateAnnouncementInput` because
 * the action layer is responsible for filling in the orgId / locationId
 * (from `getLocationContext`) and the author identity (from Clerk),
 * and they should never be trusted from the wire.
 */
export interface CreateAnnouncementServiceInput
  extends CreateAnnouncementInput {
  orgId: string;
  locationId: string;
  authorId: string;
  authorName: string;
}

/**
 * AnnouncementService — service layer for manager-authored announcements.
 *
 * This is the ONLY place that imports the `Announcement` Mongoose model.
 * Every method:
 *   • takes string IDs (converted to `Types.ObjectId` internally),
 *   • filters by both `orgId` and `locationId`,
 *   • returns DTOs (never raw Mongoose documents).
 */
export const AnnouncementService = {
  /**
   * List announcements for a location, newest first.
   *
   * `includeExpired = false` (the staff-facing default) hides any row
   * whose expiration date is in the past. Rows with null expiration are
   * always included.
   *
   * @param orgId - Organization ID (tenancy scope)
   * @param locationId - Location ID (tenancy scope)
   * @param options - Optional `limit` and `includeExpired` switches
   * @returns Array of `AnnouncementDTO` sorted by `createdAt` descending.
   */
  async list(
    orgId: string,
    locationId: string,
    options: {
      limit?: number;
      includeExpired?: boolean;
      includeDrafts?: boolean;
      includeScheduled?: boolean;
    } = {}
  ): Promise<AnnouncementDTO[]> {
    const limit = options.limit ?? 20;
    const includeExpired = options.includeExpired ?? false;
    const includeDrafts = options.includeDrafts ?? false;
    const includeScheduled = options.includeScheduled ?? false;

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };

    const now = new Date();
    const andFilters: Record<string, unknown>[] = [];

    if (!includeDrafts) {
      andFilters.push({ publishDate: { $ne: null } });
    }

    if (!includeScheduled) {
      andFilters.push({ $or: [{ publishDate: null }, { publishDate: { $lte: now } }] });
    }

    if (!includeExpired) {
      andFilters.push({
        $or: [{ expirationDate: null }, { expirationDate: { $gt: now } }],
      });
    }

    if (andFilters.length > 0) {
      query.$and = andFilters;
    }

    const docs = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(toAnnouncementDTO);
  },

  /**
   * Get a single announcement by ID, scoped to the tenant.
   * @returns `AnnouncementDTO` or `null` if the row does not exist
   *          inside the caller's location.
   */
  async getById(
    orgId: string,
    locationId: string,
    announcementId: string
  ): Promise<AnnouncementDTO | null> {
    const doc = await Announcement.findOne({
      _id: announcementId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    }).lean();

    return doc ? toAnnouncementDTO(doc) : null;
  },

  /**
   * Create a new announcement.
   *
   * The caller MUST resolve `orgId`, `locationId`, and the author
   * identity through `getLocationContext` + Clerk before calling.
   * The service does no role check itself — the action layer is
   * responsible for restricting writes to managers / owners.
   */
  async create(
    data: CreateAnnouncementServiceInput
  ): Promise<AnnouncementDTO> {
    const doc = await Announcement.create({
      orgId: new Types.ObjectId(data.orgId),
      locationId: new Types.ObjectId(data.locationId),
      authorId: data.authorId,
      authorName: data.authorName,
      title: data.title,
      body: data.body,
      priority: data.priority ?? "Standard",
      targetAudience: data.targetAudience,
      tags: data.tags ?? [],
      publishDate: data.publishDate ?? null,
      expirationDate: data.expirationDate ?? null,
      attachments: data.attachments ?? [],
      requiresAcknowledgment: data.requiresAcknowledgment ?? false,
    });

    return toAnnouncementDTO(doc.toObject());
  },

  /**
   * Partial update on an announcement. Only the fields present in
   * `patch` are mutated; passing `expirationDate: null` explicitly
   * clears expiration.
   *
   * @returns Updated DTO or `null` if the row was not found in this
   *          tenant.
   */
  async update(
    orgId: string,
    locationId: string,
    patch: UpdateAnnouncementInput
  ): Promise<AnnouncementDTO | null> {
    const updateData: Record<string, unknown> = {};
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.body !== undefined) updateData.body = patch.body;
    if (patch.priority !== undefined) updateData.priority = patch.priority;
    if (patch.targetAudience !== undefined) updateData.targetAudience = patch.targetAudience;
    if (patch.tags !== undefined) updateData.tags = patch.tags;
    if (patch.publishDate !== undefined) updateData.publishDate = patch.publishDate;
    if (patch.expirationDate !== undefined) {
      updateData.expirationDate = patch.expirationDate;
    }
    if (patch.attachments !== undefined) updateData.attachments = patch.attachments;
    if (patch.requiresAcknowledgment !== undefined) {
      updateData.requiresAcknowledgment = patch.requiresAcknowledgment;
    }

    const doc = await Announcement.findOneAndUpdate(
      {
        _id: patch.announcementId,
        orgId: new Types.ObjectId(orgId),
        locationId: new Types.ObjectId(locationId),
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    return doc ? toAnnouncementDTO(doc) : null;
  },

  /**
   * Hard-delete an announcement. There is no soft-delete column —
   * if a manager wants to roll an announcement off the staff feed
   * without losing the audit trail, they should set `expirationDate`.
   *
   * @returns `true` if a row was deleted, `false` if the announcement
   *          did not exist in this tenant.
   */
  async delete(
    orgId: string,
    locationId: string,
    announcementId: string
  ): Promise<boolean> {
    const result = await Announcement.deleteOne({
      _id: announcementId,
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount > 0;
  },

  /**
   * Convenience: count visible (non-expired) announcements for a
   * location. Used by the AI orchestrator and any future "unread"
   * badge logic.
   */
  async countActive(orgId: string, locationId: string): Promise<number> {
    const now = new Date();
    return Announcement.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      publishDate: { $ne: null, $lte: now },
      $or: [{ expirationDate: null }, { expirationDate: { $gt: now } }],
    });
  },

  async listByLifecycle(
    orgId: string,
    locationId: string
  ): Promise<
    Record<"draft" | "scheduled" | "active" | "expired", AnnouncementDTO[]>
  > {
    const announcements = await this.list(orgId, locationId, {
      limit: 200,
      includeExpired: true,
      includeDrafts: true,
      includeScheduled: true,
    });

    return announcements.reduce<
      Record<"draft" | "scheduled" | "active" | "expired", AnnouncementDTO[]>
    >(
      (acc, announcement) => {
        const status = computeAnnouncementLifecycle(announcement);
        acc[status] = acc[status] ?? [];
        acc[status].push(announcement);
        return acc;
      },
      { draft: [], scheduled: [], active: [], expired: [] }
    );
  },

  /**
   * Test/cleanup helper — drop every announcement for a location.
   * Mirrors the pattern the other services follow.
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await Announcement.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  /**
   * Test/cleanup helper — drop every announcement in an org.
   */
  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await Announcement.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
