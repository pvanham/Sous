"use client";

import { useEffect } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TiptapEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
};

function parseContent(value: string): object | string {
  if (!value) return "";
  try {
    return JSON.parse(value) as object;
  } catch {
    // Legacy plain-text or markdown — fall back to treating it as plain text.
    return value;
  }
}

/**
 * WYSIWYG body editor backed by Tiptap.
 *
 * Exports structured JSON (editor.getJSON()) via onChange so the form always
 * stores a Tiptap document — never raw Markdown or HTML.
 */
export function TiptapEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: parseContent(value),
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange(JSON.stringify(e.getJSON()));
    },
    onBlur: () => {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose dark:prose-invert prose-stone max-w-none",
          "min-h-[240px] px-3 py-2 focus:outline-none",
        ),
      },
    },
  });

  // useEditorState subscribes to every Tiptap transaction via
  // useSyncExternalStoreWithSelector — the correct v3 way to derive reactive
  // toolbar state without polling or manual forceUpdate hacks.
  const toolbarState = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive("bold") ?? false,
      isItalic: ctx.editor?.isActive("italic") ?? false,
      isStrike: ctx.editor?.isActive("strike") ?? false,
      isH1: ctx.editor?.isActive("heading", { level: 1 }) ?? false,
      isH2: ctx.editor?.isActive("heading", { level: 2 }) ?? false,
      isBulletList: ctx.editor?.isActive("bulletList") ?? false,
      isOrderedList: ctx.editor?.isActive("orderedList") ?? false,
    }),
  });

  // Keep editability in sync when the disabled prop changes.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Sync external value resets (e.g. form.reset()) back into the editor.
  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    if (value !== currentJson) {
      editor.commands.setContent(parseContent(value));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className={cn(
        "rounded border border-input bg-background",
        "focus-within:ring-1 focus-within:ring-ring focus-within:border-ring",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-input px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={toolbarState?.isBold ?? false}
          title="Bold"
          disabled={disabled}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={toolbarState?.isItalic ?? false}
          title="Italic"
          disabled={disabled}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={toolbarState?.isStrike ?? false}
          title="Strikethrough"
          disabled={disabled}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="h-4 w-px bg-border mx-0.5" aria-hidden />

        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={toolbarState?.isH1 ?? false}
          title="Heading 1"
          disabled={disabled}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={toolbarState?.isH2 ?? false}
          title="Heading 2"
          disabled={disabled}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="h-4 w-px bg-border mx-0.5" aria-hidden />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={toolbarState?.isBulletList ?? false}
          title="Bullet list"
          disabled={disabled}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={toolbarState?.isOrderedList ?? false}
          title="Numbered list"
          disabled={disabled}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

type ToolbarButtonProps = {
  onClick: () => void;
  active: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
};

function ToolbarButton({
  onClick,
  active,
  title,
  disabled = false,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-7 w-7"
      title={title}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
