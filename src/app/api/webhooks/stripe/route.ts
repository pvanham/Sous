import { getStripe } from "@/lib/stripe";
import { dbConnect } from "@/lib/db";
import { OrganizationService } from "@/server/services/organization.service";
import type Stripe from "stripe";

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
          await OrganizationService.updateSubscription(orgId, {
            stripeSubscriptionId: subscription.id,
            subscriptionTier: tier,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
            currentPeriodEnd: subscription.items.data[0]?.current_period_end
              ? new Date(subscription.items.data[0].current_period_end * 1000)
              : null,
          });
          console.log(`[Stripe] Org ${orgId} subscription updated to ${tier}`);
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
