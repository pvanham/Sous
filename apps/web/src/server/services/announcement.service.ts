import { Types } from "mongoose";
import Announcement from "@/server/models/Announcement";
import {
  AnnouncementDTO,
  toAnnouncementDTO,
} from "@/types/announcement";
import type {
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "@/lib/validations/announcement.schema";

/**
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
  authorClerkUserId: string;
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
   * whose `expiresAt` is in the past. `null` expiry rows are always
   * included.
   *
   * @param orgId - Organization ID (tenancy scope)
   * @param locationId - Location ID (tenancy scope)
   * @param options - Optional `limit` and `includeExpired` switches
   * @returns Array of `AnnouncementDTO` sorted by `createdAt` descending.
   */
  async list(
    orgId: string,
    locationId: string,
    options: { limit?: number; includeExpired?: boolean } = {}
  ): Promise<AnnouncementDTO[]> {
    const limit = options.limit ?? 20;
    const includeExpired = options.includeExpired ?? false;

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    };

    if (!includeExpired) {
      // `expiresAt` is either null (no expiry) or in the future.
      query.$or = [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ];
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
      authorClerkUserId: data.authorClerkUserId,
      authorName: data.authorName,
      title: data.title,
      body: data.body,
      priority: data.priority ?? "normal",
      expiresAt: data.expiresAt ?? null,
    });

    return toAnnouncementDTO(doc.toObject());
  },

  /**
   * Partial update on an announcement. Only the fields present in
   * `patch` are mutated; passing `expiresAt: null` explicitly clears
   * the expiry.
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
    if (patch.expiresAt !== undefined) updateData.expiresAt = patch.expiresAt;

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
   * without losing the audit trail, they should set `expiresAt`.
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
    return Announcement.countDocuments({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
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
