import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ExampleSchedule } from "./_components/ExampleSchedule";

export const metadata: Metadata = {
  title: "Sous — Weekly schedules for restaurant kitchens",
  description:
    "Build a kitchen week by hand, or generate a draft from stations, skills, time off, and hour limits. Review it, edit it, then publish it to your staff.",
};

const FAILURES = [
  {
    title: "Skills live in your head.",
    body: "Maya is the only person on sauté, and she is off Thursday. A grid of names will not catch that. Sous will, because the station is on her profile.",
  },
  {
    title: "Time off lives in a text thread.",
    body: "An approved request should already be a blocked day. On the board it shows as time off, and a generated draft will not schedule over it.",
  },
  {
    title: "Overtime shows up on Monday.",
    body: "Weekly hour caps, and a 10-hour gap between a close and the next open, are limits. A draft that breaks them is not saved.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Set the coverage you actually need.",
    body: "Stations, the hours you are open, and how many people each part of the day needs. That demand is what the week has to cover.",
  },
  {
    n: "02",
    title: "Keep the roster honest.",
    body: "Skills, hourly rates, minimum and maximum hours, days someone would rather work, and days they cannot. Staff request time off in the phone app. A manager approves it.",
  },
  {
    n: "03",
    title: "Draft the week, or place every shift yourself.",
    body: "On Pro, generation returns a draft: a score out of 100, total hours, and warnings when someone lands under their minimum. If the rules cannot be met, Sous says why — a missing skill, too much time off, an hour cap — instead of inventing a shift. On the free plan you build the same board by hand, in three views: by person, by time, and by station.",
  },
  {
    n: "04",
    title: "Publish when you will stand behind it.",
    body: "Change any shift on the draft. Publishing is a separate step, and the floor does not see the week before that. Staff open their shifts on the phone and can propose a swap; a swap waits for a manager. A second restaurant is a second board, not a second tab on the same one.",
  },
];

const WILL_NOT = [
  "Schedule someone on approved time off",
  "Schedule a day they marked unavailable",
  "Put them on a station they are not trained for",
  "Double-book them",
  "Push them past their weekly hour cap",
  "Give them a clopen with under 10 hours between shifts",
];

