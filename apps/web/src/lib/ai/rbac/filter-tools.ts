import type { MemberRole } from "@/server/models/OrganizationMember";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/ai/rbac/permissions";
import type { AIToolDefinition } from "@/lib/ai/tools/tool-registry.types";
import { getToolRegistry } from "@/lib/ai/tools/tool-registry";

/**
 * Returns only the tools whose requiredPermission is granted to the given role.
 * Fail-closed: unknown roles receive an empty array.
 */
export function filterToolsForRole(
  role: MemberRole,
  tools: readonly AIToolDefinition[]
): AIToolDefinition[] {
  if (!(role in ROLE_PERMISSIONS)) {
    console.warn(
      `[RBAC] Unknown role '${role}' — returning empty tool set (fail-closed)`
    );
    return [];
  }

  return tools.filter((tool) => hasPermission(role, tool.requiredPermission));
}

/** Convenience: filters the global registry for a given role */
export function getToolsForRole(role: MemberRole): AIToolDefinition[] {
  return filterToolsForRole(role, getToolRegistry());
}
