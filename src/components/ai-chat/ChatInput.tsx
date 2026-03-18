"use client";

import { useEffect, useRef } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 4000;
const CHARACTER_WARNING_THRESHOLD = 3600;

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [value]);

  const remainingCharacters = MAX_MESSAGE_LENGTH - value.length;
  const showCharacterWarning = value.length >= CHARACTER_WARNING_THRESHOLD;
  const isEmpty = value.trim().length === 0;
  const isSendDisabled =
    disabled || isLoading || isEmpty || value.length > MAX_MESSAGE_LENGTH;

  return (
    <div className="border-t border-stone-300 bg-card p-3 dark:border-white/10 sm:p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            if (!isSendDisabled) onSend();
          }}
          placeholder="Ask about schedules, staffing, or shifts..."
          rows={1}
          className="max-h-[220px] min-h-[44px] resize-none"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ai"
          size="icon"
          onClick={onSend}
          disabled={isSendDisabled}
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>

      <div className="mt-2 flex min-h-5 items-center justify-end">
        {showCharacterWarning ? (
          <p
            className={cn(
              "text-xs",
              remainingCharacters < 0 ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {remainingCharacters} characters remaining
          </p>
        ) : null}
      </div>
    </div>
  );
}
