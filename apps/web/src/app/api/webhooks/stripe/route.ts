import { getStripe } from "@/lib/stripe";
import { dbConnect } from "@/lib/db";
import { OrganizationService } from "@/server/services/organization.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { NotificationEvents } from "@/server/services/notification-events";
import type Stripe from "stripe";

/**
 * Look up every owner-role member of an org. Used to deliver
 * `billing_alerts` (subscription state changes) only to people with
 * the authority to manage payment. Best-effort: returns `[]` on
 * failure so the webhook never throws because of a notification miss.
 */
async function getOwnerClerkUserIds(orgId: string): Promise<string[]> {
  try {
    const members = await OrganizationMemberService.listByOrgId(orgId);
    return members.filter((m) => m.role === "owner").map((m) => m.clerkUserId);
  } catch (err) {
    console.error("[Stripe] Failed to look up owners for billing alert:", err);
    return [];
  }
}

/**
 * Maps Stripe price IDs to subscription tiers.
 * Update these values after creating products in the Stripe Dashboard.
 */
const PRICE_TO_TIER: Record<string, "pro" | "enterprise"> = {
  [process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID!]: "pro",
  [process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID!]: "enterprise",
};

function getTierFromPriceId(priceId: string): "pro" | "enterprise" {
  return PRICE_TO_TIER[priceId] || "pro";
}

/**
 * Cancel all other active subscriptions for a customer except the given one.
 * This ensures only one subscription exists at a time.
 */
async function cancelOtherSubscriptions(customerId: string, keepSubId: string) {
  const subs = await getStripe().subscriptions.list({
    customer: customerId,
    status: "active",
  });

  for (const sub of subs.data) {
    if (sub.id !== keepSubId) {
      await getStripe().subscriptions.cancel(sub.id);
      console.log(`[Stripe] Canceled stale subscription ${sub.id} (keeping ${keepSubId})`);
    }
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  await dbConnect();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId;

      if (orgId && session.subscription) {
        // Retrieve the subscription to get the price ID
        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : "pro";
        const customerId = session.customer as string;

        // Safety net: cancel any other active subscriptions for this customer
        await cancelOtherSubscriptions(customerId, subscription.id);

        await OrganizationService.updateSubscription(orgId, {
          stripeSubscriptionId: subscription.id,
          subscriptionTier: tier,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000)
            : null,
        });
        console.log(`[Stripe] Org ${orgId} upgraded to ${tier}`);

        const ownerClerkUserIds = await getOwnerClerkUserIds(orgId);
        void NotificationEvents.billingAlert({
          ownerClerkUserIds,
          orgId,
          title: `You're on Sous ${tier}`,
          body: `Your subscription is active. Manage billing or change plans any time from the dashboard.`,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Find org by stripe customer ID
      const customer = await getStripe().customers.retrieve(customerId);
      const orgId = (customer as Stripe.Customer).metadata?.orgId;

      if (orgId) {
        // Check if there are other active subscriptions before downgrading to free
        const activeSubs = await getStripe().subscriptions.list({
          customer: customerId,
          status: "active",
        });

        if (activeSubs.data.length > 0) {
          // There's still an active subscription — update to its tier instead
          const remainingSub = activeSubs.data[0];
          const priceId = remainingSub.items.data[0]?.price?.id;
          const tier = priceId ? getTierFromPriceId(priceId) : "pro";

          await OrganizationService.updateSubscription(orgId, {
            stripeSubscriptionId: remainingSub.id,
            subscriptionTier: tier,
            cancelAtPeriodEnd: remainingSub.cancel_at_period_end || remainingSub.cancel_at !== null,
            currentPeriodEnd: remainingSub.items.data[0]?.current_period_end
              ? new Date(remainingSub.items.data[0].current_period_end * 1000)
              : null,
          });
          console.log(`[Stripe] Org ${orgId} still has active sub ${remainingSub.id}, updated to ${tier}`);
        } else {
          // No active subscriptions left — downgrade to free
          await OrganizationService.updateSubscription(orgId, {
            subscriptionTier: "free",
            stripeSubscriptionId: null,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
          });
          console.log(`[Stripe] Org ${orgId} downgraded to free`);

          const ownerClerkUserIds = await getOwnerClerkUserIds(orgId);
          void NotificationEvents.billingAlert({
            ownerClerkUserIds,
            orgId,
            title: "Your Sous subscription ended",
            body: "Your team is back on the free plan. Resubscribe to restore paid features.",
          });
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const customer = await getStripe().customers.retrieve(customerId);
      const orgId = (customer as Stripe.Customer).metadata?.orgId;

      if (orgId) {
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : "pro";

        if (subscription.status === "active") {
          const willCancel =
            subscription.cancel_at_period_end || subscription.cancel_at !== null;
          await OrganizationService.updateSubscription(orgId, {
            stripeSubscriptionId: subscription.id,
            subscriptionTier: tier,
            cancelAtPeriodEnd: willCancel,
            currentPeriodEnd: subscription.items.data[0]?.current_period_end
              ? new Date(subscription.items.data[0].current_period_end * 1000)
              : null,
          });
          console.log(`[Stripe] Org ${orgId} subscription updated to ${tier}`);

          // Only emit a billing notification when the cancel-at-period-end
          // flag flips on; routine renewals shouldn't spam owners.
          if (willCancel) {
            const ownerClerkUserIds = await getOwnerClerkUserIds(orgId);
            void NotificationEvents.billingAlert({
              ownerClerkUserIds,
              orgId,
              title: "Subscription set to cancel",
              body: "Your Sous subscription will end at the close of the current billing period.",
            });
          }
        } else if (
          subscription.status === "past_due" ||
          subscription.status === "unpaid"
        ) {
          const ownerClerkUserIds = await getOwnerClerkUserIds(orgId);
          void NotificationEvents.billingAlert({
            ownerClerkUserIds,
            orgId,
            title: "Payment issue on your Sous subscription",
            body: "We weren't able to charge your card. Update payment details to keep your team's access.",
          });
        }
      }
      break;
    }

    default:
      // Unhandled event type — log and move on
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }

  return Response.json({ received: true });
}
