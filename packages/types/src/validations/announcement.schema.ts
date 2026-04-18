import { z } from "zod";

/**
 * Allowed priority buckets on an announcement.
 *
 * Kept in sync with `AnnouncementPriority` in `packages/types/src/index.ts`.
 * Using a tuple here (rather than re-importing the type) lets `z.enum`
 * generate clean validation messages without a circular dependency.
 */
export const announcementPriorityValues = [
  "urgent",
  "high",
  "normal",
  "low",
] as const;

/**
 * Schema for creating a new announcement.
 *
 * All write-side actions accept this shape; the orgId / locationId /
 * authorClerkUserId / authorName fields are resolved server-side from
 * `getLocationContext` + Clerk and therefore never appear here.
 */
export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or less"),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(2000, "Body must be 2000 characters or less"),
  priority: z.enum(announcementPriorityValues).default("normal"),
  /**
   * Optional ISO date / Date for when the announcement should stop
   * appearing in the feed. Pass `null` to clear an existing expiry.
   * Must be in the future when set.
   */
  expiresAt: z
    .union([z.coerce.date(), z.null()])
    .optional()
    .refine(
      (value) => {
        if (value === undefined || value === null) return true;
        return value.getTime() > Date.now();
      },
      { message: "Expiry must be in the future", path: ["expiresAt"] }
    ),
});

/**
 * Schema for partial updates. Every field is optional, but at least
 * one editable field must be present (enforced at the action layer to
 * keep the inferred type ergonomic).
 */
export const updateAnnouncementSchema = z.object({
  announcementId: z.string().min(1, "Announcement ID is required"),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or less")
    .optional(),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(2000, "Body must be 2000 characters or less")
    .optional(),
  priority: z.enum(announcementPriorityValues).optional(),
  /** Pass `null` explicitly to clear an existing expiry. */
  expiresAt: z.union([z.coerce.date(), z.null()]).optional(),
});

/**
 * Schema for listing announcements (typically by the mobile home tab).
 * `limit` caps the page size; `includeExpired` lets manager UIs see
 * announcements that have rolled off the staff feed.
 */
export const listAnnouncementsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  includeExpired: z.coerce.boolean().optional().default(false),
});

export type CreateAnnouncementInput = z.infer<
  typeof createAnnouncementSchema
>;
export type UpdateAnnouncementInput = z.infer<
  typeof updateAnnouncementSchema
>;
export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsSchema>;
