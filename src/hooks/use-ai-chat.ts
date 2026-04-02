"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { ViewportContext } from "@/lib/validations/viewport-context.schema";
import type {
  ChatProposal,
  ResolveProposalResponse,
} from "@/types/ai-chat";
import type { AsyncTaskStatus } from "@/types/async-task";
import { PROPOSAL_TTL_MINUTES } from "@/lib/ai/constants";
import { generateObjectId } from "@/lib/ai/client/generate-object-id";
import {
  pollTaskStatus,
  type PollTaskResult,
} from "@/lib/ai/client/poll-task-status";
import {
  buildAsyncTaskSystemMessage,
  type AsyncTaskCompletionContext,
} from "@/lib/ai/orchestrator/async-system-message";

export interface UseAIChatOptions {
  viewportContext: ViewportContext;
  conversationId?: string;
  /** Pre-resolved proposal statuses for hydrating conversations from history */
  initialProposalStatuses?: Map<string, ChatProposal["status"]>;
}

export interface UseAIChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  error: string | null;
  proposals: Map<string, ChatProposal>;
  resolveProposal: (
    proposalId: string,
    action: "approve" | "deny"
  ) => Promise<void>;
  isResolving: boolean;
  /** The currently active async task, if any (e.g. schedule generation in flight) */
  activeTask: {
    taskId: string;
    status: AsyncTaskStatus;
    elapsedMs: number;
    progressMessage: string;
  } | null;
  stop: () => void;
  regenerate: () => void;
  setMessages: (
    messages:
      | UIMessage[]
      | ((messages: UIMessage[]) => UIMessage[])
  ) => void;
}

const CLIENT_POLL_TIMEOUT_MESSAGE =
  "Schedule generation timed out. Please try again.";

const SERVER_TIMED_OUT_MESSAGE =
  "Schedule generation timed out on the server. Please try again.";

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

function pollResultToCompletionContext(
  pollResult: PollTaskResult
): AsyncTaskCompletionContext {
  const data = pollResult.data as Record<string, unknown>;
  const elapsedMs =
    typeof data.elapsedMs === "number" && Number.isFinite(data.elapsedMs)
      ? data.elapsedMs
      : 0;

  const status = pollResult.status;

  if (status === "completed") {
    const r = data.result as Record<string, unknown> | undefined;
    return {
      status: "completed",
      taskType: "schedule_generation",
      elapsedMs,
      result: {
        solverStatus: String(r?.solverStatus ?? "UNKNOWN"),
        totalCostCents: Number(r?.totalCostCents ?? 0),
        solveTimeMs: Number(r?.solveTimeMs ?? 0),
        fallbackRatesUsed: Boolean(r?.fallbackRatesUsed),
        overtimeWarnings: Array.isArray(r?.overtimeWarnings)
          ? (r.overtimeWarnings as { staffName: string; hours: number }[])
          : [],
        totalShiftsGenerated: Number(r?.totalShiftsGenerated ?? 0),
        totalUnfilledSlots: Number(r?.totalUnfilledSlots ?? 0),
        summary: String(r?.summary ?? ""),
      },
    };
  }

  if (status === "infeasible") {
    const r = data.result as Record<string, unknown> | undefined;
    const relax = Array.isArray(r?.suggestedRelaxations)
      ? (r.suggestedRelaxations as string[])
      : [];
    return {
      status: "infeasible",
      taskType: "schedule_generation",
      elapsedMs,
      result: {
        solverStatus: "INFEASIBLE",
        totalCostCents: 0,
        solveTimeMs: 0,
        fallbackRatesUsed: false,
        overtimeWarnings: [],
        totalShiftsGenerated: 0,
        totalUnfilledSlots: 0,
        summary: String(r?.summary ?? ""),
        suggestedRelaxations: relax,
      },
    };
  }

  if (status === "failed" || status === "timed_out") {
    const err = data.error as Record<string, unknown> | undefined;
    let message = String(err?.message ?? "");
    const retryable = err?.retryable === true;

    if (status === "timed_out") {
      if (message === CLIENT_POLL_TIMEOUT_MESSAGE) {
        /* keep client-side timeout copy */
      } else {
        message = SERVER_TIMED_OUT_MESSAGE;
      }
    }

    return {
      status,
      taskType: "schedule_generation",
      elapsedMs,
      error: {
        message: message || "Schedule generation failed.",
        retryable,
      },
    };
  }

  return {
    status: "failed",
    taskType: "schedule_generation",
    elapsedMs,
    error: {
      message: "Schedule generation finished with an unknown status.",
      retryable: true,
    },
  };
}

/**
 * Wraps the Vercel AI SDK v6 `useChat` hook with proposal-aware state
 * management and the loop-back mechanism for the HITL circuit.
 *
 * Proposals are extracted from streamed tool invocation parts (dynamic-tool
 * parts with `output.type === "write"`). After a proposal is approved or
 * denied via `resolveProposal()`, a system-context message is injected into
 * the conversation to wake the LLM.
 */
