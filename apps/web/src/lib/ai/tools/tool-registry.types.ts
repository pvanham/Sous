import { z } from "zod";
import type { AIPermission } from "@/lib/ai/rbac/permissions";
import type { MemberRole } from "@/server/models/OrganizationMember";

export interface AIToolDefinition<TParams extends z.ZodType = z.ZodType> {
  /** Unique tool identifier (matches the function_call name sent to the LLM) */
  name: string;
  /** Human-readable description passed to the LLM */
  description: string;
  /** The AIPermission required to include this tool in the LLM context */
  requiredPermission: AIPermission;
  /** Zod schema for parameter validation */
  parameters: TParams;
  /**
   * Execution handler — Phase 2 will implement these.
   * Accepts validated params + a context object and returns a JSON result.
   */
  execute?: (
    params: z.infer<TParams>,
    context: ToolExecutionContext
  ) => Promise<unknown>;
}

export interface ToolExecutionContext {
  orgId: string;
  locationId: string;
  clerkUserId: string;
  role: MemberRole;
  conversationId?: string;
  timezone: string;
}

/** Type-safe factory that captures the Zod generic so execute params are inferred correctly. */
export function defineTool<TParams extends z.ZodType>(
  def: AIToolDefinition<TParams>
): AIToolDefinition {
  return def as AIToolDefinition;
}
