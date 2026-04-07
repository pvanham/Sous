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
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}
