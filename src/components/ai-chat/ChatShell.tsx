"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { RotateCcw, Sparkles } from "lucide-react";
import { useAIChat } from "@/hooks/use-ai-chat";
import type { ViewportContext } from "@/lib/validations/viewport-context.schema";
import { AsyncTaskIndicator } from "@/components/ai-chat/AsyncTaskIndicator";
import { MessageBubble } from "@/components/ai-chat/MessageBubble";
import { ChatInput } from "@/components/ai-chat/ChatInput";
import { Button } from "@/components/ui/button";

export interface ChatShellProps {
  locationId: string;
  conversationId?: string;
  viewportContext: ViewportContext;
}

const MAX_MESSAGE_LENGTH = 4000;

const SUGGESTION_CHIPS = [
  { label: "Who's working today?", emoji: "📅" },
  { label: "Any open shifts this week?", emoji: "🔓" },
  { label: "Show me this week's schedule", emoji: "📋" },
  { label: "Any pending time-off requests?", emoji: "✉️" },
];

function extractText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function getLastUserMessageText(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== "user") continue;
    const text = extractText(candidate);
    if (text) return text;
  }
  return null;
}

/** Three bouncing dots — a friendlier "thinking" indicator */
function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
            style={{
              animation: "sousBounceDot 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Sous is thinking…</span>
    </div>
  );
}

export function ChatShell({ locationId, conversationId, viewportContext }: ChatShellProps) {
  const [draft, setDraft] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const mergedViewportContext = useMemo(
    () => ({ ...viewportContext, locationId }),
    [locationId, viewportContext]
  );

  const {
    messages,
    status,
    error,
    sendMessage,
    proposals,
    resolveProposal,
    isResolving,
    activeTask,
  } = useAIChat({
    viewportContext: mergedViewportContext,
    conversationId,
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, activeTask]);

  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }

  function handleSend(content?: string) {
    const text = (content ?? draft).trim();
    if (!text || isLoading) return;
    if (text.length > MAX_MESSAGE_LENGTH) return;
    sendMessage(text);
    setDraft("");
  }

  function handleRetry() {
    if (isLoading) return;
    const lastUserText = getLastUserMessageText(messages);
    if (!lastUserText) return;
    sendMessage(lastUserText);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* Bounce keyframe injected once */}
      <style>{`
        @keyframes sousBounceDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8 text-center">

            {/* Gradient avatar */}
            <div className="relative">
              <div className="ai-gradient flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              {/* Glow halo using a blurred copy underneath */}
              <div
                className="pointer-events-none absolute inset-0 -z-10 rounded-2xl blur-xl opacity-40"
                style={{ background: "linear-gradient(135deg, #f59e0b, #e11d48)" }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-base font-semibold tracking-tight text-foreground">
                Hi, I&apos;m{" "}
                {/* Gradient text using background-clip with real hex colors */}
                <span
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #e11d48)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Sous
                </span>
              </p>
              <p className="mx-auto max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                Your scheduling assistant. Ask me about your team, shifts, and schedule.
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleSend(chip.label)}
                  className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 hover:shadow-md hover:-translate-y-0.5 dark:border-white/10 dark:hover:border-amber-500/40 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
                >
                  <span>{chip.emoji}</span>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              proposals={proposals}
              isResolving={isResolving}
              onResolve={resolveProposal}
            />
          ))
        )}

        {activeTask ? <AsyncTaskIndicator task={activeTask} /> : null}

        {isLoading ? <ThinkingDots /> : null}
      </div>

      {/* Error banner */}
      {error || status === "error" ? (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={isLoading}
            >
              <RotateCcw />
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={() => handleSend()}
        isLoading={isLoading}
      />
    </section>
  );
}
