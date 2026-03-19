"use client";

import { useEffect, useRef } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
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
    <div className="border-t border-stone-200 bg-card px-4 pb-4 pt-3 dark:border-white/10">
      {/* Unified input container — textarea + button live inside one rounded box */}
      <div
        className={cn(
          "relative flex rounded-xl border bg-background transition-colors",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
          disabled ? "border-stone-200 opacity-60 dark:border-white/10" : "border-stone-200 dark:border-white/10"
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!isSendDisabled) onSend();
          }}
          placeholder="Message Sous…"
          className={cn(
            "w-full resize-none bg-transparent py-3 pl-4 pr-12",
            "max-h-[220px] min-h-[44px] text-sm leading-relaxed",
            "placeholder:text-muted-foreground/60",
            "focus:outline-none"
          )}
        />

        {/* Send button — pinned to bottom-right inside the box */}
        <button
          type="button"
          onClick={onSend}
          disabled={isSendDisabled}
          aria-label="Send message"
          className={cn(
            "absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            isSendDisabled
              ? "cursor-not-allowed bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500"
              : "ai-gradient text-white shadow-sm active:scale-95"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SendHorizontal className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Character counter */}
      <div className="mt-1.5 flex min-h-4 items-center justify-end">
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
