import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { dbConnect } from "@/lib/db";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { OrganizationService } from "@/server/services/organization.service";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  // Resolve org from user's membership
  const membership = await OrganizationMemberService.getFirstByUserId(userId);
  if (!membership || membership.role !== "owner") {
    return Response.json({ error: "Only owners can manage billing" }, { status: 403 });
  }

  const org = await OrganizationService.getById(membership.orgId);
  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const { priceId } = await req.json();
  if (!priceId) {
    return Response.json({ error: "priceId is required" }, { status: 400 });
  }

  // Get or create Stripe customer
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      metadata: { orgId: org.id, clerkUserId: userId },
    });
    customerId = customer.id;
    await OrganizationService.updateSubscription(org.id, {
      stripeCustomerId: customerId,
    });
  }

  // If the org already has an active subscription, SWAP the price
  // instead of creating a new checkout session (prevents stacking)
  if (org.stripeSubscriptionId) {
    try {
      const existingSub = await getStripe().subscriptions.retrieve(
        org.stripeSubscriptionId
      );

      // Only swap if the subscription is still active/trialing
      if (existingSub.status === "active" || existingSub.status === "trialing") {
        const existingItem = existingSub.items.data[0];
        if (!existingItem) {
          return Response.json({ error: "No subscription item found" }, { status: 400 });
        }

        // Update the subscription to the new price
        await getStripe().subscriptions.update(org.stripeSubscriptionId, {
          items: [
            {
              id: existingItem.id,
              price: priceId,
            },
          ],
          // If the sub was set to cancel, un-cancel it on upgrade
          cancel_at_period_end: false,
          cancel_at: "",
          proration_behavior: "create_prorations",
        });

        console.log(`[Stripe] Org ${org.id} swapped subscription price to ${priceId}`);

        // The webhook will handle updating the tier in MongoDB
        // Return the billing page URL (no checkout needed)
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        const host = req.headers.get("host") || "localhost:3000";
        const baseUrl = process.env.NEXT_PUBLIC_URL || `${protocol}://${host}`;
        return Response.json({ url: `${baseUrl}/dashboard/settings/billing?success=true` });
      }
    } catch (err) {
      // If retrieving the subscription fails (e.g. it was deleted),
      // fall through to create a new checkout session
      console.warn("[Stripe] Failed to retrieve existing subscription, creating new checkout:", err);
    }
  }

  // No active subscription — create a new Checkout Session
  // (needed to collect payment info for the first time)
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  const baseUrl = process.env.NEXT_PUBLIC_URL || `${protocol}://${host}`;

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/settings/billing?success=true`,
    cancel_url: `${baseUrl}/dashboard/settings/billing?canceled=true`,
    metadata: { orgId: org.id },
  });

  return Response.json({ url: session.url });
}
