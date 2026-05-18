import { Text, View } from "react-native";

// ── Tiptap document types ─────────────────────────────────────

type TiptapMark = {
  type: "bold" | "italic" | "strike" | string;
};

type TiptapNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
};

type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
};

// ── Inline text renderer ──────────────────────────────────────

function InlineContent({ nodes }: { nodes: TiptapNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "hardBreak") {
          return <Text key={i}>{"\n"}</Text>;
        }

        if (node.type !== "text" || node.text === undefined) return null;

        const marks = node.marks ?? [];
        const bold = marks.some((m) => m.type === "bold");
        const italic = marks.some((m) => m.type === "italic");
        const strike = marks.some((m) => m.type === "strike");

        return (
          <Text
            key={i}
            style={{
              fontWeight: bold ? "700" : undefined,
              fontStyle: italic ? "italic" : undefined,
              textDecorationLine: strike ? "line-through" : undefined,
            }}
          >
            {node.text}
          </Text>
        );
      })}
    </>
  );
}

// ── Block renderers ───────────────────────────────────────────

function Paragraph({ node }: { node: TiptapNode }) {
  return (
    <Text className="text-base text-foreground leading-relaxed mb-2">
      <InlineContent nodes={node.content ?? []} />
    </Text>
  );
}

function Heading({ node }: { node: TiptapNode }) {
  const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
  const className =
    level === 1
      ? "text-xl font-bold text-foreground mt-3 mb-1"
      : "text-lg font-semibold text-foreground mt-2 mb-1";

  return (
    <Text className={className}>
      <InlineContent nodes={node.content ?? []} />
    </Text>
  );
}

function ListItem({
  node,
  prefix,
}: {
  node: TiptapNode;
  prefix: string;
}) {
  // A listItem wraps one or more paragraphs; flatten their inline content.
  const inlineNodes = (node.content ?? []).flatMap((p) => p.content ?? []);

  return (
    <View className="flex-row mb-1 pl-1">
      <Text className="text-base text-muted-foreground mr-2 w-5">{prefix}</Text>
      <Text className="text-base text-foreground flex-1 leading-relaxed">
        <InlineContent nodes={inlineNodes} />
      </Text>
    </View>
  );
}

function BulletList({ node }: { node: TiptapNode }) {
  return (
    <View className="mb-2">
      {(node.content ?? []).map((item, i) => (
        <ListItem key={i} node={item} prefix="•" />
      ))}
    </View>
  );
}

function OrderedList({ node }: { node: TiptapNode }) {
  return (
    <View className="mb-2">
      {(node.content ?? []).map((item, i) => (
        <ListItem key={i} node={item} prefix={`${i + 1}.`} />
      ))}
    </View>
  );
}

function BlockNode({ node }: { node: TiptapNode }) {
  switch (node.type) {
    case "paragraph":
      return <Paragraph node={node} />;
    case "heading":
      return <Heading node={node} />;
    case "bulletList":
      return <BulletList node={node} />;
    case "orderedList":
      return <OrderedList node={node} />;
    default:
      return null;
  }
}

// ── Public component ──────────────────────────────────────────

interface TiptapRendererProps {
  body: string;
}

/**
 * Renders a Tiptap-serialised JSON body string as native React Native
 * components with full formatting (headings, bold, italic, strikethrough,
 * bullet lists, and numbered lists).
 *
 * Falls back to plain text for legacy plain-text documents.
 */
export function TiptapRenderer({ body }: TiptapRendererProps) {
  if (!body) return null;

  let doc: TiptapDoc;
  try {
    doc = JSON.parse(body) as TiptapDoc;
    if (doc.type !== "doc") throw new Error("not a tiptap doc");
  } catch {
    // Legacy plain-text or markdown — render as a single paragraph.
    return <Text className="text-base text-foreground leading-relaxed">{body}</Text>;
  }

  return (
    <View>
      {(doc.content ?? []).map((node, i) => (
        <BlockNode key={i} node={node} />
      ))}
    </View>
  );
}
