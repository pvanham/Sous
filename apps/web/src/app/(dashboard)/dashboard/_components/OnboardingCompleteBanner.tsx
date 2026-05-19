"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "sous:onboarding-complete-banner-dismissed";

export function OnboardingCompleteBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboardingComplete = searchParams.get("onboarding") === "complete";

  if (!onboardingComplete) return null;
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(STORAGE_KEY) === "true") return null;

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("onboarding");
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  };

  return (
    <div className="rounded border border-emerald-300/40 bg-emerald-500/10 p-4 flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="font-medium">Your location is ready.</p>
        <p className="text-sm text-muted-foreground">
          Team invites have been sent. Head to Schedule to build your first week, or review advanced settings next.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <a href="/dashboard/schedule">Go to Schedule</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/dashboard/settings">Review Settings</a>
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
