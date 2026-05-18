import { resolveAudienceStaff } from "@/lib/announcement/resolve-audience";
import { AnnouncementService } from "@/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";
import type {
  AnnouncementAnalyticsDTO,
  AnnouncementAnalyticsRosterEntryDTO,
} from "@/types/announcement-analytics";

export const AnnouncementAnalyticsService = {
  async get(
    orgId: string,
    locationId: string,
    announcementId: string
  ): Promise<AnnouncementAnalyticsDTO | null> {
    const announcement = await AnnouncementService.getById(
      orgId,
      locationId,
      announcementId
    );
    if (!announcement) return null;

    const [audience, acknowledgments] = await Promise.all([
      resolveAudienceStaff(orgId, locationId, announcement.targetAudience),
      AnnouncementAcknowledgmentService.listByAnnouncement(
        orgId,
        locationId,
        announcementId
      ),
    ]);

    const acknowledgmentByUserId = new Map(
      acknowledgments.map((entry) => [entry.userId, entry] as const)
    );

    const roster: AnnouncementAnalyticsRosterEntryDTO[] = audience
      .map((staffMember) => {
        const acknowledgment = staffMember.clerkUserId
          ? acknowledgmentByUserId.get(staffMember.clerkUserId)
          : null;

        return {
          staffId: staffMember.id,
          name: staffMember.name,
          roles: staffMember.roles,
          imageUrl: staffMember.imageUrl ?? null,
          hasClerkLink: staffMember.clerkUserId !== null,
          readAt: acknowledgment?.readAt ?? null,
          acknowledgedAt: acknowledgment?.acknowledgedAt ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalAudience = roster.length;
    const readCount = roster.filter((entry) => entry.readAt !== null).length;
    const acknowledgedCount = roster.filter(
      (entry) => entry.acknowledgedAt !== null
    ).length;

    const openRate = totalAudience > 0 ? readCount / totalAudience : 0;
    const acknowledgmentRate =
      totalAudience > 0 ? acknowledgedCount / totalAudience : 0;

    return {
      announcement,
      metrics: {
        totalAudience,
        readCount,
        acknowledgedCount,
        openRate,
        acknowledgmentRate,
      },
      requiresAcknowledgment: announcement.requiresAcknowledgment,
      roster,
    };
  },
};
