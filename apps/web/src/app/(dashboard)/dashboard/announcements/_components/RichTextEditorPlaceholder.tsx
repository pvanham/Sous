"use client";

import { useRef } from "react";
import { Bold, Italic, Link2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RichTextEditorPlaceholderProps = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
};

type WrapOpts =
  | { kind: "wrap"; before: string; after: string; defaultText?: string }
  | { kind: "linePrefix"; prefix: string };

function applyMarkdown(
  textarea: HTMLTextAreaElement,
  opts: WrapOpts,
  value: string,
  onChange: (next: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end);

  let replacement: string;
  let cursorStart: number;
  let cursorEnd: number;

  if (opts.kind === "wrap") {
    const { before, after, defaultText = "text" } = opts;
    const inner = selected || defaultText;
    replacement = `${before}${inner}${after}`;
    cursorStart = selected ? start : start + before.length;
    cursorEnd = selected ? start + replacement.length : cursorStart + inner.length;
  } else {
    const lines = (selected || "line").split("\n");
    replacement = lines.map((l) => `${opts.prefix}${l}`).join("\n");
    cursorStart = start;
    cursorEnd = start + replacement.length;
  }

  const next = value.slice(0, start) + replacement + value.slice(end);
  onChange(next);

  // Restore focus and selection after React re-render
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
  });
}

/**
 * Markdown-backed body editor. Toolbar buttons insert/wrap markdown syntax
 * around the current selection so the stored value is always plain markdown.
 */
export function RichTextEditorPlaceholder({
  value,
  onChange,
  onBlur,
  disabled = false,
}: RichTextEditorPlaceholderProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apply = (opts: WrapOpts) => {
    if (!textareaRef.current) return;
    applyMarkdown(textareaRef.current, opts, value, onChange);
  };

  const handleLink = () => {
    if (!textareaRef.current) return;
    const { selectionStart: start, selectionEnd: end } = textareaRef.current;
    const selected = value.slice(start, end);

    const url = window.prompt("Enter URL", "https://");
    if (!url) return;

    const linkText = selected || "link text";
    const replacement = `[${linkText}](${url})`;
    const next = value.slice(0, start) + replacement + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, start + replacement.length);
    });
  };

  return (
    <div className="rounded border border-stone-300 dark:border-white/10">
      <div className="flex items-center gap-2 border-b border-stone-300 p-2 dark:border-white/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Bold (wraps selection in **)"
          onClick={() => apply({ kind: "wrap", before: "**", after: "**", defaultText: "bold text" })}
        >
          <Bold />
          Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Italic (wraps selection in _)"
          onClick={() => apply({ kind: "wrap", before: "_", after: "_", defaultText: "italic text" })}
        >
          <Italic />
          Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Bullet list (prefixes each selected line with - )"
          onClick={() => apply({ kind: "linePrefix", prefix: "- " })}
        >
          <List />
          List
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Insert link"
          onClick={handleLink}
        >
          <Link2 />
          Link
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder="Write your announcement… select text, then click a toolbar button to format it."
        maxLength={10000}
        className="min-h-[280px] resize-y rounded-none border-0 bg-transparent focus-visible:ring-0"
      />
    </div>
  );
}
