import { redirect } from "next/navigation";
import type { LocationContext } from "@/lib/auth/get-location-context";
import type { MemberRole } from "@/server/models/OrganizationMember";
import { OrganizationService } from "@/server/services/organization.service";

export type SubscriptionStatus = "active" | "expired" | "free";

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
