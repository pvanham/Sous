import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily-initialized Stripe client.
 * Throws at call-time (not module-evaluation time) so builds
 * succeed even when STRIPE_SECRET_KEY is not yet configured.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to .env.local from the Stripe Dashboard."
      );
    }
    // Must match the API version the installed stripe SDK is pinned to —
    // the v22 types hard-code it, so a mismatch is a compile error rather
    // than a silent runtime drift. Bump both together.
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export type PaidTier = "pro" | "enterprise";

/**
 * The only Stripe prices Sous sells. Read at call time so an unset env var
 * is an empty entry rather than an `"undefined"` key that matches nothing
 * (or, worse, everything mapped through a fallback).
 */
function configuredPrices(): [string, PaidTier][] {
  const entries: [string | undefined, PaidTier][] = [
    [process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID, "pro"],
    [process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID, "enterprise"],
  ];
  return entries.filter((entry): entry is [string, PaidTier] => Boolean(entry[0]));
}

/**
 * Tier for a configured Stripe price id, or null for anything else.
 * Unknown prices must never grant a paid tier.
 */
export function tierForPriceId(priceId: string | null | undefined): PaidTier | null {
  if (!priceId) return null;
  return configuredPrices().find(([id]) => id === priceId)?.[1] ?? null;
}
