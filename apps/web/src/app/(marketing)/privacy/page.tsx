import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Sous",
  description:
    "How Sous collects, uses, stores, and protects your data across the Sous web dashboard and mobile app.",
};

const LAST_UPDATED = "June 10, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-10 text-base leading-7 text-stone-600 dark:text-stone-300">
          <section>
            <p>
              Sous, Inc. (&quot;Sous,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) provides kitchen staff scheduling software through
              our web dashboard and mobile app (together, the
              &quot;Service&quot;). This Privacy Policy explains what information
              we collect, how we use it, and the choices you have. It applies to
              both the web application and the Sous mobile app distributed
              through the Apple App Store and Google Play Store.
            </p>
          </section>

          <Section title="Information we collect">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Account information.</strong> Your name, email address,
                and password are managed by our authentication provider (Clerk).
                We never store your raw password.
              </li>
              <li>
                <strong>Workforce data.</strong> Your role, location, scheduled
                shifts, availability, time-off requests, station preferences, and
                shift-exchange activity, so we can show you the right schedule.
              </li>
              <li>
                <strong>Profile content.</strong> An optional profile photo, your
                phone number, and address if you choose to add them.
              </li>
              <li>
                <strong>Device &amp; notification data.</strong> A push
                notification token (when you opt in) so we can deliver schedule
                alerts, and basic device information needed to run the app.
              </li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <ul className="list-disc space-y-2 pl-6">
              <li>To provide, maintain, and operate the Service.</li>
              <li>To generate and display schedules, rosters, and shift changes.</li>
              <li>
                To send operational notifications you have opted into (e.g.
                published schedules, shift offers, announcements).
              </li>
              <li>To secure your account and prevent abuse.</li>
            </ul>
            <p className="mt-4">
              We do <strong>not</strong> sell your personal information, and we do
              not use third-party advertising or cross-app tracking SDKs.
            </p>
          </Section>

          <Section title="How your information is shared">
            <p>
              Your schedule and profile information is visible to authorized
              managers and coworkers within your organization, as needed to run
              the kitchen. We share data with the service providers that power
              Sous, including Clerk (authentication), MongoDB Atlas (database),
              and Expo (push notification delivery). These providers process data
              only on our behalf. We may also disclose information when required
              by law.
            </p>
          </Section>

          <Section title="Data retention &amp; account deletion">
            <p>
              You can permanently delete your account at any time directly from
              the mobile app under <strong>Settings &rarr; Delete account</strong>,
              or from the web dashboard. Deleting your account removes your login
              credentials and unlinks your personal profile data. We retain only
              the records we are legally required to keep, or that are necessary
              to operate your employer&apos;s organization (for example,
              historical staffing records owned by your employer).
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use industry-standard safeguards, including encryption in
              transit, scoped access controls, and secure credential storage on
              your device (the mobile app stores session tokens in the platform
              keychain / keystore). No method of transmission or storage is
              perfectly secure, but we work to protect your information.
            </p>
          </Section>

          <Section title="Children's privacy">
            <p>
              Sous is a workplace tool intended for use by adults. It is not
              directed to children under 13, and we do not knowingly collect
              their information.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Depending on where you live, you may have rights to access,
              correct, export, or delete your personal information. You can
              exercise most of these directly in the app, or contact us using the
              details below.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we
              will revise the &quot;Last updated&quot; date above and, where
              appropriate, notify you in the app.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or your data? Email us at{" "}
              <a
                href="mailto:privacy@sous.app"
                className="font-medium text-stone-900 underline dark:text-white"
              >
                privacy@sous.app
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
