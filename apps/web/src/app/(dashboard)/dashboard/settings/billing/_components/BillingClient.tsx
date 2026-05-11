"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
  Crown,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface BillingClientProps {
  currentTier: "free" | "pro" | "enterprise";
  hasStripeCustomer: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null; // ISO string from server
}

const plans = [
  {
    tier: "free" as const,
    name: "Free",
    price: "$0",
    description: "For single-location shops starting out.",
    features: [
      "Up to 15 employees",
      "Manual scheduling builder",
      "Basic time-off requests",
      "1 Kitchen Location",
      "Community support",
    ],
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "$49",
    description: "AI automation for growing restaurants.",
    features: [
      "Up to 50 employees per location",
      "AI Auto-Scheduling (CP-SAT)",
      "Advanced labor cost estimations",
      "Up to 3 Kitchen Locations",
      "Priority email support",
      "Manager role invitations",
    ],
    featured: true,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "",
  },
  {
    tier: "enterprise" as const,
    name: "Enterprise",
    price: "$199",
    description: "Unlimited scalability for franchises.",
    features: [
      "Unlimited employees",
      "Unlimited Kitchen Locations",
      "Custom AI optimization weights",
      "Dedicated account manager",
      "API access",
      "SSO Authentication",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID || "",
  },
];

const tierDescriptions: Record<string, string> = {
  free: "You're on the Free plan. Upgrade to unlock AI scheduling and multi-location support.",
  pro: "You're on the Pro plan with AI-powered scheduling and priority support.",
  enterprise: "You're on the Enterprise plan with unlimited scalability.",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function BillingClient({
  currentTier,
  hasStripeCustomer,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: BillingClientProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const handleUpgrade = async (priceId: string) => {
    if (!priceId) {
      toast.error("Stripe Price ID not configured. Check your environment variables.");
      return;
    }
    setLoading(priceId);
    try {
      const response = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await response.json();
      if (data.url) {
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to create checkout session.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading("portal");
    try {
      const response = await fetch("/api/billing/create-portal", {
        method: "POST",
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to open billing portal.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const currentPlanName = plans.find((p) => p.tier === currentTier)?.name ?? currentTier;

  return (
    <div className="space-y-8">
      {/* Success / Canceled banners */}
      {success && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
            🎉 Your subscription has been updated successfully!
          </p>
        </div>
      )}
      {canceled && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            Checkout was canceled. No changes were made to your subscription.
          </p>
        </div>
      )}

      {/* Cancellation warning banner */}
      {cancelAtPeriodEnd && currentPeriodEnd && (
        <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-none mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              Your {currentPlanName} subscription is set to cancel
            </p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              You&apos;ll retain access to {currentPlanName} features until{" "}
              <strong>{formatDate(currentPeriodEnd)}</strong>, after which
              you&apos;ll be downgraded to the Free plan. You can resubscribe at
              any time.
            </p>
          </div>
        </div>
      )}

      {/* Current plan summary */}
      <div className="rounded-xl border border-stone-200 dark:border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Current plan</p>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold tracking-tight">
                {currentPlanName}
              </h2>
              {currentTier !== "free" && (
                <Sparkles className="h-5 w-5 text-amber-500" />
              )}
              {cancelAtPeriodEnd && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                  Canceling
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {tierDescriptions[currentTier]}
            </p>

            {/* Billing cycle info — always shown for paid plans */}
            {currentTier !== "free" && currentPeriodEnd && !cancelAtPeriodEnd && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>
                  Current billing period ends{" "}
                  <strong className="text-foreground font-medium">
                    {formatDate(currentPeriodEnd)}
                  </strong>
                </span>
              </div>
            )}
          </div>
          {currentTier !== "free" && hasStripeCustomer && (
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={loading === "portal"}
            >
              {loading === "portal" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Manage Subscription
            </Button>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const tierOrder = { free: 0, pro: 1, enterprise: 2 } as const;
            const isUpgrade = tierOrder[plan.tier] > tierOrder[currentTier];
            const isDowngrade = tierOrder[plan.tier] < tierOrder[currentTier];

            return (
              <div
                key={plan.tier}
                className={`rounded-xl p-6 border flex flex-col transition-shadow ${
                  plan.featured
                    ? "border-amber-500/50 dark:border-amber-600/50 bg-stone-50 dark:bg-stone-900/50 shadow-lg"
                    : "border-stone-200 dark:border-white/10"
                } ${isCurrent ? "ring-2 ring-amber-600 dark:ring-amber-500" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {plan.featured && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          Popular
                        </span>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {plan.description}
                  </p>
                  <p className="mb-6">
                    <span className="text-3xl font-bold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /location /month
                    </span>
                  </p>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="h-4 w-4 mt-0.5 flex-none text-emerald-600 dark:text-emerald-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action button — always present */}
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : isUpgrade && "priceId" in plan && plan.priceId ? (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.priceId!)}
                    disabled={loading === plan.priceId}
                  >
                    {loading === plan.priceId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Upgrade to {plan.name}
                  </Button>
                ) : isDowngrade && "priceId" in plan && plan.priceId ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleUpgrade(plan.priceId!)}
                    disabled={loading === plan.priceId}
                  >
                    {loading === plan.priceId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Downgrade to {plan.name}
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    variant="outline"
                    className="w-full text-muted-foreground"
                    onClick={handleManageSubscription}
                    disabled={loading === "portal"}
                  >
                    {loading === "portal" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Cancel via Portal
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="w-full text-muted-foreground">
                    —
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
