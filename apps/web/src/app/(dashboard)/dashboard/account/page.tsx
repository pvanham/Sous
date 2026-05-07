import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AccountSettingsTabs } from "./_components/AccountSettingsTabs";

/**
 * Personal account settings — name, email, password, MFA, sessions,
 * appearance, and account deletion.
 *
 * Lives outside `/dashboard/settings/*` because that tree is
 * org-centric and gated to owner/manager roles. This page is for any
 * signed-in dashboard user (the dashboard layout already redirects
 * staff to `/staff-blocked`, so in practice owner / manager /
 * shift_lead see it).
 */
export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">
          Manage your profile, security, appearance, and sign-out
          everywhere.
        </p>
      </div>
      <AccountSettingsTabs />
    </div>
  );
}
