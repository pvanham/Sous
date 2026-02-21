import { Types } from "mongoose";
import AIUsageLog from "@/server/models/AIUsageLog";
import type { AIAction } from "@/server/models/AIUsageLog";
import { toAIUsageLogDTO } from "@/types/ai-usage";
import type {
  AIUsageLogDTO,
  TokenUsage,
  UsageSummary,
  GenerationCheckResult,
  AIUsageLogInput,
} from "@/types/ai-usage";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";

/** Default monthly generation limit if KitchenConfig has no aiSettings */
const DEFAULT_MONTHLY_GENERATION_LIMIT = 1000;

/**
 * AIUsageService - Service layer for AI usage tracking and limit enforcement.
 *
 * This is the ONLY place that imports the AIUsageLog Mongoose model.
 * All data is scoped by (orgId, locationId) for multi-tenancy.
 * Returns DTOs only — never raw Mongoose documents.
 */
export const AIUsageService = {
  /**
   * Log an AI usage event.
   * Called after every OpenAI API call (success or failure) to track costs.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param clerkUserId - Clerk user ID who triggered the call
   * @param action - Type of AI action performed
   * @param usage - Token usage details from the API response
   * @param meta - Additional metadata (model, duration, success/error)
   * @returns The created AIUsageLogDTO
   */
  async logUsage(
    orgId: string,
    locationId: string,
    clerkUserId: string,
    action: AIAction,
    usage: TokenUsage,
    meta: AIUsageLogInput
  ): Promise<AIUsageLogDTO> {
    const doc = await AIUsageLog.create({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      clerkUserId,
      action,
      modelName: meta.modelName,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostCents: usage.estimatedCostCents,
      durationMs: meta.durationMs,
      success: meta.success,
      error: meta.error,
    });

    return toAIUsageLogDTO(doc);
  },

  /**
   * Get aggregated usage summary for the current calendar month.
   * Counts only schedule_generation actions toward the generation limit.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns UsageSummary with totals and limit info
   */
  async getMonthlyUsage(
    orgId: string,
    locationId: string
  ): Promise<UsageSummary> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const orgObjectId = new Types.ObjectId(orgId);
    const locationObjectId = new Types.ObjectId(locationId);

    // Aggregate total tokens and cost for the current month
    const [totals] = await AIUsageLog.aggregate<{
      totalTokens: number;
      totalCostCents: number;
      generationCount: number;
    }>([
      {
        $match: {
          orgId: orgObjectId,
          locationId: locationObjectId,
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: "$totalTokens" },
          totalCostCents: { $sum: "$estimatedCostCents" },
          generationCount: {
            $sum: {
              $cond: [
                { $eq: ["$action", "schedule_generation"] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    // Fetch the monthly generation limit from KitchenConfig
    const config = await KitchenConfigService.getByLocation(orgId, locationId);
    const limit =
      config?.aiSettings?.monthlyGenerationLimit ??
      DEFAULT_MONTHLY_GENERATION_LIMIT;

    const generationCount = totals?.generationCount ?? 0;

    return {
      totalTokens: totals?.totalTokens ?? 0,
      totalCostCents: totals?.totalCostCents ?? 0,
      generationCount,
      limit,
      remaining: Math.max(0, limit - generationCount),
    };
  },

  /**
   * Check whether a location is allowed to generate a schedule.
   * Compares the current month's generation count against the configured limit.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Whether generation is allowed and how many remain
   */
  async canGenerate(
    orgId: string,
    locationId: string
  ): Promise<GenerationCheckResult> {
    const summary = await this.getMonthlyUsage(orgId, locationId);

    return {
      allowed: summary.remaining > 0,
      remaining: summary.remaining,
    };
  },

  /**
   * Get usage history for a date range.
   * Useful for admin dashboards and detailed cost analysis.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @param startDate - Start of date range (inclusive)
   * @param endDate - End of date range (inclusive)
   * @returns Array of AIUsageLogDTOs in reverse chronological order
   */
  async getUsageHistory(
    orgId: string,
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AIUsageLogDTO[]> {
    const docs = await AIUsageLog.find({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: -1 })
      .lean();

    return docs.map(toAIUsageLogDTO);
  },

  /**
   * Delete all usage logs for a location.
   * Used primarily for testing/cleanup.
   *
   * @param orgId - Organization ID
   * @param locationId - Location ID
   * @returns Number of deleted documents
   */
  async deleteAllByLocation(
    orgId: string,
    locationId: string
  ): Promise<number> {
    const result = await AIUsageLog.deleteMany({
      orgId: new Types.ObjectId(orgId),
      locationId: new Types.ObjectId(locationId),
    });
    return result.deletedCount;
  },
};
