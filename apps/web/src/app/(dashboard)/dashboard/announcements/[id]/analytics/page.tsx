import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ChevronLeft, Megaphone } from "lucide-react";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { getAnnouncementAnalytics } from "@/server/actions/announcement.actions";
import { Button } from "@/components/ui/button";
import { AnnouncementAnalyticsView } from "../../_components/AnnouncementAnalyticsView";

type AnnouncementAnalyticsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnnouncementAnalyticsPage({
  params,
}: AnnouncementAnalyticsPageProps) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);
  if (ctx.role !== "owner" && ctx.role !== "manager") {
    redirect("/dashboard");
  }

  const analyticsResult = await getAnnouncementAnalytics(id);
  if (!analyticsResult.success) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <Megaphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Announcement Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Read receipts and acknowledgment roster.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/dashboard/announcements">
              <ChevronLeft className="h-4 w-4" />
              Back to announcements
            </Link>
          </Button>
        </div>
      </div>

      <AnnouncementAnalyticsView
        announcementId={id}
        initialData={analyticsResult.data}
      />
    </div>
  );
}
