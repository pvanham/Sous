import { randomUUID } from "node:crypto";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const sanitized = trimmed
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return sanitized.length > 0 ? sanitized : "attachment";
}

export function generateAttachmentKey(input: {
  orgId: string;
  filename: string;
}): string {
  const safeFilename = sanitizeFilename(input.filename);
  return `announcements/${input.orgId}/${randomUUID()}/${safeFilename}`;
}
