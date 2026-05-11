"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AsyncTaskStatus } from "@/types/async-task";

export interface AsyncTaskIndicatorProps {
  /** The active task state from the chat hook */
  task: {
    taskId: string;
    status: AsyncTaskStatus;
    elapsedMs: number;
    progressMessage: string;
  };
  /** Compact badge after schedule is saved (cascade) */
  collapsed?: boolean;
  collapsedMessage?: string;
}

const KNOWN_STATUSES: AsyncTaskStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "infeasible",
  "timed_out",
];

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function AsyncTaskIndicator({
  task,
  collapsed,
  collapsedMessage,
}: AsyncTaskIndicatorProps) {
  const { status, progressMessage } = task;
  const isKnown = KNOWN_STATUSES.includes(status);
  const effectiveStatus: AsyncTaskStatus | "unknown" = isKnown
    ? status
    : "unknown";

  const [displayElapsed, setDisplayElapsed] = useState(task.elapsedMs);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayElapsed(task.elapsedMs);
  }, [task.elapsedMs, task.taskId]);

  useEffect(() => {
    if (status !== "pending" && status !== "running") return;
    const id = window.setInterval(() => {
      setDisplayElapsed((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [status, task.taskId]);

  if (collapsed) {
    const text = collapsedMessage ?? "Schedule accepted.";
    return (
      <div
        className="flex w-full justify-start"
        aria-live="polite"
        aria-atomic="true"
      >
        <div
          className="flex w-full max-w-md items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-950/5 px-3 py-2.5 text-sm text-foreground shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/20"
          role="status"
        >
          <CheckCircle2
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <span className="min-w-0 font-medium leading-snug">{text}</span>
        </div>
      </div>
    );
  }

  const showTimer =
    effectiveStatus === "pending" ||
    effectiveStatus === "running" ||
    effectiveStatus === "unknown";

  const cardBorder =
    effectiveStatus === "completed"
      ? "border-emerald-600/30 dark:border-emerald-400/20"
      : effectiveStatus === "infeasible"
        ? "border-amber-600/30 dark:border-amber-400/20"
        : effectiveStatus === "failed" || effectiveStatus === "timed_out"
          ? "border-red-600/30 dark:border-red-400/20"
          : "border-l-4 border-l-amber-600 dark:border-l-amber-500";

  return (
    <div
      className="flex w-full justify-start"
      aria-live="polite"
      aria-atomic="true"
    >
      <style>{`
        @keyframes sousAsyncIndeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
      `}</style>

      <Card className={cn("w-full max-w-md", cardBorder)}>
        <CardContent className="space-y-3 p-4">
          {effectiveStatus === "pending" && (
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Preparing schedule generation…
                </p>
                <p className="text-xs text-muted-foreground">
                  Generating your schedule… This typically takes 10–30 seconds.
                </p>
                {showTimer ? (
                  <p
                    className="text-xs tabular-nums text-muted-foreground"
                    role="status"
                  >
                    Elapsed: {formatElapsed(displayElapsed)}
                  </p>
                ) : null}
              </div>
              <Badge variant="outline">Pending</Badge>
            </div>
          )}

          {effectiveStatus === "running" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Loader2
                  className="mt-0.5 size-5 shrink-0 animate-spin text-amber-600 dark:text-amber-500"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {progressMessage}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Generating your schedule… This typically takes 10–30 seconds.
                  </p>
                  <p
                    className="text-xs tabular-nums text-muted-foreground"
                    role="status"
                  >
                    Elapsed: {formatElapsed(displayElapsed)}
                  </p>
                </div>
                <Badge variant="outline">Running</Badge>
              </div>
              <div
                className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuetext="Schedule generation in progress"
              >
                <div
                  className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-linear-to-r from-amber-400 via-amber-500 to-amber-400 opacity-90"
                  style={{
                    animation: "sousAsyncIndeterminate 1.8s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          )}

          {effectiveStatus === "completed" && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex items-start gap-3"
            >
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Schedule generated successfully!
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressMessage}
                </p>
              </div>
              <Badge variant="success">Done</Badge>
            </motion.div>
          )}

          {effectiveStatus === "infeasible" && (
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  The solver couldn&apos;t find a feasible schedule with the
                  current constraints.
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressMessage}
                </p>
              </div>
              <Badge variant="warning">Infeasible</Badge>
            </div>
          )}

          {(effectiveStatus === "failed" || effectiveStatus === "timed_out") && (
            <div className="flex items-start gap-3">
              {effectiveStatus === "timed_out" ? (
                <Clock
                  className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
              ) : (
                <XCircle
                  className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {effectiveStatus === "timed_out"
                    ? "Schedule generation took too long. Please try again."
                    : "Schedule generation failed. The AI assistant will help you troubleshoot."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressMessage}
                </p>
              </div>
              <Badge variant="destructive">
                {effectiveStatus === "timed_out" ? "Timed out" : "Failed"}
              </Badge>
            </div>
          )}

          {effectiveStatus === "unknown" && (
            <div className="flex items-start gap-3">
              <Loader2
                className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Processing…
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressMessage || "Please wait."}
                </p>
                {showTimer ? (
                  <p
                    className="text-xs tabular-nums text-muted-foreground"
                    role="status"
                  >
                    Elapsed: {formatElapsed(displayElapsed)}
                  </p>
                ) : null}
              </div>
              <Badge variant="outline">Unknown</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
