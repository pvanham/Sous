import { redirect } from "next/navigation";
import type { LocationContext } from "@/lib/auth/get-location-context";
import type { MemberRole } from "@/server/models/OrganizationMember";
import { OrganizationService } from "@/server/services/organization.service";

export type SubscriptionStatus = "active" | "expired" | "free";

/**
 * Roles that may change the roster, time-off decisions, kitchen config,
 * shifts, schedules, and labor requirements. Shift leads are limited to
 * floor approvals (exchanges, skill changes), which gate themselves.
 */
export const MANAGE_ROLES: readonly MemberRole[] = ["owner", "manager"];

/**
 * Action-layer counterpart to `ensureRole`. Server Actions are callable
 * directly, so the dashboard redirects are not a security boundary.
 * Returns a failure response to hand back, or null when allowed.
 */
export function denyUnlessRole(
  ctx: LocationContext,
  allowed: readonly MemberRole[] = MANAGE_ROLES,
): { success: false; error: string } | null {
  if (allowed.includes(ctx.role)) return null;
  return { success: false, error: "You don't have permission to do that." };
}

export function ensureRole(
  ctx: LocationContext,
  allowed: MemberRole[],
  redirectTo = "/dashboard",
): void {
  if (!allowed.includes(ctx.role)) {
    redirect(redirectTo);
  }
}

export async function getSubscriptionStatus(
  orgId: string,
): Promise<SubscriptionStatus> {
  const org = await OrganizationService.getById(orgId);
  if (!org || org.subscriptionTier === "free") {
    return "free";
  }

  const periodEnd = org.currentPeriodEnd ? new Date(org.currentPeriodEnd) : null;
  if (org.cancelAtPeriodEnd && periodEnd && periodEnd < new Date()) {
    return "expired";
  }

  return "active";
}
