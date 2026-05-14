"use client";

import { Bold, Italic, Link2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RichTextEditorPlaceholderProps = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
};

/**
 * Phase 2 — Announcement Composer
 * Keep the value/onChange contract stable so we can replace internals later.
 */
export function RichTextEditorPlaceholder({
  value,
  onChange,
  onBlur,
  disabled = false,
}: RichTextEditorPlaceholderProps) {
  return (
    <div className="rounded border border-stone-300 dark:border-white/10">
      <div className="flex items-center gap-2 border-b border-stone-300 p-2 dark:border-white/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled="true"
          disabled
          title="Rich text tools coming soon"
        >
          <Bold />
          Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled="true"
          disabled
          title="Rich text tools coming soon"
        >
          <Italic />
          Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled="true"
          disabled
          title="Rich text tools coming soon"
        >
          <List />
          List
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled="true"
          disabled
          title="Rich text tools coming soon"
        >
          <Link2 />
          Link
        </Button>
      </div>

      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder="Write your announcement..."
        maxLength={10000}
        className="min-h-[280px] resize-y rounded-none border-0 bg-transparent focus-visible:ring-0"
      />
    </div>
  );
}
