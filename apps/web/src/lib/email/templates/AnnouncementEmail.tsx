import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { BaseLayout } from "./BaseLayout";

// ── Tiptap node types ─────────────────────────────────────────

type TiptapMark = { type: "bold" | "italic" | "strike" | string };

type TiptapNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
};

type TiptapDoc = { type: "doc"; content?: TiptapNode[] };

// ── Shared inline styles ──────────────────────────────────────

const BASE_TEXT: CSSProperties = {
  color: "#292524",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px 0",
};

const HEADING_1: CSSProperties = {
  color: "#1c1917",
  fontSize: "18px",
  fontWeight: 700,
  lineHeight: "26px",
  margin: "20px 0 8px 0",
};

const HEADING_2: CSSProperties = {
  color: "#1c1917",
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: "24px",
  margin: "16px 0 6px 0",
};

const LIST_ITEM: CSSProperties = {
  ...BASE_TEXT,
  margin: "0 0 6px 0",
  paddingLeft: "4px",
};

// ── Inline content renderer ───────────────────────────────────
// Uses HTML elements directly — react-email compiles JSX to HTML so
// <strong>, <em>, and <s> are handled correctly by all major clients.

function InlineContent({ nodes }: { nodes: TiptapNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "hardBreak") return <br key={i} />;
        if (node.type !== "text" || node.text === undefined) return null;

        const marks = node.marks ?? [];
        let content: React.ReactNode = node.text;

        if (marks.some((m) => m.type === "strike")) {
          content = <s>{content}</s>;
        }
        if (marks.some((m) => m.type === "italic")) {
          content = <em>{content}</em>;
        }
        if (marks.some((m) => m.type === "bold")) {
          content = <strong>{content}</strong>;
        }

        return <span key={i}>{content}</span>;
      })}
    </>
  );
}

// ── Block renderers ───────────────────────────────────────────

function TiptapBlock({ node }: { node: TiptapNode }) {
  switch (node.type) {
    case "paragraph":
      return (
        <Text style={BASE_TEXT}>
          <InlineContent nodes={node.content ?? []} />
        </Text>
      );

    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      return (
        <Text style={level === 1 ? HEADING_1 : HEADING_2}>
          <InlineContent nodes={node.content ?? []} />
        </Text>
      );
    }

    case "bulletList":
      return (
        <Section style={{ margin: "0 0 12px 0" }}>
          {(node.content ?? []).map((item, i) => (
            <Text key={i} style={LIST_ITEM}>
              {"• "}
              <InlineContent
                nodes={(item.content ?? []).flatMap((p) => p.content ?? [])}
              />
            </Text>
          ))}
        </Section>
      );

    case "orderedList":
      return (
        <Section style={{ margin: "0 0 12px 0" }}>
          {(node.content ?? []).map((item, i) => (
            <Text key={i} style={LIST_ITEM}>
              {`${i + 1}. `}
              <InlineContent
                nodes={(item.content ?? []).flatMap((p) => p.content ?? [])}
              />
            </Text>
          ))}
        </Section>
      );

    default:
      return null;
  }
}

// ── Public component ──────────────────────────────────────────

export interface AnnouncementEmailProps {
  /** Announcement title — used as the email heading. */
  title: string;
  /** Name of the manager who posted the announcement. */
  authorName: string;
  /** Tiptap-serialised JSON string for the announcement body. */
  body: string;
  /** Short plain-text preview shown in inbox clients. */
  preview: string;
}

/**
 * Transactional email for new announcements.
 *
 * Renders the Tiptap JSON body with headings, bold/italic/strike inline
 * marks, and bullet/numbered lists — all using inline styles for
 * maximum email client compatibility.
 *
 * Falls back to rendering the raw string for legacy plain-text documents.
 */
export function AnnouncementEmail({
  title,
  authorName,
  body,
  preview,
}: AnnouncementEmailProps) {
  let doc: TiptapDoc | null = null;
  try {
    const parsed = JSON.parse(body) as TiptapDoc;
    if (parsed.type === "doc") doc = parsed;
  } catch {
    // Legacy plain-text body — fall through to the simple paragraph below.
  }

  return (
    <BaseLayout preview={preview} heading={title}>
      <Text style={{ ...BASE_TEXT, color: "#78716c", marginBottom: "20px" }}>
        {authorName} posted an announcement at your location:
      </Text>

      {doc ? (
        (doc.content ?? []).map((node, i) => (
          <TiptapBlock key={i} node={node} />
        ))
      ) : (
        <Text style={BASE_TEXT}>{body}</Text>
      )}
    </BaseLayout>
  );
}
