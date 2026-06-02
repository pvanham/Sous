import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import type { MemberRole } from "@/server/models/OrganizationMember";

interface SubscriptionExpiredScreenProps {
  role: MemberRole;
}

export function SubscriptionExpiredScreen({
  role,
}: SubscriptionExpiredScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-lg border border-stone-300 dark:border-white/10 bg-card p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Subscription expired</h1>
        <p className="text-muted-foreground">
          Your paid subscription has expired.{" "}
          {role === "owner"
            ? "Please update billing to restore full access."
            : "Please ask your organization owner to update billing."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {role === "owner" ? (
            <Button asChild>
              <Link href="/dashboard/settings/billing">Go to billing</Link>
            </Button>
          ) : null}
          <SignOutButton>
            <Button variant="outline">Sign out</Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
