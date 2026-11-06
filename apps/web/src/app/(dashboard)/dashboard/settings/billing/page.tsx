import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { OrganizationService } from "@/server/services/organization.service";
import { getStripe, tierForPriceId, type PaidTier } from "@/lib/stripe";
import { dbConnect } from "@/lib/db";
import { BillingClient } from "./_components/BillingClient";

const TIER_ORDER: Record<string, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export default async function BillingSettingsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);

  if (ctx.role !== "owner") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-2">
            Only Organization Owners can manage billing and subscriptions.
          </p>
        </div>
      </div>
    );
  }

  await dbConnect();
  const org = await OrganizationService.getById(ctx.orgId);

  if (!org) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-2">Organization not found.</p>
        </div>
      </div>
    );
  }

  // Default values from MongoDB
  let currentTier = org.subscriptionTier;
  let cancelAtPeriodEnd = org.cancelAtPeriodEnd ?? false;
  let currentPeriodEnd = org.currentPeriodEnd;

  // Fetch ALL active subscriptions from Stripe for this customer
  // This ensures the billing page always matches reality, even if
  // the user has multiple subscriptions (edge case from legacy bug)
  if (org.stripeCustomerId) {
    try {
      const allSubs = await getStripe().subscriptions.list({
        customer: org.stripeCustomerId,
        status: "active",
      });

      // Only subscriptions on a configured price count toward a paid
      // tier; an unknown price is treated as no subscription.
      let best: { sub: (typeof allSubs.data)[number]; tier: PaidTier } | null = null;
      for (const sub of allSubs.data) {
        const tier = tierForPriceId(sub.items.data[0]?.price?.id);
        if (!tier) {
          console.warn("[Billing] Ignoring subscription with an unconfigured price", {
            orgId: org.id,
            subscriptionId: sub.id,
          });
          continue;
        }
        if (!best || TIER_ORDER[tier] > TIER_ORDER[best.tier]) {
          best = { sub, tier };
        }
      }

      if (best) {
        const { sub: bestSub, tier: bestTier } = best;

        currentTier = bestTier;
        cancelAtPeriodEnd =
          bestSub.cancel_at_period_end || bestSub.cancel_at !== null;

        const periodEnd = bestSub.cancel_at
          ?? bestSub.items.data[0]?.current_period_end;
        currentPeriodEnd = periodEnd
          ? new Date(periodEnd * 1000)
          : currentPeriodEnd;

        // Sync back to MongoDB if it drifted
        if (
          currentTier !== org.subscriptionTier ||
          cancelAtPeriodEnd !== org.cancelAtPeriodEnd ||
          bestSub.id !== org.stripeSubscriptionId
        ) {
          await OrganizationService.updateSubscription(org.id, {
            stripeSubscriptionId: bestSub.id,
            subscriptionTier: currentTier,
            cancelAtPeriodEnd,
            currentPeriodEnd,
          });
        }
      } else if (allSubs.data.length === 0) {
        // No active subscriptions in Stripe — ensure we show Free. Active
        // subscriptions on unconfigured prices leave the stored tier alone
        // so a missing price env var can't downgrade paying orgs here.
        if (org.subscriptionTier !== "free" || org.stripeSubscriptionId) {
          currentTier = "free";
          cancelAtPeriodEnd = false;
          currentPeriodEnd = undefined;
          await OrganizationService.updateSubscription(org.id, {
            subscriptionTier: "free",
            stripeSubscriptionId: null,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
          });
        }
      }
    } catch (err) {
      console.error("[Billing] Failed to fetch subscriptions from Stripe:", err);
      // Fall back to MongoDB values (already set above)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>
      <BillingClient
        currentTier={currentTier}
        hasStripeCustomer={!!org.stripeCustomerId}
        cancelAtPeriodEnd={cancelAtPeriodEnd}
        currentPeriodEnd={currentPeriodEnd ? currentPeriodEnd.toISOString() : null}
      />
    </div>
  );
}
