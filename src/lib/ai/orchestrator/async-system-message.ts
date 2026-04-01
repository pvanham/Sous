import type { AsyncTaskType } from "@/types/async-task";

/** Shown when terminal status expects `result` but it is missing or unusable. */
const FALLBACK_RESULT_UNAVAILABLE =
  "[SYSTEM: An async task completed but the result details are unavailable. Please let the user know the task finished and suggest they check the schedule page for details.]";

/**
 * Context for building the loop-back system message after an async task reaches a terminal state.
 */
export interface AsyncTaskCompletionContext {
  /** The terminal status of the task */
  status: "completed" | "infeasible" | "failed" | "timed_out";
  /** The task type */
  taskType: AsyncTaskType;
  /** Result data (for completed/infeasible) */
  result?: {
    solverStatus: string;
    totalCostCents: number;
    solveTimeMs: number;
    fallbackRatesUsed: boolean;
    overtimeWarnings: { staffName: string; hours: number }[];
    totalShiftsGenerated: number;
    totalUnfilledSlots: number;
    summary: string;
    suggestedRelaxations?: string[];
  };
  /** Error data (for failed/timed_out) */
  error?: {
    message: string;
    retryable: boolean;
  };
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Format integer cents as USD (e.g. 420000 → "$4,200.00").
 */
function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatSolveSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "an unknown duration";
  }
  const sec = ms / 1000;
  const rounded = Math.round(sec * 10) / 10;
  return `${rounded} second${rounded === 1 ? "" : "s"}`;
}

function sanitizeLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wrapSystemMessage(lines: string[]): string {
  const body = lines.map(sanitizeLine).filter(Boolean).join(" ");
  return `[SYSTEM: ${body}]`;
}

function taskLabel(taskType: AsyncTaskType): string {
  switch (taskType) {
    case "schedule_generation":
      return "schedule solver";
    default: {
      const _exhaustive: never = taskType;
      return _exhaustive;
    }
  }
}

function isCompleteResult(
  r: AsyncTaskCompletionContext["result"]
): r is NonNullable<AsyncTaskCompletionContext["result"]> {
  return r != null && typeof r === "object";
}

function buildCompletedMessage(ctx: AsyncTaskCompletionContext): string {
  if (!isCompleteResult(ctx.result)) {
    return FALLBACK_RESULT_UNAVAILABLE;
  }

  const r = ctx.result;
  const solverLabel = taskLabel(ctx.taskType);
  const status =
    typeof r.solverStatus === "string" && r.solverStatus.length > 0
      ? r.solverStatus
      : "UNKNOWN";
  const solveMs =
    typeof r.solveTimeMs === "number" && Number.isFinite(r.solveTimeMs)
      ? r.solveTimeMs
      : ctx.elapsedMs;
  const shifts =
    typeof r.totalShiftsGenerated === "number" && Number.isFinite(r.totalShiftsGenerated)
      ? r.totalShiftsGenerated
      : 0;
  const unfilled =
    typeof r.totalUnfilledSlots === "number" && Number.isFinite(r.totalUnfilledSlots)
      ? r.totalUnfilledSlots
      : 0;

  const warnings = Array.isArray(r.overtimeWarnings) ? r.overtimeWarnings : [];
  const overtimeParts = warnings
    .filter((w) => w && typeof w.staffName === "string")
    .map((w) => {
      const hrs =
        typeof w.hours === "number" && Number.isFinite(w.hours)
          ? `${w.hours} hrs`
          : "overtime";
      return `${w.staffName} (${hrs})`;
    });

  const costFormatted = formatCents(
    typeof r.totalCostCents === "number" && Number.isFinite(r.totalCostCents)
      ? r.totalCostCents
      : 0
  );

  const parts: string[] = [
    `The ${solverLabel} completed successfully in ${formatSolveSeconds(solveMs)}.`,
    `Solver status: ${status}.`,
    `Generated ${shifts} shift${shifts === 1 ? "" : "s"}.`,
    `Estimated labor cost: ${costFormatted}.`,
  ];

  if (unfilled > 0) {
    parts.push(`${unfilled} unfilled slot${unfilled === 1 ? "" : "s"}.`);
  }

  if (overtimeParts.length > 0) {
    parts.push(
      `${overtimeParts.length} overtime warning${overtimeParts.length === 1 ? "" : "s"}: ${overtimeParts.join(", ")}.`
    );
  }

  if (r.fallbackRatesUsed === true) {
    parts.push("Some hourly rates used fallback defaults.");
  }

  const summary =
    typeof r.summary === "string" && r.summary.trim().length > 0
      ? r.summary.trim()
      : null;
  if (summary) {
    parts.push(`Summary: ${summary}.`);
  }

  parts.push("The generated schedule is ready for preview.");
  parts.push(
    "Please summarize these results for the user in a natural, conversational tone."
  );

  return wrapSystemMessage(parts);
}

