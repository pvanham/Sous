import type { CreateAnnouncementInput } from "@sous/types/validations/announcement.schema";

/**
 * Phase 2 — Announcement Composer
 * Keep this as the single defaults source so future phases don't diverge.
 */
export function composerDefaultValues(): CreateAnnouncementInput {
  return {
    title: "",
    body: "",
    priority: "Standard",
    targetAudience: ["Global"],
    tags: [],
    publishDate: null,
    expirationDate: null,
    attachments: [],
    requiresAcknowledgment: false,
  };
}

export function normalizeTag(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!collapsed) return null;
  if (collapsed.length > 32) return null;
  return collapsed;
}

export function coerceDateTimeLocal(
  value: string | null | undefined
): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
