import OpenAI from "openai";
import type { AIAction } from "@/server/models/AIUsageLog";
import type { TokenUsage } from "@/types/ai-usage";
import { AIUsageService } from "@/server/services/ai-usage.service";

// ────────────────────────────────────────────────────────────
// Custom Error Classes
// ────────────────────────────────────────────────────────────

/**
 * Thrown when a location has exceeded its monthly AI generation limit.
 * Sprint 3.7 will catch this to invoke the algorithmic fallback.
 */
export class AILimitExceededError extends Error {
  public readonly remaining: number;

  constructor(remaining: number) {
    super(
      `AI generation limit exceeded. ${remaining} generations remaining this month. ` +
        "Schedule will be created using basic assignment (AI unavailable)."
    );
    this.name = "AILimitExceededError";
    this.remaining = remaining;
  }
}

/**
 * Thrown when OpenAI is unavailable after all retries (rate limited, service down, etc.).
 * Sprint 3.7 will catch this to invoke the algorithmic fallback.
 */
export class AIServiceUnavailableError extends Error {
  public readonly statusCode: number | undefined;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    statusCode?: number,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = "AIServiceUnavailableError";
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

// ────────────────────────────────────────────────────────────
// Model Pricing (cents per 1K tokens)
// ────────────────────────────────────────────────────────────

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

/** Approximate pricing in cents per 1K tokens (updated as of Feb 2025) */
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPer1k: 0.25, outputPer1k: 1.0 },
  "gpt-4o-mini": { inputPer1k: 0.015, outputPer1k: 0.06 },
  "gpt-4-turbo": { inputPer1k: 1.0, outputPer1k: 3.0 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1k: 0.25, outputPer1k: 1.0 };

/**
 * Estimate cost in cents based on token usage and model pricing.
 */
function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (promptTokens / 1000) * pricing.inputPer1k;
  const outputCost = (completionTokens / 1000) * pricing.outputPer1k;
  return Math.round((inputCost + outputCost) * 100) / 100; // Round to 2 decimal places
}

// ────────────────────────────────────────────────────────────
// OpenAI Singleton
// ────────────────────────────────────────────────────────────

let openaiInstance: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set in environment variables. " +
          "Please add it to your .env.local file."
      );
    }
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

// ────────────────────────────────────────────────────────────
// Retry Logic
// ────────────────────────────────────────────────────────────

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

/** Maximum number of retry attempts */
const MAX_RETRIES = 1;

/** Base delay in milliseconds for exponential backoff */
const BASE_DELAY_MS = 1000;

/**
 * Check if an error is retryable (transient OpenAI failures).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────
// Token Usage Extraction
// ────────────────────────────────────────────────────────────

/**
 * Extract token usage from an OpenAI chat completion response.
 */
function extractTokenUsage(
  response: OpenAI.Chat.Completions.ChatCompletion,
  model: string
): TokenUsage {
  const usage = response.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? 0;
  const estimatedCostCents = estimateCost(model, promptTokens, completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostCents,
  };
}

// ────────────────────────────────────────────────────────────
// Usage Logging Helper
// ────────────────────────────────────────────────────────────

interface UsageTrackingOptions {
  /** Organization ID (required for usage tracking) */
  orgId: string;
  /** Location ID (required for usage tracking) */
  locationId: string;
  /** Clerk user ID who triggered the call */
  clerkUserId: string;
  /** Type of AI action being performed */
  action: AIAction;
}

/**
 * Log usage and optionally check limits before making a call.
 * This is an internal helper — not exported.
 */
async function checkLimitsIfTracked(
  tracking?: UsageTrackingOptions
): Promise<void> {
  if (!tracking) return;

  // Only enforce limits for schedule_generation actions
  if (tracking.action === "schedule_generation") {
    const check = await AIUsageService.canGenerate(
      tracking.orgId,
      tracking.locationId
    );
    if (!check.allowed) {
      throw new AILimitExceededError(check.remaining);
    }
  }
}

/**
 * Log usage after a call completes (success or failure).
 */
