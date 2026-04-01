/**
 * Async task lifecycle types for long-running solver jobs (Phase 4).
 * Domain shapes live here; Mongoose model is in `src/server/models/AsyncTask.ts`.
 */

export type AsyncTaskStatus =
  | "pending" // Task created, not yet dispatched
  | "running" // Dispatched to solver, awaiting result
  | "completed" // Solver returned a successful result
  | "failed" // Solver returned an error or crashed
  | "infeasible" // Solver returned INFEASIBLE status
  | "timed_out"; // No response within the deadline

export type AsyncTaskType = "schedule_generation";

export interface AsyncTaskResult {
  /** Solver status string (e.g., "OPTIMAL", "FEASIBLE") */
  solverStatus: string;
  /** Objective function value */
  objectiveValue: number;
  /** Solver execution time in milliseconds */
  solveTimeMs: number;
  /** Total estimated labor cost in cents */
  totalCostCents: number;
  /** Whether fallback hourly rates were used */
  fallbackRatesUsed: boolean;
  /** Overtime summary: staffId → total overtime hours */
  overtimeSummary: Record<string, number>;
  /** The generated schedule data (GeneratedDaySchedule[]); stored as Mixed, typed on extraction */
  generatedDays: unknown[];
  /** Human-readable summary for the LLM */
  summary: string;
}

export interface AsyncTaskError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Mongoose document shape (ObjectId fields are unknown until converted).
 */
export interface IAsyncTask {
  taskType: AsyncTaskType;
  status: AsyncTaskStatus;
  conversationId: string;
  proposalId: string;
  orgId: unknown;
  locationId: unknown;
  clerkUserId: string;
  /** Input payload sent to the solver (serialized WeekSolverInput subset); not for frontend */
  inputPayload: Record<string, unknown>;
  scheduleId: string;
  weekStartDate: string;
  result?: AsyncTaskResult;
  error?: AsyncTaskError;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  /** Hard deadline for the task (used for timeout detection) */
  deadline: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO returned from the service layer (without Mongoose internals).
 * Omits `inputPayload` — must not be exposed to the client.
 */
export interface AsyncTaskDTO {
  id: string;
  taskType: AsyncTaskType;
  status: AsyncTaskStatus;
  conversationId: string;
  proposalId: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
  scheduleId: string;
  weekStartDate: string;
  result?: AsyncTaskResult;
  error?: AsyncTaskError;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  deadline: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toAsyncTaskDTO(
  doc: IAsyncTask & { _id: unknown }
): AsyncTaskDTO {
  return {
    id: String(doc._id),
    taskType: doc.taskType,
    status: doc.status,
    conversationId: doc.conversationId,
    proposalId: doc.proposalId,
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    clerkUserId: doc.clerkUserId,
    scheduleId: doc.scheduleId,
    weekStartDate: doc.weekStartDate,
    result: doc.result,
    error: doc.error,
    dispatchedAt: doc.dispatchedAt,
    completedAt: doc.completedAt,
    deadline: doc.deadline,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
