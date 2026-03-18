"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { Loader2, RotateCcw } from "lucide-react";
import { useAIChat } from "@/hooks/use-ai-chat";
import type { ViewportContext } from "@/lib/validations/viewport-context.schema";
import { MessageBubble } from "@/components/ai-chat/MessageBubble";
import { ChatInput } from "@/components/ai-chat/ChatInput";
import { Button } from "@/components/ui/button";

export interface ChatShellProps {
  locationId: string;
  conversationId?: string;
  viewportContext: ViewportContext;
}

const MAX_MESSAGE_LENGTH = 4000;

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

export function ChatShell({ locationId, conversationId, viewportContext }: ChatShellProps) {
  const [draft, setDraft] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const mergedViewportContext = useMemo(
    () => ({ ...viewportContext, locationId }),
    [locationId, viewportContext]
  );

  const { messages, status, error, sendMessage, proposals, resolveProposal, isResolving } =
    useAIChat({
      viewportContext: mergedViewportContext,
      conversationId,
    });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading]);

  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }

  function handleSend() {
    const content = draft.trim();
    if (!content || isLoading || status === "error") return;
    if (content.length > MAX_MESSAGE_LENGTH) return;
    sendMessage(content);
    setDraft("");
  }

  function handleRetry() {
    if (isLoading) return;
    const lastUserText = getLastUserMessageText(messages);
    if (!lastUserText) return;
    sendMessage(lastUserText);
  }

  return (
    <section className="flex h-[calc(100vh-10rem)] min-h-[540px] w-full flex-col rounded border border-stone-300 bg-background dark:border-white/10">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Ask your AI assistant anything about your schedule, staff, or shifts.
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

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Assistant is thinking...
          </div>
        ) : null}
      </div>

      {error || status === "error" ? (
        <div className="mx-3 mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 sm:mx-4 sm:mb-4">
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
        onSend={handleSend}
        isLoading={isLoading}
        disabled={status === "error"}
      />
    </section>
  );
}
