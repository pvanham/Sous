import { Megaphone } from "lucide-react";
import { AnnouncementComposer } from "./_components/AnnouncementComposer";

/**
 * Phase 2 — Announcement Composer
 * TODO(Phase 3): Add explicit Manager/Admin role guard via auth()+redirect().
 */
export default function CreateAnnouncementPage() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
              New Announcement
            </h1>
            <p className="text-sm text-muted-foreground">
              Draft and publish a staff announcement for your location.
            </p>
          </div>
        </div>
      </div>

      <AnnouncementComposer />
    </div>
  );
}
