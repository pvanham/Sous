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
    targetAudience: ["@everyone"],
    tags: [],
    publishDate: null,
    expirationDate: null,
    attachments: [],
    requiresAcknowledgment: false,
  };
}

/**
 * Extract a plain-text string from a Tiptap-serialised JSON body.
 * Falls back to returning the raw value for legacy plain-text documents.
 */
export function tiptapBodyToPlainText(body: string): string {
  if (!body) return "";
  let doc: { content?: unknown[] };
  try {
    doc = JSON.parse(body) as { content?: unknown[] };
  } catch {
    return body;
  }

  const chunks: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && typeof n.text === "string") {
      chunks.push(n.text);
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
      // Add a space between block-level nodes so words don't run together.
      chunks.push(" ");
    }
  }

  walk(doc);
  return chunks.join("").replace(/\s+/g, " ").trim();
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
