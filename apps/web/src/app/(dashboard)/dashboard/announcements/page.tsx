import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { listAnnouncementsByLifecycle } from "@/server/actions/announcement.actions";
import { Button } from "@/components/ui/button";
import { AnnouncementsBoard } from "./_components/AnnouncementsBoard";

export default async function AnnouncementsDashboardPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const ctx = await getLocationContext(userId);
  if (ctx.role !== "owner" && ctx.role !== "manager") {
    redirect("/dashboard");
  }

  const lifecycleResult = await listAnnouncementsByLifecycle();
  const lifecycleBuckets = lifecycleResult.success
    ? lifecycleResult.data
    : { draft: [], scheduled: [], active: [], expired: [] };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <Megaphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Announcements
              </h1>
              <p className="text-sm text-muted-foreground">
                Track lifecycle stages, edit posts, duplicate announcements, and force-expire items.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="gap-2 shrink-0">
            <Link href="/dashboard/announcements/create">
              <Plus className="h-4 w-4" />
              New announcement
            </Link>
          </Button>
        </div>
      </div>

      <AnnouncementsBoard initialBuckets={lifecycleBuckets} />
    </div>
  );
}
