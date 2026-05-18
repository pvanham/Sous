import { z } from "zod";

/**
 * PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
 *
 * The legacy announcement model used `expiresAt` plus a four-tier priority
 * enum (`urgent` / `high` / `normal` / `low`). Phase 1 intentionally
 * replaces that shape with:
 *   - `publishDate` / `expirationDate`
 *   - `Standard` / `Urgent` priority
 *   - audience, tags, attachments, and acknowledgment semantics
 *
 * Future phases should build on these values, not map back to the old ones.
 */
export const announcementPriorityValues = [
  "Standard",
  "Urgent",
] as const;

export const ANNOUNCEMENT_AUDIENCE_TOKENS = {
  everyone: "@everyone",
  managers: "@managers",
} as const;

const announcementAudienceEntrySchema = z
  .string()
  .trim()
  .min(1, "Audience entries cannot be empty")
  .max(60, "Audience entries must be 60 characters or less")
  .refine(
    (entry) =>
      !entry.startsWith("@") ||
      entry === ANNOUNCEMENT_AUDIENCE_TOKENS.everyone ||
      entry === ANNOUNCEMENT_AUDIENCE_TOKENS.managers,
    {
      message:
        "Audience entries prefixed with @ are reserved for @everyone and @managers",
    }
  );

const baseAnnouncementMutationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(120, "Title must be 120 characters or less")
      .optional(),
    body: z
      .string()
      .min(1, "Body is required")
      // Body is stored as a Tiptap-serialised JSON string. Allow enough
      // headroom for JSON structural overhead on top of actual content.
      .max(50000, "Body must be 50000 characters or less")
      .optional(),
    priority: z.enum(announcementPriorityValues).optional(),
    targetAudience: z
      .array(announcementAudienceEntrySchema)
      .max(20, "Target audience can include at most 20 entries")
      .optional(),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Tags cannot be empty")
          .max(40, "Tags must be 40 characters or less")
      )
      .max(20, "Tags can include at most 20 entries")
      .optional(),
    publishDate: z.preprocess(
      (value) => (value === null || value === "" ? null : value),
      z.union([z.null(), z.coerce.date()])
    ).optional(),
    expirationDate: z.preprocess(
      (value) => (value === null || value === "" ? null : value),
      z.union([z.null(), z.coerce.date()])
    ).optional(),
    attachments: z
      .array(z.string().url("Attachments must be valid URLs"))
      .max(10, "Attachments can include at most 10 files")
      .optional(),
    requiresAcknowledgment: z.boolean().optional(),
  })
  .refine(
    (value) => {
      if (!value.publishDate || !value.expirationDate) return true;
      return value.expirationDate.getTime() > value.publishDate.getTime();
    },
    {
      message: "Expiration date must be strictly after publish date",
      path: ["expirationDate"],
    }
  )
  .refine(
    (value) => {
      if (value.targetAudience === undefined) return true;
      return value.targetAudience.length > 0;
    },
    {
      message: "Target audience must include at least one entry",
      path: ["targetAudience"],
    }
  )
  .refine(
    (value) => {
      if (value.targetAudience === undefined) return true;
      if (!value.targetAudience.includes(ANNOUNCEMENT_AUDIENCE_TOKENS.everyone)) {
        return true;
      }
      return value.targetAudience.length === 1;
    },
    {
      message: "@everyone cannot be combined with specific audience entries",
      path: ["targetAudience"],
    }
  );

/**
 * Schema for creating a new announcement.
 *
 * The server fills tenancy fields (`orgId`, `locationId`) and author
 * identity (`authorId`, `authorName`) from auth context.
 */
export const createAnnouncementSchema = baseAnnouncementMutationSchema
  .required({
    title: true,
    body: true,
    priority: true,
    targetAudience: true,
    publishDate: true,
  })
  .safeExtend({
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Tags cannot be empty")
          .max(40, "Tags must be 40 characters or less")
      )
      .max(20, "Tags can include at most 20 entries")
      .default([]),
    attachments: z
      .array(z.string().url("Attachments must be valid URLs"))
      .max(10, "Attachments can include at most 10 files")
      .default([]),
    requiresAcknowledgment: z.boolean().default(false),
  });

/**
 * Schema for partial updates.
 */
export const updateAnnouncementSchema = baseAnnouncementMutationSchema
  .safeExtend({
    announcementId: z.string().min(1, "Announcement ID is required"),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.priority !== undefined ||
      value.targetAudience !== undefined ||
      value.tags !== undefined ||
      value.publishDate !== undefined ||
      value.expirationDate !== undefined ||
      value.attachments !== undefined ||
      value.requiresAcknowledgment !== undefined,
    {
      message: "At least one field must be provided for update",
      path: ["announcementId"],
    }
  );

/**
 * Schema for listing announcements.
 */
export const listAnnouncementsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  includeExpired: z.coerce.boolean().optional().default(false),
  includeDrafts: z.coerce.boolean().optional().default(false),
  includeScheduled: z.coerce.boolean().optional().default(false),
});

export const acknowledgeAnnouncementSchema = z.object({
  announcementId: z.string().min(1, "Announcement ID is required"),
  intent: z.enum(["read", "acknowledge"] as const),
});

export type CreateAnnouncementInput = z.infer<
  typeof createAnnouncementSchema
>;
export type UpdateAnnouncementInput = z.infer<
  typeof updateAnnouncementSchema
>;
export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsSchema>;
export type AcknowledgeAnnouncementInput = z.infer<
  typeof acknowledgeAnnouncementSchema
>;
