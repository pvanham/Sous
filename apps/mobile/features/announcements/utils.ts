/**
 * Extract a flat plain-text string from a Tiptap-serialised JSON body.
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
      chunks.push(" ");
    }
  }

  walk(doc);
  return chunks.join("").replace(/\s+/g, " ").trim();
}