function buildInfeasibleMessage(ctx: AsyncTaskCompletionContext): string {
  if (!isCompleteResult(ctx.result)) {
    return FALLBACK_RESULT_UNAVAILABLE;
  }

  const r = ctx.result;
  const solverLabel = taskLabel(ctx.taskType);
  const summary =
    typeof r.summary === "string" && r.summary.trim().length > 0
      ? r.summary.trim()
      : "No feasible solution was found under the current constraints.";

  const relaxations = Array.isArray(r.suggestedRelaxations)
    ? r.suggestedRelaxations.filter((s) => typeof s === "string" && s.trim().length > 0)
    : [];

  const parts: string[] = [
    `The ${solverLabel} reported an infeasible result: no feasible schedule exists under the current constraints.`,
    "This means the constraints are too restrictive to produce a valid schedule.",
    `${summary}`,
  ];

  if (relaxations.length > 0) {
    const numbered = relaxations.map((s, i) => `${i + 1}) ${s.trim()}`).join(" ");
    parts.push(`Suggested relaxations: ${numbered}.`);
  }

  parts.push(
    "Please empathize with the user and suggest these specific constraint relaxations they could make to allow a schedule to be generated."
  );

  return wrapSystemMessage(parts);
}

function buildFailedMessage(ctx: AsyncTaskCompletionContext): string {
  const msg =
    ctx.error && typeof ctx.error.message === "string" && ctx.error.message.trim().length > 0
      ? ctx.error.message.trim()
      : "An unknown error occurred.";
  const retryable = ctx.error?.retryable === true;

  const solverLabel = taskLabel(ctx.taskType);
  const parts: string[] = [
    `The ${solverLabel} encountered an error: ${msg}.`,
  ];

  if (retryable) {
    parts.push("This issue is retryable.");
    parts.push(
      "Please apologize to the user and suggest trying again in a few minutes."
    );
  } else {
    parts.push(
      "Please apologize to the user and suggest contacting support if the problem continues."
    );
  }

  return wrapSystemMessage(parts);
}

function buildTimedOutMessage(ctx: AsyncTaskCompletionContext): string {
  const solverLabel = taskLabel(ctx.taskType);
  const parts: string[] = [
    `The ${solverLabel} did not finish before the deadline (waited about ${formatSolveSeconds(ctx.elapsedMs)}).`,
    "The task timed out.",
    "Please apologize to the user and suggest trying again in a few minutes.",
  ];

  if (
    ctx.error &&
    typeof ctx.error.message === "string" &&
    ctx.error.message.trim().length > 0
  ) {
    parts.splice(1, 0, `Details: ${ctx.error.message.trim()}.`);
  }

  return wrapSystemMessage(parts);
}

/**
 * Build a system message string that the frontend appends to the chat
 * to wake the LLM and provide async task results.
 *
 * Never includes raw JSON or stack traces — only human-readable summaries.
 * Always ends with a clear instruction for how the LLM should respond.
 */
export function buildAsyncTaskSystemMessage(
  context: AsyncTaskCompletionContext
): string {
  try {
    switch (context.status) {
      case "completed":
        return buildCompletedMessage(context);
      case "infeasible":
        return buildInfeasibleMessage(context);
      case "failed":
        return buildFailedMessage(context);
      case "timed_out":
        return buildTimedOutMessage(context);
      default:
        return FALLBACK_RESULT_UNAVAILABLE;
    }
  } catch {
    return FALLBACK_RESULT_UNAVAILABLE;
  }
}
