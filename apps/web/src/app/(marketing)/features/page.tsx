import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Bot,
  Brain,
  Timer,
  Wallet,
  Building2,
  Users
} from "lucide-react";

const features = [
  {
    name: "Google OR-Tools CP-SAT Solver",
    description: "Our backend utilizes an enterprise-grade mathematical solver to compute millions of schedule permutations, ensuring everyone gets fair shifts while meeting kitchen operational demands.",
    icon: Brain,
  },
  {
    name: "One-Click Automation",
    description: "Click \"Generate\" and let the AI do in 10 seconds what usually takes hours. It checks staff availability, time-off requests, and labor rules simultaneously.",
    icon: Bot,
  },
  {
    name: "Labor Margin Control",
    description: "Adjust the weight metric for cost versus employee preference. Dial it towards cost to minimize overtime and save money natively.",
    icon: Wallet,
  },
  {
    name: "Cross-Location Synchronicity",
    description: "Deploy a global schedule or manage per-location. Our context resolver automatically scopes manager views so they only see the kitchens they operate.",
    icon: Building2,
  },
  {
    name: "Robust RBAC Implementation",
    description: "Owners retain god-mode over the organization's billing and topology, while Managers are strictly sandboxed to their assigned stores.",
    icon: Users,
  },
  {
    name: "Live Updates in Real Time",
    description: "Changes made to the schedule highlight instantly. Print it out or have staff log into their own portals (Coming Soon) to check their shifts.",
    icon: Timer,
  },
];

export default function FeaturesPage() {
  return (
    <div className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-stone-500 dark:text-stone-400">The Technology</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-4xl">
            Smarter scheduling powered by Mathematics and AI
          </p>
          <p className="mt-6 text-lg leading-8 text-stone-600 dark:text-stone-300">
            Sous isn&apos;t just a spreadsheet in the browser. It combines custom heuristics with a raw Constraint Programming SAT solver to give you perfect schedules.
          </p>
        </div>
        
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-stone-900 dark:text-white">
                  <feature.icon className="h-5 w-5 flex-none text-stone-500 dark:text-stone-400" aria-hidden="true" />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-stone-600 dark:text-stone-400">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-32 flex justify-center">
          <div className="rounded-3xl bg-stone-900 dark:bg-white/5 py-10 px-6 sm:py-16 sm:px-12 xl:p-20 shadow-2xl border border-stone-800 dark:border-white/10 max-w-4xl text-center w-full">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-6">
              Ready to automate your back of house?
            </h2>
            <Button size="lg" className="bg-white text-stone-900 hover:bg-stone-200" asChild>
              <Link href="/sign-up">Create your free account</Link>
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
