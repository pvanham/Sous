import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { getWeekStart, parseDateString } from "@/lib/utils/date";
import AsyncTask from "@/server/models/AsyncTask";
import { buildSolverPayload } from "@/server/services/cp-solver.service";
import { SchedulingAgentService } from "@/server/services/ai/scheduling-agent.service";
import type { AsyncTaskDTO } from "@/types/async-task";
import { toAsyncTaskDTO } from "@/types/async-task";

const CP_SOLVER_URL = process.env.CP_SOLVER_URL ?? "http://localhost:8000";
const DISPATCH_TIMEOUT_MS = 5_000;
const TASK_DEADLINE_MS = 180_000;

const LOG_PREFIX = "[AsyncTaskService]";

export interface DispatchScheduleGenerationInput {
  proposalId: string;
  conversationId: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
  scheduleId: string;
  weekStartDate: string;
  templateScheduleId?: string;
}

export interface DispatchResult {
  taskId: string;
  deadline: Date;
  dispatched: boolean;
  error?: string;
}

async function markTaskFailed(
  taskId: Types.ObjectId | string,
  message: string,
): Promise<void> {
  await AsyncTask.findByIdAndUpdate(taskId, {
    $set: {
      status: "failed",
      completedAt: new Date(),
      error: { message },
    },
  });
}

export const AsyncTaskService = {
  /**
   * Create an async task record and dispatch the solver request.
   *
   * Sequence:
   * 1. Build WeekSolverInput via CandidateService/SchedulingAgentService.
   * 2. Create AsyncTask document (status: "pending").
   * 3. POST to Python /solve-async with the payload + taskId.
   * 4. Verify 202 Accepted response.
   * 5. Return { dispatched: true, taskId, deadline }.
   *
   * The solver stores results in-memory. Node polls GET /jobs/:taskId
   * to retrieve results and writes them back to MongoDB.
   */
  async dispatchScheduleGeneration(
    input: DispatchScheduleGenerationInput,
  ): Promise<DispatchResult> {
    await dbConnect();

    const weekStart = getWeekStart(
      /^\d{4}-\d{2}-\d{2}$/.test(input.weekStartDate)
        ? parseDateString(input.weekStartDate)
        : new Date(input.weekStartDate),
    );
    let context;
    try {
      context = await SchedulingAgentService.buildSchedulingContext(
        input.orgId,
        input.locationId,
        input.clerkUserId,
        weekStart,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        dispatched: false,
        taskId: "",
        deadline: new Date(),
        error: `Failed to build scheduling context: ${msg}`,
      };
    }

    let weekSolverInput;
    try {
      weekSolverInput =
        await SchedulingAgentService.buildWeekSolverInput(context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        dispatched: false,
        taskId: "",
        deadline: new Date(),
        error: `Failed to build solver input: ${msg}`,
      };
    }

    const solverPayload = buildSolverPayload(weekSolverInput);
    const inputPayload: Record<string, unknown> = { ...solverPayload };
    if (input.templateScheduleId) {
      inputPayload.templateScheduleId = input.templateScheduleId;
    }

    const deadline = new Date(Date.now() + TASK_DEADLINE_MS);

    let taskDoc;
    try {
      taskDoc = await AsyncTask.create({
        taskType: "schedule_generation",
        status: "pending",
        conversationId: input.conversationId,
        proposalId: input.proposalId,
        orgId: new Types.ObjectId(input.orgId),
        locationId: new Types.ObjectId(input.locationId),
        clerkUserId: input.clerkUserId,
        inputPayload,
        scheduleId: input.scheduleId,
        weekStartDate: input.weekStartDate,
        deadline,
        dispatchedAt: null,
        completedAt: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        dispatched: false,
        taskId: "",
        deadline: new Date(),
        error: `Failed to create async task: ${msg}`,
      };
    }

    const taskIdStr = String(taskDoc._id);

    const body = JSON.stringify({
      ...solverPayload,
      taskId: taskIdStr,
    });

    const url = `${CP_SOLVER_URL}/solve-async`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markTaskFailed(taskDoc._id, `Failed to reach solver service: ${msg}`);
      return {
        dispatched: false,
        taskId: taskIdStr,
        deadline,
        error: `Failed to reach solver service: ${msg}`,
      };
    }

    if (response.status !== 202) {
      const text = await response.text().catch(() => "");
      const errMsg = `Solver rejected the async job: HTTP ${response.status} — ${text.slice(0, 500)}`;
      console.error(`${LOG_PREFIX} ${errMsg}`);
      await markTaskFailed(taskDoc._id, errMsg);
      return {
        dispatched: false,
        taskId: taskIdStr,
        deadline,
        error: errMsg,
      };
    }

    return {
      dispatched: true,
      taskId: taskIdStr,
      deadline,
    };
  },

  /**
   * Get the current status of an async task.
   * Returns null if not found or not owned by the user.
   */
  async getTaskStatus(
    taskId: string,
    orgId: string,
    clerkUserId: string,
  ): Promise<AsyncTaskDTO | null> {
    if (!Types.ObjectId.isValid(taskId) || !Types.ObjectId.isValid(orgId)) {
      return null;
    }

    await dbConnect();

    const doc = await AsyncTask.findOne({
      _id: new Types.ObjectId(taskId),
      orgId: new Types.ObjectId(orgId),
      clerkUserId,
    }).lean();

    if (!doc) {
      return null;
    }

    return toAsyncTaskDTO(
      doc as unknown as Parameters<typeof toAsyncTaskDTO>[0],
    );
  },
};