export function useAIChat({
  viewportContext,
  conversationId,
  initialProposalStatuses,
}: UseAIChatOptions): UseAIChatReturn {
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [activeTask, setActiveTask] = useState<UseAIChatReturn["activeTask"]>(
    null
  );
  const [proposalStatuses, setProposalStatuses] = useState<
    Map<string, ChatProposal["status"]>
  >(() => initialProposalStatuses ?? new Map());

  const stableConversationId = useRef(conversationId ?? generateObjectId());
  const viewportRef = useRef(viewportContext);
  viewportRef.current = viewportContext;
  const pollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest({ messages, body }) {
          const lastMessage = messages[messages.length - 1];
          const lastUserText =
            lastMessage?.role === "user"
              ? lastMessage.parts
                  .filter(
                    (p): p is Extract<typeof p, { type: "text" }> =>
                      p.type === "text"
                  )
                  .map((p) => p.text)
                  .join("")
              : "";

          return {
            body: {
              messages,
              message: lastUserText,
              viewportContext: viewportRef.current,
              conversationId: stableConversationId.current,
              ...body,
            },
          };
        },
      }),
    []
  );

  const {
    messages,
    sendMessage: sdkSendMessage,
    status,
    error: sdkError,
    stop,
    regenerate,
    setMessages,
  } = useChat({ transport });

  const proposals = useMemo(() => {
    const map = new Map<string, ChatProposal>();

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        const isToolPart =
          part.type === "dynamic-tool" || part.type.startsWith("tool-");
        if (!isToolPart) continue;

        const toolPart = part as {
          type: string;
          state: string;
          output?: unknown;
          toolName?: string;
        };
        if (toolPart.state !== "output-available") continue;

        const output = toolPart.output as Record<string, unknown> | null;
        if (!output || output.type !== "write" || typeof output.proposalId !== "string") {
          continue;
        }

        const proposalId = output.proposalId as string;
        const overriddenStatus = proposalStatuses.get(proposalId);

        const toolName =
          (output.toolName as string) ??
          toolPart.toolName ??
          part.type.replace(/^tool-/, "");

        const createdAt = (output.createdAt as string) ?? "";
        const isExpiredByTTL =
          !overriddenStatus &&
          createdAt &&
          Date.now() - new Date(createdAt).getTime() >
            PROPOSAL_TTL_MINUTES * 60_000;

        map.set(proposalId, {
          type: "write",
          proposalId,
          toolName,
          description: (output.description as string) ?? "",
          summary: (output.summary as ChatProposal["summary"]) ?? {
            action: "",
            details: [],
          },
          dataVersion: (output.dataVersion as string) ?? "",
          createdAt,
          status: overriddenStatus ?? (isExpiredByTTL ? "expired" : "pending"),
        });
      }
    }

    return map;
  }, [messages, proposalStatuses]);

  const sendMessage = useCallback(
    (content: string) => {
      if (status === "submitted" || status === "streaming") return;
      sdkSendMessage({ text: content });
    },
    [status, sdkSendMessage]
  );

  const resolveProposal = useCallback(
    async (proposalId: string, action: "approve" | "deny") => {
      const proposal = proposals.get(proposalId);
      if (!proposal || proposal.status !== "pending") return;

      setIsResolving(true);

      try {
        const res = await fetch(
          `/api/ai/proposals/${proposalId}/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }
        );

        const data: ResolveProposalResponse = await res.json();

        if (res.status === 409) {
          setProposalStatuses((prev) => {
            const next = new Map(prev);
            next.set(proposalId, "stale");
            return next;
          });
          return;
        }

        if (!res.ok || !data.success) {
          throw new Error(
            data.message ?? "Failed to resolve proposal. Please try again."
          );
        }

        const newStatus = action === "approve" ? "approved" : "denied";
        setProposalStatuses((prev) => {
          const next = new Map(prev);
          next.set(proposalId, newStatus);
          return next;
        });

        if (action === "approve") {
          queryClient.invalidateQueries({ queryKey: ["shifts"] });
          queryClient.invalidateQueries({ queryKey: ["schedules"] });
        }

        const toolName = proposal.toolName;
        const executionSummary = data.executionSummary ?? "";

        if (
          action === "approve" &&
          data.async === true &&
          typeof data.asyncTaskId === "string" &&
          data.asyncTaskId.length > 0
        ) {
          const taskId = data.asyncTaskId;
          pollAbortRef.current?.abort();
          const abort = new AbortController();
          pollAbortRef.current = abort;

          setActiveTask({
            taskId,
            status: "pending",
            elapsedMs: 0,
            progressMessage: "Generating schedule... (0s)",
          });
          setIsResolving(false);

          try {
            const pollResult = await pollTaskStatus({
              taskId,
              intervalMs: 3000,
              maxDurationMs: 150_000,
              signal: abort.signal,
              onStatusUpdate: (taskStatus, elapsed) => {
                setActiveTask({
                  taskId,
                  status: taskStatus,
                  elapsedMs: elapsed,
                  progressMessage: `Generating schedule... (${Math.round(elapsed / 1000)}s)`,
                });
              },
            });

            const ctx = pollResultToCompletionContext(pollResult);
            const systemMessage = buildAsyncTaskSystemMessage(ctx);
            await sdkSendMessage({ text: systemMessage });
          } catch (err) {
            if (!isAbortError(err)) {
              console.error("[useAIChat] async task polling error:", err);
              await sdkSendMessage({
                text: `[SYSTEM: Schedule generation failed while waiting for results. Please try again.]`,
              });
            }
          } finally {
            setActiveTask(null);
            if (pollAbortRef.current === abort) {
              pollAbortRef.current = null;
            }
          }
          return;
        }

        const loopBackText = `[SYSTEM: The user ${action}d the ${toolName} tool. ${executionSummary}]`;

        await sdkSendMessage({ text: loopBackText });
      } catch (err) {
        console.error("[useAIChat] resolveProposal error:", err);
      } finally {
        setIsResolving(false);
      }
    },
    [proposals, sdkSendMessage, queryClient]
  );

  const errorMessage = sdkError?.message ?? null;

  return {
    messages,
    sendMessage,
    status,
    error: errorMessage,
    proposals,
    resolveProposal,
    isResolving,
    activeTask,
    stop,
    regenerate: () => regenerate(),
    setMessages,
  };
}