async function logUsageIfTracked(
  tracking: UsageTrackingOptions | undefined,
  usage: TokenUsage,
  modelName: string,
  durationMs: number,
  success: boolean,
  error?: string
): Promise<void> {
  if (!tracking) return;

  try {
    await AIUsageService.logUsage(
      tracking.orgId,
      tracking.locationId,
      tracking.clerkUserId,
      tracking.action,
      usage,
      { modelName, durationMs, success, error }
    );
  } catch (logError) {
    // Usage logging should never block the main flow
    console.error("[OpenAI Client] Failed to log AI usage:", logError);
  }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/** Options for generateCompletion */
export interface CompletionOptions {
  /** Model to use (default: "gpt-4o") */
  model?: string;
  /** Temperature for response randomness (default: 0.7) */
  temperature?: number;
  /** Maximum tokens in the response (default: 2000) */
  maxTokens?: number;
  /** Optional usage tracking configuration */
  tracking?: UsageTrackingOptions;
}

/** Options for generateJSON */
export interface JSONOptions {
  /** Model to use (default: "gpt-4o") */
  model?: string;
  /** Temperature for response randomness (default: 0.3, lower for structured output) */
  temperature?: number;
  /** Maximum tokens in the response (default: 4000) */
  maxTokens?: number;
  /** Optional usage tracking configuration */
  tracking?: UsageTrackingOptions;
}

/**
 * Generate a text completion from OpenAI.
 *
 * Features:
 * - Automatic retry with exponential backoff on transient errors (429, 500, 502, 503)
 * - Token usage extraction from every response
 * - Optional usage tracking and limit enforcement
 *
 * @param systemPrompt - System message setting the AI's behavior
 * @param userPrompt - User message with the actual request
 * @param options - Configuration options (model, temperature, tracking, etc.)
 * @returns Object containing the response content and token usage
 * @throws {AILimitExceededError} If the location has exceeded its monthly generation limit
 * @throws {AIServiceUnavailableError} If OpenAI is unavailable after all retries
 */
export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: CompletionOptions
): Promise<{ content: string; usage: TokenUsage }> {
  const model = options?.model ?? "gpt-4o";
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 2000;

  // Check limits before making the API call
  await checkLimitsIfTracked(options?.tracking);

  const client = getOpenAIClient();
  let lastError: unknown;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      });

      const durationMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content ?? "";
      const usage = extractTokenUsage(response, model);

      // Log successful usage
      await logUsageIfTracked(
        options?.tracking,
        usage,
        model,
        durationMs,
        true
      );

      return { content, usage };
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        break;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  // All retries exhausted or non-retryable error
  const durationMs = Date.now() - startTime;
  const errorMessage =
    lastError instanceof Error ? lastError.message : "Unknown OpenAI error";
  const statusCode =
    lastError instanceof OpenAI.APIError ? lastError.status : undefined;

  // Log the failed attempt
  const emptyUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
  };
  await logUsageIfTracked(
    options?.tracking,
    emptyUsage,
    model,
    durationMs,
    false,
    errorMessage
  );

  // Re-throw limit errors as-is
  if (lastError instanceof AILimitExceededError) {
    throw lastError;
  }

  throw new AIServiceUnavailableError(
    `OpenAI API call failed after ${MAX_RETRIES + 1} attempts: ${errorMessage}`,
    statusCode,
    isRetryableError(lastError)
  );
}

/**
 * Generate a JSON-structured response from OpenAI.
 *
 * Uses `response_format: { type: "json_object" }` to ensure valid JSON output.
 * The system prompt MUST instruct the model to respond in JSON format.
 *
 * Features:
 * - JSON mode for guaranteed valid JSON
 * - Automatic retry with exponential backoff on transient errors
 * - Token usage extraction and cost estimation
 * - Optional usage tracking and limit enforcement
 *
 * @param systemPrompt - System message (MUST mention JSON output format)
 * @param userPrompt - User message with the actual request
 * @param options - Configuration options (model, temperature, tracking, etc.)
 * @returns Object containing the parsed JSON data and token usage
 * @throws {AILimitExceededError} If the location has exceeded its monthly generation limit
 * @throws {AIServiceUnavailableError} If OpenAI is unavailable after all retries
 */
export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: JSONOptions
): Promise<{ data: T; usage: TokenUsage }> {
  const model = options?.model ?? "gpt-4o";
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 4000;

  // Check limits before making the API call
  await checkLimitsIfTracked(options?.tracking);

  const client = getOpenAIClient();
  let lastError: unknown;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      });

      const durationMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content ?? "{}";
      const usage = extractTokenUsage(response, model);

      // Parse JSON response
      let data: T;
      try {
        data = JSON.parse(content) as T;
      } catch (parseError) {
        const parseErrorMessage =
          parseError instanceof Error
            ? parseError.message
            : "JSON parse failed";

        // Log the parse failure
        await logUsageIfTracked(
          options?.tracking,
          usage,
          model,
          durationMs,
          false,
          `JSON parse error: ${parseErrorMessage}`
        );

        throw new AIServiceUnavailableError(
          `Failed to parse OpenAI JSON response: ${parseErrorMessage}`,
          undefined,
          false
        );
      }

      // Log successful usage
      await logUsageIfTracked(
        options?.tracking,
        usage,
        model,
        durationMs,
        true
      );

      return { data, usage };
    } catch (error) {
      lastError = error;

      // Don't retry parse errors or limit errors
      if (
        error instanceof AIServiceUnavailableError ||
        error instanceof AILimitExceededError
      ) {
        throw error;
      }

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        break;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  // All retries exhausted or non-retryable error
  const durationMs = Date.now() - startTime;
  const errorMessage =
    lastError instanceof Error ? lastError.message : "Unknown OpenAI error";
  const statusCode =
    lastError instanceof OpenAI.APIError ? lastError.status : undefined;

  // Log the failed attempt
  const emptyUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
  };
  await logUsageIfTracked(
    options?.tracking,
    emptyUsage,
    model,
    durationMs,
    false,
    errorMessage
  );

  throw new AIServiceUnavailableError(
    `OpenAI API call failed after ${MAX_RETRIES + 1} attempts: ${errorMessage}`,
    statusCode,
    isRetryableError(lastError)
  );
}
