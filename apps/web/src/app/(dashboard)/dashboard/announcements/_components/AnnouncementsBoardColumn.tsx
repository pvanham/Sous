"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { AnnouncementDTO } from "@/types/announcement";
import { Badge } from "@/components/ui/badge";
import { AnnouncementCard } from "./AnnouncementCard";
import { LIFECYCLE_STYLE, type AnnouncementLifecycle } from "./lifecycle-style";

type AnnouncementsBoardColumnProps = {
  title: string;
  lifecycle: AnnouncementLifecycle;
  announcements: AnnouncementDTO[];
};

export function AnnouncementsBoardColumn({
  title,
  lifecycle,
  announcements,
}: AnnouncementsBoardColumnProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const style = LIFECYCLE_STYLE[lifecycle];

  const handleToggle = (announcementId: string) => {
    setExpandedId((currentId) => (currentId === announcementId ? null : announcementId));
  };

  return (
    <div className="rounded border border-stone-300 bg-card p-4 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", style.dotClass)} aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h2>
        </div>
        <Badge variant={style.badgeVariant}>{announcements.length}</Badge>
      </div>
      {announcements.length === 0 ? (
        <div
          className={cn(
            "rounded border border-dashed p-4 text-sm text-muted-foreground",
            style.emptyBorderClass,
            style.emptyBgClass,
          )}
        >
          No announcements in this stage.
        </div>
      ) : (
        <div className="relative flex flex-col [&>*+*]:-mt-3">
          {announcements.map((announcement, index) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              lifecycle={lifecycle}
              isExpanded={expandedId === announcement.id}
              onToggle={() => handleToggle(announcement.id)}
              stackIndex={index}
              stackSize={announcements.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
