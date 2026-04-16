import type { MemberRole } from "@/server/models/OrganizationMember";
import type { AIToolDefinition } from "@/lib/ai/tools/tool-registry.types";
import {
  verifyViewportAccess,
  type VerifiedViewportContext,
} from "@/lib/ai/context/verify-viewport-access";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { getToolsForRole } from "@/lib/ai/rbac/filter-tools";
import { parseViewportContext } from "@/lib/ai/context/viewport";

export interface BuildContextInput {
  /** Clerk user ID from auth() */
  clerkUserId: string;
  /** Raw viewport context JSON from the frontend request body */
  rawViewportContext: unknown;
  /** The user's chat message (passed through, not processed here) */
  userMessage: string;
}

export interface OrchestratorContext {
  /** Authenticated user identity */
  auth: {
    clerkUserId: string;
    orgId: string;
    locationId: string;
    role: MemberRole;
  };
  /** The RBAC-filtered tools this user is allowed to use */
  allowedTools: AIToolDefinition[];
  /** Verified viewport context (safe conversational context) */
  viewport: VerifiedViewportContext;
  /** The original user message */
  userMessage: string;
}

/**
 * Single entry-point that composes all Phase 1 security layers into a
 * ready-to-use context for the LLM orchestrator.
 *
 * 1. Authenticates the user and resolves their LocationContext
 * 2. Filters the tool registry by role (RBAC)
 * 3. Parses and validates the raw viewport payload
 * 4. Verifies the user actually has access to the claimed viewport location
 */
export async function buildOrchestratorContext(
  input: BuildContextInput
): Promise<OrchestratorContext> {
  const { clerkUserId, rawViewportContext, userMessage } = input;

  // 1. Authenticate and resolve org/location/role
  let authContext: Awaited<ReturnType<typeof getLocationContext>>;
  try {
    authContext = await getLocationContext(clerkUserId);
  } catch {
    throw new Error(
      "Authentication failed: Unable to resolve your account. Please refresh and try again."
    );
  }

  // 2. Parse the raw viewport payload (Zod validation)
  let parsedViewport: ReturnType<typeof parseViewportContext>;
  try {
    parsedViewport = parseViewportContext(rawViewportContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid request: ${message}`);
  }

  // 3. RBAC tool filtering and viewport verification run concurrently —
  //    they are independent once auth is resolved.
  const [allowedTools, verifiedViewport] = await Promise.all([
    Promise.resolve(getToolsForRole(authContext.role)),
    verifyViewportAccess({
      clerkUserId,
      viewport: parsedViewport,
      authenticatedContext: authContext,
    }),
  ]);

  return {
    auth: {
      clerkUserId,
      orgId: authContext.orgId,
      locationId: authContext.locationId,
      role: authContext.role,
    },
    allowedTools,
    viewport: verifiedViewport,
    userMessage,
  };
}
