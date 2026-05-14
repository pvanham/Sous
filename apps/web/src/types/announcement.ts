// Re-export shared types from @sous/types so the web app can import
// from a single, app-local module while the wire shape stays the
// canonical one in `packages/types/src`.
export type {
  AnnouncementPriority,
  AnnouncementDTO,
  AnnouncementAcknowledgmentDTO,
  AnnouncementLifecycleStatus,
} from "@sous/types";

import type {
  AnnouncementDTO,
  AnnouncementPriority,
  AnnouncementAcknowledgmentDTO,
  AnnouncementLifecycleStatus,
} from "@sous/types";

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
 *
 * Removed fields:
 * - `authorClerkUserId` (replaced by `authorId`)
 * - `expiresAt` (replaced by `expirationDate`)
 * - legacy 4-tier priorities (`urgent|high|normal|low`)
 */

// ── Server-coupled: Mongoose document interface ──────────────
//
// The Mongoose model uses `Types.ObjectId` for tenant fields, but the
// service layer only consumes / emits plain strings via the DTO. We
// keep the model interface loose (`unknown`) so the schema file is
// the only place that reaches for `mongoose.Types.ObjectId` and we
// avoid forcing `mongoose` types into shared code.
export interface IAnnouncement {
  orgId: unknown;
  locationId: unknown;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  targetAudience: string[];
  tags: string[];
  publishDate: Date | null;
  expirationDate: Date | null;
  attachments: string[];
  requiresAcknowledgment: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnnouncementAcknowledgment {
  orgId: unknown;
  locationId: unknown;
  announcementId: unknown;
  userId: string;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert a lean Mongoose document (or a freshly-saved doc that has
 * been `.toObject()`'d) into the wire-safe `AnnouncementDTO`.
 *
 * The `_id`, `orgId`, and `locationId` fields are stringified once
 * here so callers downstream never have to think about `ObjectId`.
 */
export function toAnnouncementDTO(
  doc: IAnnouncement & { _id: unknown }
): AnnouncementDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    authorId: doc.authorId,
    authorName: doc.authorName,
    title: doc.title,
    body: doc.body,
    priority: doc.priority,
    targetAudience: doc.targetAudience,
    tags: doc.tags,
    publishDate: doc.publishDate ?? null,
    expirationDate: doc.expirationDate ?? null,
    attachments: doc.attachments,
    requiresAcknowledgment: doc.requiresAcknowledgment,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toAnnouncementAcknowledgmentDTO(
  doc: IAnnouncementAcknowledgment & { _id: unknown }
): AnnouncementAcknowledgmentDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    announcementId: String(doc.announcementId),
    userId: doc.userId,
    readAt: doc.readAt ?? null,
    acknowledgedAt: doc.acknowledgedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function computeAnnouncementLifecycle(
  announcement: Pick<AnnouncementDTO, "publishDate" | "expirationDate">,
  now: Date = new Date()
): AnnouncementLifecycleStatus {
  if (announcement.publishDate === null) return "draft";
  if (announcement.publishDate.getTime() > now.getTime()) return "scheduled";
  if (
    announcement.expirationDate !== null &&
    announcement.expirationDate.getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return "active";
}
