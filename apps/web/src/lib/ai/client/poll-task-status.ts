import type { AsyncTaskStatus } from "@/types/async-task";

const MIN_INTERVAL_MS = 2000;
const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_DURATION_MS = 150_000;

const RETRY_BACKOFF_MS = [2000, 4000, 8000] as const;
const MAX_FETCH_RETRIES = 3;

const CLIENT_TIMEOUT_MESSAGE =
  "Schedule generation timed out. Please try again.";

const LOST_CONNECTION_LOG =
  "Lost connection while waiting for schedule generation. Retrying...";

export interface PollTaskStatusOptions {
  /** The task ID to poll */
  taskId: string;
  /** Polling interval in milliseconds (default: 3000, minimum: 2000) */
  intervalMs?: number;
  /** Maximum polling duration before client-side timeout (default: 150000) */
  maxDurationMs?: number;
  /** Callback fired on each poll with the current status */
  onStatusUpdate?: (status: AsyncTaskStatus, elapsedMs: number) => void;
  /** AbortSignal to cancel polling (e.g., when user navigates away) */
  signal?: AbortSignal;
}

export interface PollTaskResult {
  /** The terminal status */
  status: AsyncTaskStatus;
  /** The full status response from the API */
  data: unknown;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

function isTerminalStatus(s: string): s is AsyncTaskStatus {
  return (
    s === "completed" ||
    s === "infeasible" ||
    s === "failed" ||
    s === "timed_out"
  );
}

async function fetchStatusOnce(
  taskId: string,
  signal?: AbortSignal
): Promise<unknown> {
  const res = await fetch(`/api/ai/tasks/${encodeURIComponent(taskId)}/status`, {
    method: "GET",
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Task status request failed: HTTP ${res.status}${text ? ` — ${text}` : ""}`
    );
  }

  return res.json() as Promise<unknown>;
}

/**
 * Poll the task status endpoint until a terminal state is reached.
 * Returns when the task is completed, infeasible, failed, or timed_out.
 */
export async function pollTaskStatus(
  options: PollTaskStatusOptions
): Promise<PollTaskResult> {
  const {
    taskId,
    intervalMs: rawInterval = DEFAULT_INTERVAL_MS,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    onStatusUpdate,
    signal,
  } = options;

  const intervalMs = Math.max(MIN_INTERVAL_MS, rawInterval);
  const startTime = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (Date.now() - startTime >= maxDurationMs) {
      return {
        status: "timed_out",
        data: {
          taskId,
          status: "timed_out" as const,
          error: {
            message: CLIENT_TIMEOUT_MESSAGE,
            retryable: true,
          },
          elapsedMs: Date.now() - startTime,
        },
      };
    }

    let lastError: unknown;
    let json: unknown | undefined;

    for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      try {
        json = await fetchStatusOnce(taskId, signal);
        break;
      } catch (err) {
        lastError = err;
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }
        if (attempt < MAX_FETCH_RETRIES - 1) {
          console.warn(LOST_CONNECTION_LOG);
          const backoff = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          await sleep(backoff, signal);
        }
      }
    }

    if (json === undefined) {
      return {
        status: "failed",
        data: {
          taskId,
          status: "failed" as const,
          error: {
            message:
              lastError instanceof Error
                ? lastError.message
                : "Schedule generation failed while polling.",
            retryable: true,
          },
          elapsedMs: Date.now() - startTime,
        },
      };
    }

    const body = json as Record<string, unknown>;
    const statusRaw = body.status;
    const elapsedMs =
      typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs)
        ? body.elapsedMs
        : Math.max(0, Date.now() - startTime);

    if (typeof statusRaw !== "string") {
      return {
        status: "failed",
        data: {
          taskId,
          status: "failed" as const,
          error: {
            message: "Invalid task status response.",
            retryable: true,
          },
          elapsedMs,
        },
      };
    }

    if (isTerminalStatus(statusRaw)) {
      onStatusUpdate?.(statusRaw, elapsedMs);
      return { status: statusRaw, data: json };
    }

    onStatusUpdate?.(statusRaw as AsyncTaskStatus, elapsedMs);

    const remaining = maxDurationMs - (Date.now() - startTime);
    if (remaining <= 0) {
      return {
        status: "timed_out",
        data: {
          taskId,
          status: "timed_out" as const,
          error: {
            message: CLIENT_TIMEOUT_MESSAGE,
            retryable: true,
          },
          elapsedMs: Date.now() - startTime,
        },
      };
    }

    const wait = Math.min(intervalMs, remaining);
    await sleep(wait, signal);
  }
}
