import type { IAIUsageLog, AIAction } from "@/server/models/AIUsageLog";

// Re-export for convenience
export type { AIAction };

// ────────────────────────────────────────────────────────────
// Token Usage (shared by openai-client and AIUsageService)
// ────────────────────────────────────────────────────────────

/** Token usage details returned from every OpenAI API call */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
}

// ────────────────────────────────────────────────────────────
// AI Usage Log DTO
// ────────────────────────────────────────────────────────────

/** Clean DTO for AI usage log records (all ObjectIds converted to strings) */
export interface AIUsageLogDTO {
  id: string;
  orgId: string;
  locationId: string;
  clerkUserId: string;
  action: AIAction;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  durationMs: number;
  success: boolean;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Convert a Mongoose AIUsageLog document to a clean DTO */
export function toAIUsageLogDTO(
  doc: IAIUsageLog & { _id: unknown }
): AIUsageLogDTO {
  return {
    id: String(doc._id),
    orgId: String(doc.orgId),
    locationId: String(doc.locationId),
    clerkUserId: doc.clerkUserId,
    action: doc.action,
    modelName: doc.modelName,
    promptTokens: doc.promptTokens,
    completionTokens: doc.completionTokens,
    totalTokens: doc.totalTokens,
    estimatedCostCents: doc.estimatedCostCents,
    durationMs: doc.durationMs,
    success: doc.success,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────
// Usage Summary (returned by getMonthlyUsage)
// ────────────────────────────────────────────────────────────

/** Aggregated usage summary for a billing period */
export interface UsageSummary {
  /** Total tokens consumed across all calls */
  totalTokens: number;
  /** Total estimated cost in cents */
  totalCostCents: number;
  /** Number of schedule generation calls (the primary limited action) */
  generationCount: number;
  /** Monthly generation limit from KitchenConfig */
  limit: number;
  /** Remaining generations allowed this month */
  remaining: number;
}

// ────────────────────────────────────────────────────────────
// Generation Check Result
// ────────────────────────────────────────────────────────────

/** Result of checking whether a location can generate a schedule */
export interface GenerationCheckResult {
  /** Whether the location is allowed to generate */
  allowed: boolean;
  /** Number of generations remaining this month */
  remaining: number;
}

// ────────────────────────────────────────────────────────────
// Log Usage Input (used by the service layer)
// ────────────────────────────────────────────────────────────

/** Input for logging AI usage (metadata beyond token counts) */
export interface AIUsageLogInput {
  modelName: string;
  durationMs: number;
  success: boolean;
  error?: string;
}
