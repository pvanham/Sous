import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { analyzeInfeasibility } from "@/lib/ai/orchestrator/infeasibility-analyzer";
import AsyncTask from "@/server/models/AsyncTask";
import { AsyncTaskService } from "@/server/services/async-task.service";
import { StaffService } from "@/server/services/staff.service";
import { NotificationEvents } from "@/server/services/notification-events";
import type {
  AsyncTaskConstraintRelaxationSuggestion,
  AsyncTaskDTO,
} from "@/types/async-task";

const CP_SOLVER_URL = process.env.CP_SOLVER_URL ?? "http://localhost:8000";
const SOLVER_POLL_TIMEOUT_MS = 3_000;
const RETRY_AFTER_SECONDS = "2";

/** Error codes that indicate the client should not retry the same operation blindly */
const NON_RETRYABLE_ERROR_CODES = new Set([
  "invalid_request",
  "validation_failed",
  "invalid_proposal",
]);

function formatTotalCost(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function aggregateGeneratedDaysMetrics(generatedDays: unknown[]): {
  totalShiftsGenerated: number;
  totalUnfilledSlots: number;
} {
  let totalShifts = 0;
  let totalUnfilled = 0;
  for (const day of generatedDays) {
    if (day && typeof day === "object") {
      const d = day as Record<string, unknown>;
      const assignments = Array.isArray(d.assignments) ? d.assignments : [];
      const unfilled = Array.isArray(d.unfilledSlots) ? d.unfilledSlots : [];
      totalShifts += assignments.length;
      totalUnfilled += unfilled.length;
    }
  }
  return {
    totalShiftsGenerated: totalShifts,
    totalUnfilledSlots: totalUnfilled,
  };
}

function computeElapsedMs(task: AsyncTaskDTO): number {
  const start = task.dispatchedAt ?? task.createdAt;
  return Math.max(0, Date.now() - new Date(start).getTime());
}

function isRetryable(
  status: "failed" | "timed_out",
  error?: { code?: string }
): boolean {
  if (status === "timed_out") return true;
  if (error?.code && NON_RETRYABLE_ERROR_CODES.has(error.code)) {
    return false;
  }
  return true;
}

const GENERIC_INFEASIBILITY_SUGGESTION: AsyncTaskConstraintRelaxationSuggestion =
  {
    priority: 99,
    category: "staffing",
    suggestion:
      "The solver could not find a feasible solution. Please review your constraints and try again.",
    currentValue: "Current scheduling rules",
    recommendedValue: "Slightly relaxed constraints in one or more areas",
  };

function hasCachedInfeasibilityAnalysis(
  suggestedRelaxations: AsyncTaskConstraintRelaxationSuggestion[] | undefined
): boolean {
  return Array.isArray(suggestedRelaxations) && suggestedRelaxations.length > 0;
}

// ── Solver polling helpers ────────────────────────────────

interface SolverJobResponse {
  status: string;
  result?: Record<string, unknown>;
  error?: { message: string };
}

async function fetchSolverJobStatus(
  taskId: string,
): Promise<SolverJobResponse | null> {
  try {
    const res = await fetch(`${CP_SOLVER_URL}/jobs/${taskId}`, {
      signal: AbortSignal.timeout(SOLVER_POLL_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as SolverJobResponse;
  } catch {
    return null;
  }
}

async function writeSolverResultToTask(
  taskId: string,
  solverJob: SolverJobResponse,
): Promise<void> {
  const now = new Date();
  const update: Record<string, unknown> = {
    status: solverJob.status,
    completedAt: now,
    updatedAt: now,
  };
  if (solverJob.result) {
    update.result = solverJob.result;
  }
  if (solverJob.error) {
    update.error = solverJob.error;
  }
  await AsyncTask.findByIdAndUpdate(taskId, { $set: update });
}

function deleteSolverJob(taskId: string): void {
  fetch(`${CP_SOLVER_URL}/jobs/${taskId}`, { method: "DELETE" }).catch(
    () => {},
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let orgId: string;
  let locationId: string;
  try {
    const ctx = await getLocationContext(userId);
    orgId = ctx.orgId;
    locationId = ctx.locationId;
  } catch {
    return NextResponse.json(
      { error: "Unable to resolve organization context." },
      { status: 403 }
    );
  }

  const { taskId } = await params;

  const task = await AsyncTaskService.getTaskStatus(taskId, orgId, userId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const now = new Date();

  // Lazy timeout: transition overdue pending/running tasks to timed_out
  if (
    (task.status === "pending" || task.status === "running") &&
    new Date(task.deadline) < now
  ) {
    await dbConnect();
    await AsyncTask.findByIdAndUpdate(taskId, {
      $set: { status: "timed_out", completedAt: new Date() },
    });

    void NotificationEvents.scheduleGenerationDone({
      initiatorClerkUserId: task.clerkUserId,
      orgId,
      locationId,
      success: false,
      detail: "Schedule generation timed out before completion. Please try again.",
    });

    const elapsedMs = computeElapsedMs(task);
    return NextResponse.json({
      taskId: task.id,
      status: "timed_out" as const,
      error: {
        message:
          "Schedule generation timed out before completion. Please try again.",
        retryable: true,
      },
      elapsedMs,
    });
  }

  let elapsedMs = computeElapsedMs(task);
  let currentTask = task;

  // Poll the solver's in-memory job store for progress when the DB still says pending/running
  if (currentTask.status === "pending" || currentTask.status === "running") {
    await dbConnect();
    const solverJob = await fetchSolverJobStatus(taskId);

    if (
      solverJob &&
      solverJob.status !== "pending" &&
      solverJob.status !== "running"
    ) {
      await writeSolverResultToTask(taskId, solverJob);
      deleteSolverJob(taskId);

      const updated = await AsyncTaskService.getTaskStatus(
        taskId,
        orgId,
        userId,
      );
      if (updated) {
        currentTask = updated;
        elapsedMs = computeElapsedMs(currentTask);
      }

      // Fire the per-user "your async job finished" notification once,
      // at the moment we transition out of pending/running. The mobile
      // app uses the push to deep-link the initiator back to the
      // schedule when they're not actively watching the chat.
      const success = solverJob.status === "completed";
      void NotificationEvents.scheduleGenerationDone({
        initiatorClerkUserId: userId,
        orgId,
        locationId,
        success,
        detail: success
          ? "Your generated schedule draft is ready to review."
          : solverJob.status === "infeasible"
            ? "We couldn't find a feasible schedule with the current constraints."
            : solverJob.error?.message ??
              "Schedule generation didn't complete. Please try again.",
      });
    } else if (
      solverJob?.status === "running" &&
      currentTask.status === "pending"
    ) {
      await AsyncTask.findByIdAndUpdate(taskId, {
        $set: { status: "running", dispatchedAt: new Date() },
      });
      currentTask = { ...currentTask, status: "running" };
    }
  }

  if (currentTask.status === "pending" || currentTask.status === "running") {
    const headers = new Headers();
    headers.set("Retry-After", RETRY_AFTER_SECONDS);
    return NextResponse.json(
      {
        taskId: currentTask.id,
        status: currentTask.status,
        elapsedMs,
        deadline: new Date(currentTask.deadline).toISOString(),
      },
      { headers }
    );
  }

  if (currentTask.status === "completed") {
    const result = currentTask.result;
    if (!result) {
      return NextResponse.json({
        taskId: currentTask.id,
        status: "completed" as const,
        elapsedMs,
        result: {
          solverStatus: "UNKNOWN",
          totalCostCents: 0,
          totalCostFormatted: formatTotalCost(0),
          solveTimeMs: 0,
          fallbackRatesUsed: false,
          summary: "Schedule generation completed but result details were unavailable.",
          totalShiftsGenerated: 0,
          totalUnfilledSlots: 0,
          overtimeWarnings: [],
        },
      });
    }

    const { totalShiftsGenerated, totalUnfilledSlots } =
      aggregateGeneratedDaysMetrics(result.generatedDays ?? []);

    let staffNameById = new Map<string, string>();
    try {
      const staffList = await StaffService.list(orgId, locationId);
      staffNameById = new Map(staffList.map((s) => [s.id, s.name]));
    } catch {
      staffNameById = new Map();
    }

    const overtimeWarnings = Object.entries(result.overtimeSummary ?? {}).map(
      ([staffId, hours]) => ({
        staffName: staffNameById.get(staffId) ?? staffId,
        hours,
      })
    );

    return NextResponse.json({
      taskId: currentTask.id,
      status: "completed" as const,
      elapsedMs,
      result: {
        solverStatus: result.solverStatus,
        totalCostCents: result.totalCostCents,
        totalCostFormatted: formatTotalCost(result.totalCostCents),
        solveTimeMs: result.solveTimeMs,
        fallbackRatesUsed: result.fallbackRatesUsed,
        summary: result.summary,
        totalShiftsGenerated,
        totalUnfilledSlots,
        overtimeWarnings,
      },
    });
  }

  if (currentTask.status === "infeasible") {
    const summary =
      currentTask.result?.summary ??
      "The solver could not find a feasible schedule with the current constraints.";

    let suggestedRelaxations: AsyncTaskConstraintRelaxationSuggestion[] =
      currentTask.result?.suggestedRelaxations ?? [];
    let likelyCauses: string[] = currentTask.result?.likelyCauses ?? [];

    if (!hasCachedInfeasibilityAnalysis(suggestedRelaxations)) {
      await dbConnect();
      try {
        const raw = await AsyncTask.findOne({
          _id: new Types.ObjectId(taskId),
          orgId: new Types.ObjectId(orgId),
          clerkUserId: userId,
        }).lean();

        const inputPayload = raw?.inputPayload;
        if (inputPayload && typeof inputPayload === "object" && !Array.isArray(inputPayload)) {
          const analysis = await analyzeInfeasibility({
            inputPayload: inputPayload as Record<string, unknown>,
            orgId,
            locationId,
          });
          suggestedRelaxations = analysis.suggestedRelaxations.map((s) => ({
            priority: s.priority,
            category: s.category,
            suggestion: s.suggestion,
            currentValue: s.currentValue,
            recommendedValue: s.recommendedValue,
          }));
          likelyCauses = analysis.likelyCauses;
        } else {
          suggestedRelaxations = [GENERIC_INFEASIBILITY_SUGGESTION];
          likelyCauses = [];
        }

        await AsyncTask.findByIdAndUpdate(taskId, {
          $set: {
            "result.suggestedRelaxations": suggestedRelaxations,
            "result.likelyCauses": likelyCauses,
          },
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.warn(
          `[AsyncTask] Infeasibility analysis failed, storing generic suggestion: ${msg}`
        );
        suggestedRelaxations = [GENERIC_INFEASIBILITY_SUGGESTION];
        likelyCauses = [];
        try {
          await AsyncTask.findByIdAndUpdate(taskId, {
            $set: {
              "result.suggestedRelaxations": suggestedRelaxations,
              "result.likelyCauses": likelyCauses,
            },
          });
        } catch {
          /* non-blocking */
        }
      }
    }

    return NextResponse.json({
      taskId: currentTask.id,
      status: "infeasible" as const,
      elapsedMs,
      result: {
        summary,
        suggestedRelaxations,
        likelyCauses,
      },
    });
  }

  if (currentTask.status === "failed" || currentTask.status === "timed_out") {
    const message =
      currentTask.status === "timed_out"
        ? "Schedule generation timed out before completion. Please try again."
        : currentTask.error?.message ?? "Schedule generation failed.";

    return NextResponse.json({
      taskId: currentTask.id,
      status: currentTask.status,
      error: {
        message,
        retryable: isRetryable(currentTask.status, currentTask.error),
      },
      elapsedMs,
    });
  }

  // Exhaustive fallback (unknown status)
  return NextResponse.json({
    taskId: currentTask.id,
    status: currentTask.status,
    elapsedMs,
    error: {
      message: "Unknown task status.",
      retryable: true,
    },
  });
}