const TRIES = [
  "Use stations they prefer",
  "Honor days they would rather work",
  "Keep people near their minimum hours",
  "Hold labor cost down, using the rates on the roster",
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "per location / month",
    detail: "One kitchen, built by hand.",
    features: [
      "Up to 15 people",
      "Manual schedule board",
      "Time-off requests",
      "1 kitchen",
    ],
    cta: "Start free",
    href: "/sign-up",
    featured: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "per location / month",
    detail: "The plan that writes the draft.",
    features: [
      "Up to 50 people per location",
      "Generated schedules",
      "Labor cost on the week",
      "Up to 3 kitchens",
      "Manager invitations",
    ],
    cta: "Get started",
    href: "/sign-up",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$199",
    period: "per location / month",
    detail: "For groups with more than three kitchens.",
    features: [
      "Unlimited people",
      "Unlimited kitchens",
      "Custom optimization weights",
      "SSO and API access",
    ],
    cta: "Create an account",
    href: "/sign-up",
    featured: false,
  },
];

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Will a schedule go out before I have seen it?",
    a: "No. A generated week is saved as a draft. Publishing is a separate action. Until you publish, staff do not see that week.",
  },
  {
    q: "What if Saturday grill cannot be covered?",
    a: "Generation tells you the week is not feasible and points at the constraint: not enough people trained on that station, too much approved time off, or the hour cap. You change a rule, move a request, or place the shift yourself. It does not invent a cook.",
  },
  {
    q: "Can I still build the week by hand?",
    a: "Yes. The board has a staff view, a time view, and a day-and-station view. You can add, edit, and remove shifts whether or not you generated the week. The free plan is this board, without generation.",
  },
  {
    q: "Do cooks need an account?",
    a: "Staff use the mobile app for their shifts, time-off requests, and swap proposals. Managers and owners work in the web dashboard. A staff account that opens the dashboard is asked to use the phone app instead.",
  },
  {
    q: "We have two restaurants.",
    a: "Each location has its own roster and its own week. A manager sees the kitchens they are assigned to. An owner can switch locations. The free plan is one kitchen. Pro includes three. Enterprise does not cap locations.",
  },
  {
    q: "Is a chatbot guessing the shifts?",
    a: "The week itself comes from a constraint solver. It searches for an assignment that satisfies your rules, and it either returns one or it reports that it cannot. The chat assistant can ask for a generation or propose other changes, and those proposals wait until you confirm them. Nothing from the chat is written onto a published week on its own.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-14 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-end lg:gap-12 lg:py-20">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
              Kitchen scheduling
            </p>
            <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Fill next week from who can actually work it.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Sous is the board for a restaurant week. Place shifts yourself,
              or generate a draft from your stations, the coverage you need,
              who is trained, and who is already off. You edit it. You publish
              it. The floor does not see it before that.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#how-a-week-gets-made">How a week gets made</Link>
              </Button>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Free is one kitchen, 15 people, and a manual board. Generating a
              draft is $49 per location on Pro.
            </p>
          </div>

          <div className="relative min-w-0">
            <div
              className="absolute -left-3 top-6 hidden h-[calc(100%-3rem)] w-px bg-primary lg:block"
              aria-hidden
            />
            <ExampleSchedule />
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Where weeks fall apart
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              The spreadsheet does not know your line.
            </h2>
          </div>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {FAILURES.map((item, index) => (
              <li key={item.title}>
                <p className="font-mono text-xs text-primary">
                  0{index + 1}
                </p>
                <h3 className="mt-2 text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="how-a-week-gets-made"
        className="scroll-mt-16 border-b border-border"
      >
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              The week, in order
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              How a week gets made.
            </h2>
          </div>
          <ol className="mt-10 divide-y divide-border border-y border-border">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="grid gap-2 py-6 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-8 sm:py-7"
              >
                <p className="font-mono text-sm text-primary">{step.n}</p>
                <div className="max-w-2xl">
                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl border-l-2 border-primary pl-4 text-sm leading-6 text-foreground">
            Generation proposes a draft. It does not publish, and it does not
            get the last word. You do.
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              On a generated week
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Rules the draft is not allowed to break.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              These are the checks that run before a draft is saved. After
              that, the board is yours to edit.
            </p>
          </div>
          <div className="mt-8 grid border border-border sm:grid-cols-2">
            <div className="border-b border-border p-5 sm:border-b-0 sm:border-r sm:p-6">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                It will not
              </h3>
              <ul className="mt-4 space-y-2.5">
                {WILL_NOT.map((rule) => (
                  <li
                    key={rule}
                    className="flex gap-2.5 text-sm leading-6 text-muted-foreground"
                  >
                    <span
                      className="mt-2 h-1 w-1 shrink-0 bg-primary"
                      aria-hidden
                    />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card p-5 sm:p-6">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                It tries to
              </h3>
              <ul className="mt-4 space-y-2.5">
                {TRIES.map((rule) => (
                  <li
                    key={rule}
                    className="flex gap-2.5 text-sm leading-6 text-muted-foreground"
                  >
                    <span
                      className="mt-2 h-1 w-1 shrink-0 bg-foreground/40"
                      aria-hidden
                    />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border" id="pricing">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Pricing
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Start on the free board. Generate weeks when you want them written.
              </h2>
            </div>
            <Link
              href="/pricing"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Full plan comparison
            </Link>
          </div>

          <div className="mt-8 grid gap-px border border-border bg-border md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className="flex flex-col bg-background p-5 sm:p-6"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  {plan.featured ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                      Generates drafts
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono text-3xl tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period}
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.detail}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2 text-sm leading-6 text-foreground"
                    >
                      <Check
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={plan.featured ? "default" : "outline"}
                  asChild
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Before you open an account.
          </h2>
          <div>
            {QUESTIONS.map((item) => (
              <details
                key={item.q}
                className="group border-b border-border py-4 first:border-t"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    className="mt-0.5 inline-block font-mono text-base leading-none text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-end sm:justify-between lg:py-20">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Put this week on the board.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Open a kitchen, add the people who work it, and start with the
              free board. Move to Pro when you want the draft written from
              your rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
