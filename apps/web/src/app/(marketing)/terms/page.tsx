import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Sous",
  description:
    "The terms and conditions that govern your use of the Sous web dashboard and mobile app.",
};

const LAST_UPDATED = "June 10, 2026";

export default function TermsOfServicePage() {
  return (
    <div className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-10 text-base leading-7 text-stone-600 dark:text-stone-300">
          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and
              use of the Sous web dashboard and mobile app (together, the
              &quot;Service&quot;) provided by Sous, Inc. By creating an account
              or using the Service, you agree to these Terms.
            </p>
          </section>

          <Section title="Accounts">
            <p>
              Sous is a business tool. Staff accounts are typically created by
              invitation from an employer. You are responsible for keeping your
              login credentials secure and for all activity under your account.
              You must be at least 18 years old, or the age of majority in your
              jurisdiction, to use the Service.
            </p>
          </Section>

          <Section title="Acceptable use">
            <ul className="list-disc space-y-2 pl-6">
              <li>Do not use the Service for any unlawful purpose.</li>
              <li>
                Do not attempt to access data belonging to organizations or users
                you are not authorized to access.
              </li>
              <li>
                Do not interfere with, disrupt, or attempt to reverse-engineer the
                Service.
              </li>
            </ul>
          </Section>

          <Section title="Subscriptions &amp; billing">
            <p>
              Paid plans are billed to the organization owner through our web
              dashboard. Pricing and plan details are described on our pricing
              page. Fees are non-refundable except where required by law.
            </p>
          </Section>

          <Section title="Your content">
            <p>
              You retain ownership of the data you submit. You grant Sous the
              limited rights necessary to host, process, and display that data to
              operate the Service for you and your organization.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You may stop using the Service and delete your account at any time
              from within the app or web dashboard. We may suspend or terminate
              access if these Terms are violated.
            </p>
          </Section>

          <Section title="Disclaimers &amp; limitation of liability">
            <p>
              The Service is provided &quot;as is&quot; without warranties of any
              kind. To the maximum extent permitted by law, Sous is not liable for
              indirect, incidental, or consequential damages arising from your use
              of the Service.
            </p>
          </Section>

          <Section title="Changes to these terms">
            <p>
              We may update these Terms from time to time. Material changes will
              be reflected by updating the &quot;Last updated&quot; date above and,
              where appropriate, by notice in the app.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about these Terms? Email us at{" "}
              <a
                href="mailto:support@sous.app"
                className="font-medium text-stone-900 underline dark:text-white"
              >
                support@sous.app
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-stone-900 dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}
