import type { AnnouncementDTO } from "@/types/announcement";

export type AnnouncementAnalyticsRosterEntryDTO = {
  staffId: string;
  name: string;
  roles: string[];
  imageUrl: string | null;
  hasClerkLink: boolean;
  readAt: Date | null;
  acknowledgedAt: Date | null;
};

export type AnnouncementAnalyticsMetricsDTO = {
  totalAudience: number;
  readCount: number;
  acknowledgedCount: number;
  openRate: number;
  acknowledgmentRate: number;
};

export type AnnouncementAnalyticsDTO = {
  announcement: AnnouncementDTO;
  metrics: AnnouncementAnalyticsMetricsDTO;
  requiresAcknowledgment: boolean;
  roster: AnnouncementAnalyticsRosterEntryDTO[];
};
