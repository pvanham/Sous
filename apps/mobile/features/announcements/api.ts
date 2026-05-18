import type {
  AnnouncementAcknowledgmentDTO,
  AnnouncementListItemDTO,
} from "@sous/types";
import { apiClient } from "@/lib/api-client";

export type AnnouncementListLifecycle = "active" | "expired";
export type AnnouncementListItem = AnnouncementListItemDTO;

type SerializedAnnouncementListItem = Omit<AnnouncementListItemDTO, "announcement" | "acknowledgment"> & {
  announcement: SerializedAnnouncement;
  acknowledgment: SerializedAcknowledgment | null;
};

type SerializedAnnouncement = Omit<
  AnnouncementListItemDTO["announcement"],
  "publishDate" | "expirationDate" | "createdAt" | "updatedAt"
> & {
  publishDate: string | null;
  expirationDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type SerializedAcknowledgment = Omit<
  AnnouncementAcknowledgmentDTO,
  "readAt" | "acknowledgedAt" | "createdAt" | "updatedAt"
> & {
  readAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchAnnouncements(options?: {
  lifecycle?: AnnouncementListLifecycle;
  limit?: number;
}): Promise<AnnouncementListItem[]> {
  const response = await apiClient.get<SerializedAnnouncementListItem[]>("/announcements", {
    params: {
      lifecycle: options?.lifecycle ?? "active",
      limit: options?.limit,
    },
  });
  return response.data.map(reviveAnnouncementListItem);
}

export async function fetchAnnouncementById(id: string): Promise<AnnouncementListItem> {
  const response = await apiClient.get<SerializedAnnouncementListItem>(`/announcements/${id}`);
  return reviveAnnouncementListItem(response.data);
}

export async function markAnnouncementRead(
  id: string
): Promise<AnnouncementAcknowledgmentDTO> {
  const response = await apiClient.post<SerializedAcknowledgment>(`/announcements/${id}/read`);
  return reviveAcknowledgment(response.data);
}

export async function acknowledgeAnnouncement(
  id: string
): Promise<AnnouncementAcknowledgmentDTO> {
  const response = await apiClient.post<SerializedAcknowledgment>(
    `/announcements/${id}/acknowledge`
  );
  return reviveAcknowledgment(response.data);
}

function reviveAnnouncementListItem(
  raw: SerializedAnnouncementListItem
): AnnouncementListItem {
  return {
    announcement: {
      ...raw.announcement,
      publishDate: raw.announcement.publishDate ? new Date(raw.announcement.publishDate) : null,
      expirationDate: raw.announcement.expirationDate
        ? new Date(raw.announcement.expirationDate)
        : null,
      createdAt: new Date(raw.announcement.createdAt),
      updatedAt: new Date(raw.announcement.updatedAt),
    },
    acknowledgment: raw.acknowledgment ? reviveAcknowledgment(raw.acknowledgment) : null,
  };
}

function reviveAcknowledgment(raw: SerializedAcknowledgment): AnnouncementAcknowledgmentDTO {
  return {
    ...raw,
    readAt: raw.readAt ? new Date(raw.readAt) : null,
    acknowledgedAt: raw.acknowledgedAt ? new Date(raw.acknowledgedAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
