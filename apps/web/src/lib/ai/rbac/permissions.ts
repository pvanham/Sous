import type { MemberRole } from "@/server/models/OrganizationMember";

/** Granular permission identifiers for AI tool access */
export type AIPermission =
  | "schedule:read"
  | "schedule:write"
  | "schedule:generate"
  | "staff:read"
  | "staff:write"
  | "shift:read"
  | "shift:write"
  | "shift:swap"
  | "config:read"
  | "config:write"
  | "cost:read"
  | "cost:write";

/** Maps each MemberRole to its allowed AI permissions */
export const ROLE_PERMISSIONS: Readonly<
  Record<MemberRole, readonly AIPermission[]>
> = Object.freeze({
  owner: Object.freeze([
    "schedule:read",
    "schedule:write",
    "schedule:generate",
    "staff:read",
    "staff:write",
    "shift:read",
    "shift:write",
    "shift:swap",
    "config:read",
    "config:write",
    "cost:read",
    "cost:write",
  ] as const),
  manager: Object.freeze([
    "schedule:read",
    "schedule:write",
    "schedule:generate",
    "staff:read",
    "staff:write",
    "shift:read",
    "shift:write",
    "shift:swap",
    "config:read",
    "cost:read",
  ] as const),
  shift_lead: Object.freeze([
    "schedule:read",
    "staff:read",
    "shift:read",
    "shift:swap",
  ] as const),
  staff: Object.freeze([
    "schedule:read",
    "shift:read",
    "shift:swap",
  ] as const),
});

/**
 * Check if a role has a specific AI permission.
 * Returns false (never throws) for unknown roles to prevent privilege escalation.
 */
export function hasPermission(
  role: MemberRole,
  permission: AIPermission
): boolean {
  const permissions = (ROLE_PERMISSIONS as Record<string, readonly string[]>)[
    role
  ];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}
