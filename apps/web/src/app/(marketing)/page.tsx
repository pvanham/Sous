import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AssistantCalloutDemo } from "./_components/AssistantCalloutDemo";

export const metadata: Metadata = {
  title: "Sous — Weekly schedules for restaurant kitchens",
  description:
    "On Pro, Sous generates a kitchen week from stations, skills, time off, and hour limits. The assistant can ask for that draft. You confirm it, then you publish it.",
};

const PROOFS = [
  "Hard rules, or it does not save a draft",
  "A score, the hours, and the labor cost",
  "You approve it. Publishing is separate",
];

const WILL_NOT = [
  "Approved time off",
  "A day marked unavailable",
  "A station they are not trained for",
  "A double book",
  "A weekly hour cap",
  "A clopen under 10 hours",
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
      "Generated schedules",
      "Scheduling assistant",
      "Labor cost on the week",
      "Up to 50 people per location",
      "Up to 3 kitchens",
    ],
    cta: "Get Pro",
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
    q: "Is a chatbot guessing the shifts?",
    a: "No. The week comes from a constraint solver. It searches for an assignment that satisfies your rules, and it either returns one or it reports that it cannot. The assistant can ask for a generation or propose another change. Those proposals wait until you approve them. Nothing from the chat is written onto a published week on its own.",
  },
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
];

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12 lg:py-20">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
              Optimized scheduling
            </p>
            <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Generate the week. Publish it when you mean it.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              On Pro, a constraint solver drafts the line from your stations,
              who is trained, who is off, and how many hours they can work.
              The assistant can ask for that draft. You approve it. The floor
              does not see the week until you publish.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#generation">How a draft gets made</Link>
              </Button>
            </div>
            <ul className="mt-6 space-y-2">
              {PROOFS.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-sm leading-6 text-foreground"
                >
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Free is one kitchen and a manual board. Generating a draft is
              $49 per location on Pro.
            </p>
          </div>

          <figure className="min-w-0">
            <Image
              src="/images/marketing/schedule-board.png"
              alt="The Sous schedule board in dark mode. A draft week in staff view, with station-colored shifts, a time-off day, and the week's hours and labor cost."
              width={1345}
              height={759}
              priority
              sizes="(min-width: 1024px) 720px, 100vw"
              className="h-auto w-full rounded border border-border"
            />
            <figcaption className="mt-3 text-sm leading-6 text-muted-foreground">
              Staff view of an example draft. Names and hours are illustrative.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="generation" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              On Pro
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Two ways the week gets written. Neither one publishes it.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article className="flex flex-col border border-border bg-card p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
                01 · Generation
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">
                A solver searches for a week that can actually run.
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                It covers the stations you asked for, using people trained on
                them, and it refuses a shift that breaks a hard rule. You get
                a score out of 100, total hours, labor cost from the rates on
                the roster, and a warning when someone lands under their
                minimum. If the week cannot be covered, Sous says why instead
                of inventing a cook.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-px border border-border bg-border">
                <ExampleStat label="Score" value="91" note="out of 100" />
                <ExampleStat label="Hours" value="137" note="on the week" />
                <ExampleStat label="Labor" value="$2,816" note="at roster rates" />
              </div>
              <p className="mt-3 text-sm text-primary">
                Example only. Sam Patel is under the weekly minimum.
              </p>
            </article>

            <article className="flex flex-col border border-border bg-[#1c1917] p-5 text-[#e7e5e4] sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-400">
                02 · Assistant
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">
                Someone calls out. You pick the cover.
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#a8a29e]">
                Tell it who can&apos;t make a shift. It suggests people who can
                take the station without breaking a skill or an hour cap. The
                one you choose comes back as a card. The shift does not move
                until you approve it.
              </p>
              <AssistantCalloutDemo />
            </article>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:py-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              After the draft
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              The board is still yours.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Change any shift. Switch between staff, time, and station. When
              you publish, staff open their shifts on the phone and can
              propose a swap. A swap waits for a manager. A second restaurant
              is a second board.
            </p>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              <li>
                <p className="font-mono text-xs text-primary">01</p>
                <h3 className="mt-2 text-sm font-semibold">Edit the draft</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Add, move, or remove a shift on the same board you would
                  have built by hand.
                </p>
              </li>
              <li>
                <p className="font-mono text-xs text-primary">02</p>
                <h3 className="mt-2 text-sm font-semibold">Publish on purpose</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Until that step, the week is not on the floor.
                </p>
              </li>
              <li>
                <p className="font-mono text-xs text-primary">03</p>
                <h3 className="mt-2 text-sm font-semibold">Time off is already in</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Staff request it in the phone app. An approval blocks the day.
                </p>
              </li>
            </ol>
          </div>
          <Image
            src="/images/marketing/kitchen-pass.jpg"
            alt="A quiet kitchen pass before service, with plates on a stainless shelf."
            width={1600}
            height={1200}
            sizes="(min-width: 1024px) 352px, 100vw"
            className="aspect-[4/3] h-auto w-full rounded border border-border object-cover"
          />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Before a draft is saved
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              It will not schedule someone into
            </h2>
          </div>
          <ul className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2">
            {WILL_NOT.map((rule) => (
              <li
                key={rule}
                className="flex items-baseline gap-3 text-base text-foreground"
              >
                <span
                  className="mt-[0.55em] h-1.5 w-1.5 shrink-0 bg-primary"
                  aria-hidden
                />
                {rule}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">When it can, it favors </span>
            stations they prefer, days they would rather work, hours near their
            minimum, and a lower labor cost from the rates on the roster. After
            the draft is saved, the board is yours to edit.
          </p>
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
                Start on the free board. Generate weeks on Pro.
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
                className={
                  plan.featured
                    ? "flex flex-col bg-card p-5 sm:p-6"
                    : "flex flex-col bg-background p-5 sm:p-6"
                }
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  {plan.featured ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                      Writes the draft
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono text-3xl tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground">{plan.period}</span>
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
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-16 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-12 lg:py-20">
          <div className="max-w-xl lg:order-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Put this week on the board.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Open a kitchen and start with the free board. Move to Pro when
              you want the solver to write the draft, and the assistant ready
              when you ask for one.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
          <Image
            src="/images/marketing/morning-prep.jpg"
            alt="Morning prep on a wooden board, with herbs and a knife."
            width={1600}
            height={1200}
            sizes="(min-width: 1024px) 352px, 100vw"
            className="order-2 aspect-[4/3] h-auto w-full rounded border border-border object-cover lg:order-1"
          />
        </div>
      </section>
    </div>
  );
}

function ExampleStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-background px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
