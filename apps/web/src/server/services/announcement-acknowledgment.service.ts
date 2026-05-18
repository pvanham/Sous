import { Types } from "mongoose";
import AnnouncementAcknowledgment from "@/server/models/AnnouncementAcknowledgment";
import type { AnnouncementAcknowledgmentDTO } from "@/types/announcement";
import { toAnnouncementAcknowledgmentDTO } from "@/types/announcement";

type MarkReadInput = {
  orgId: string;
  locationId: string;
  announcementId: string;
  userId: string;
};

export const AnnouncementAcknowledgmentService = {
  async markRead(input: MarkReadInput): Promise<AnnouncementAcknowledgmentDTO> {
    const now = new Date();
    const orgObjectId = new Types.ObjectId(input.orgId);
    const locationObjectId = new Types.ObjectId(input.locationId);
    const announcementObjectId = new Types.ObjectId(input.announcementId);
    const baseFilter = {
      orgId: orgObjectId,
      locationId: locationObjectId,
      announcementId: announcementObjectId,
      userId: input.userId,
    };

    const existing = await AnnouncementAcknowledgment.findOne(baseFilter).lean();

    if (existing && existing.readAt) {
      return toAnnouncementAcknowledgmentDTO(existing);
    }

    if (existing) {
      const updated = await AnnouncementAcknowledgment.findOneAndUpdate(
        { ...baseFilter, readAt: null },
        { $set: { readAt: now } },
        { new: true, runValidators: true }
      ).lean();

      if (updated) {
        return toAnnouncementAcknowledgmentDTO(updated);
      }
    }

    let doc = null;
    try {
      doc = await AnnouncementAcknowledgment.findOneAndUpdate(
        baseFilter,
        {
          $setOnInsert: {
            orgId: orgObjectId,
            locationId: locationObjectId,
            announcementId: announcementObjectId,
            userId: input.userId,
            readAt: now,
            acknowledgedAt: null,
          },
        },
        { new: true, upsert: true, runValidators: true }
      ).lean();
    } catch {
      doc = await AnnouncementAcknowledgment.findOne(baseFilter).lean();
    }

    if (!doc) {
      throw new Error("Failed to mark announcement as read");
    }

    return toAnnouncementAcknowledgmentDTO(doc);
  },

  async acknowledge(input: MarkReadInput): Promise<AnnouncementAcknowledgmentDTO> {
    await this.markRead(input);

    const now = new Date();
    const orgObjectId = new Types.ObjectId(input.orgId);
    const locationObjectId = new Types.ObjectId(input.locationId);
    const announcementObjectId = new Types.ObjectId(input.announcementId);

    const baseFilter = {
      orgId: orgObjectId,
      locationId: locationObjectId,
      announcementId: announcementObjectId,
      userId: input.userId,
    };

    let doc = await AnnouncementAcknowledgment.findOneAndUpdate(
      { ...baseFilter, acknowledgedAt: null },
      { $set: { acknowledgedAt: now } },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) {
      doc = await AnnouncementAcknowledgment.findOne(baseFilter).lean();
    }

    if (!doc) {
      throw new Error("Failed to acknowledge announcement");
    }

    return toAnnouncementAcknowledgmentDTO(doc);
  },

  async listByAnnouncement(
    orgId: string,
    locationId: string,
    announcementId: string
  ): Promise<AnnouncementAcknowledgmentDTO[]> {
    const docs = await AnnouncementAcknowledgment.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      announcementId: new Types.ObjectId(announcementId),
    }).lean();

    return docs.map(toAnnouncementAcknowledgmentDTO);
  },

  async getForUser(
    orgId: string,
    locationId: string,
    announcementId: string,
    userId: string
  ): Promise<AnnouncementAcknowledgmentDTO | null> {
    const doc = await AnnouncementAcknowledgment.findOne({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      announcementId: new Types.ObjectId(announcementId),
      userId,
    }).lean();

    return doc ? toAnnouncementAcknowledgmentDTO(doc) : null;
  },

  async getManyForUser(
    orgId: string,
    locationId: string,
    announcementIds: string[],
    userId: string
  ): Promise<AnnouncementAcknowledgmentDTO[]> {
    if (announcementIds.length === 0) return [];

    const docs = await AnnouncementAcknowledgment.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      announcementId: {
        $in: announcementIds.map((announcementId) => new Types.ObjectId(announcementId)),
      },
      userId,
    }).lean();

    return docs.map(toAnnouncementAcknowledgmentDTO);
  },

  async deleteAllByLocation(orgId: string, locationId: string): Promise<number> {
    const result = await AnnouncementAcknowledgment.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },

  async deleteAllByOrgId(orgId: string): Promise<number> {
    const result = await AnnouncementAcknowledgment.deleteMany({
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount;
  },
};
