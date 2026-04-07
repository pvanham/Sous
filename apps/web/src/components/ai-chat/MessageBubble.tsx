"use client";

import type { UIMessage } from "ai";
import { motion } from "framer-motion";
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

  if (isUser && text.startsWith("[SYSTEM:")) return null;

  const proposalIds = isUser ? [] : extractProposalIds(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className="flex w-full max-w-[88%] flex-col gap-2 sm:max-w-[78%]">
        {!isUser && (
          <span
            className="ml-1 text-[11px] font-semibold"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #e11d48)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Sous
          </span>
        )}
        {text ? (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm border border-stone-200 bg-card text-card-foreground shadow-sm dark:border-white/10"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div className="space-y-3 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p:not(:first-child)]:mt-2 [&_ul]:list-disc [&_ul]:pl-4">
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
    </motion.div>
  );
}
