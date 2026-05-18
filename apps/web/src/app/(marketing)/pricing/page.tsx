import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Free",
    id: "tier-free",
    href: "/sign-up",
    priceMonthly: "$0",
    description: "Perfect for single-location mom-and-pop shops starting out.",
    features: [
      "Up to 15 employees",
      "Manual scheduling builder",
      "Basic time-off requests",
      "1 Kitchen Location limit",
      "Community support",
    ],
    featured: false,
    cta: "Start for free",
  },
  {
    name: "Pro",
    id: "tier-pro",
    href: "/sign-up",
    priceMonthly: "$49",
    description: "Ideal for growing restaurants that need AI automation.",
    features: [
      "Up to 50 employees per location",
      "AI Auto-Scheduling CP-SAT solver",
      "Advanced labor cost estimations",
      "Up to 3 Kitchen Locations",
      "Priority email support",
      "Manager role invitations",
    ],
    featured: true,
    cta: "Get Started",
  },
  {
    name: "Enterprise",
    id: "tier-enterprise",
    href: "/sign-up",
    priceMonthly: "$199",
    description: "Unlimited scalability for franchises and restaurant groups.",
    features: [
      "Unlimited employees",
      "Unlimited Kitchen Locations",
      "Custom AI optimization weights",
      "Dedicated account manager",
      "API access",
      "SSO Authentication",
    ],
    featured: false,
    cta: "Contact Sales",
  },
];

export default function PricingPage() {
  return (
    <div className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-stone-500 dark:text-stone-400">Pricing</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            Pricing plans for kitchens of all sizes
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-stone-600 dark:text-stone-300">
          Choose an affordable plan that&apos;s packed with the best scheduling tools for your operation, whether you&apos;re a single cafe or a national franchise.
        </p>
        <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8 lg:items-stretch h-full">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-3xl p-8 ring-1 ring-stone-200 dark:ring-white/10 flex flex-col h-full ${
                tier.featured 
                  ? 'bg-stone-900 text-white shadow-2xl scale-105 z-10' 
                  : 'bg-stone-50 dark:bg-stone-900/50 text-stone-900 dark:text-white dark:hover:bg-stone-900 transition-colors'
              }`}
            >
              <h3
                id={tier.id}
                className={`text-lg font-semibold leading-8 ${tier.featured ? 'text-white' : 'text-stone-900 dark:text-white'}`}
              >
                {tier.name}
              </h3>
              <p className={`mt-4 text-sm leading-6 ${tier.featured ? 'text-stone-300' : 'text-stone-600 dark:text-stone-400'}`}>
                {tier.description}
              </p>
              <p className="mt-6 flex items-baseline gap-x-1">
                <span className={`text-4xl font-bold tracking-tight ${tier.featured ? 'text-white' : 'text-stone-900 dark:text-white'}`}>
                  {tier.priceMonthly}
                </span>
                <span className={`text-sm font-semibold leading-6 ${tier.featured ? 'text-stone-300' : 'text-stone-600 dark:text-stone-400'}`}>
                  /location /month
                </span>
              </p>
              <Button
                asChild
                variant={tier.featured ? "secondary" : "outline"}
                className={`mt-auto w-full ${
                  tier.featured 
                    ? 'bg-white text-stone-900 hover:bg-stone-100' 
                    : 'bg-transparent text-stone-900 dark:text-white hover:bg-stone-100 dark:hover:bg-white/10'
                }`}
              >
                <Link href={tier.href}>{tier.cta}</Link>
              </Button>
              <ul
                role="list"
                className={`mt-8 space-y-3 text-sm leading-6 ${
                  tier.featured ? 'text-stone-300' : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check
                      className={`h-6 w-5 flex-none ${tier.featured ? 'text-white' : 'text-stone-900 dark:text-white'}`}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
