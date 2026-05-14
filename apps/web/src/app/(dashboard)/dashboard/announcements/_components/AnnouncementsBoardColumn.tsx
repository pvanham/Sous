"use client";

import type { AnnouncementDTO } from "@/types/announcement";
import { Badge } from "@/components/ui/badge";
import { AnnouncementCard } from "./AnnouncementCard";

type AnnouncementsBoardColumnProps = {
  title: string;
  lifecycle: "draft" | "scheduled" | "active" | "expired";
  announcements: AnnouncementDTO[];
};

export function AnnouncementsBoardColumn({
  title,
  lifecycle,
  announcements,
}: AnnouncementsBoardColumnProps) {
  return (
    <div className="rounded border border-stone-300 bg-card p-4 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <Badge variant="outline">{announcements.length}</Badge>
      </div>
      {announcements.length === 0 ? (
        <div className="rounded border border-dashed border-stone-300 p-4 text-sm text-muted-foreground dark:border-white/20">
          No announcements in this stage.
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              lifecycle={lifecycle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
