// Re-export shared types from @sous/types so the web app can import
// from a single, app-local module while the wire shape stays the
// canonical one in `packages/types/src`.
export type { AnnouncementPriority, AnnouncementDTO } from "@sous/types";

import type { AnnouncementDTO, AnnouncementPriority } from "@sous/types";

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
  authorClerkUserId: string;
  authorName: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  expiresAt?: Date | null;
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
    authorClerkUserId: doc.authorClerkUserId,
    authorName: doc.authorName,
    title: doc.title,
    body: doc.body,
    priority: doc.priority,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
