"use client";

import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ConfirmationCard } from "@/components/ai-chat/ConfirmationCard";
import type { ChatProposal } from "@/types/ai-chat";

export interface MessageBubbleProps {
  message: UIMessage;
  proposals: Map<string, ChatProposal>;
  isResolving: boolean;
  onResolve: (proposalId: string, action: "approve" | "deny") => Promise<void>;
}

function extractMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function extractProposalIds(message: UIMessage): string[] {
  const ids = new Set<string>();

  for (const part of message.parts) {
    const isToolPart =
      part.type === "dynamic-tool" || part.type.startsWith("tool-");
    if (!isToolPart) continue;

    const toolPart = part as { state: string; output?: unknown };
    if (toolPart.state !== "output-available") continue;

    const output = toolPart.output as Record<string, unknown> | null;
    if (!output || output.type !== "write") continue;
    if (typeof output.proposalId !== "string") continue;

    ids.add(output.proposalId);
  }

  return [...ids];
}

export function MessageBubble({
  message,
  proposals,
  isResolving,
  onResolve,
}: MessageBubbleProps) {
  if (message.role !== "assistant" && message.role !== "user") return null;

  const isUser = message.role === "user";
  const text = extractMessageText(message).trim();
  const proposalIds = isUser ? [] : extractProposalIds(message);

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className="flex w-full max-w-[85%] flex-col gap-3 sm:max-w-[75%]">
        {text ? (
          <div
            className={cn(
              "rounded border px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "border-primary/20 bg-primary text-primary-foreground"
                : "border-stone-300 bg-card text-card-foreground dark:border-white/10"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div className="space-y-3 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            )}
          </div>
        ) : null}

        {!isUser &&
          proposalIds.map((proposalId) => {
            const proposal = proposals.get(proposalId);
            if (!proposal) return null;

            return (
              <ConfirmationCard
                key={proposal.proposalId}
                proposal={proposal}
                onResolve={onResolve}
                isResolving={isResolving}
              />
            );
          })}
      </div>
    </div>
  );
}
