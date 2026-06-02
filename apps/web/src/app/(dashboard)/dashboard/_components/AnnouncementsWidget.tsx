"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tiptapBodyToPlainText } from "@/lib/announcement/composer-defaults";
import type { AnnouncementDTO } from "@/types/announcement";

interface AnnouncementsWidgetProps {
  announcements: AnnouncementDTO[];
}

export function AnnouncementsWidget({ announcements }: AnnouncementsWidgetProps) {
  return (
    <Card className="flex flex-col h-full border-stone-300 dark:border-white/10 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Announcements</span>
        </div>
        {announcements.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {announcements.length} active
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <CardContent className="flex-1 overflow-y-auto py-0 px-4 pb-4 min-h-0">
        {announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No active announcements</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Posts you publish will appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {announcements.map((announcement) => {
              const isUrgent = announcement.priority === "Urgent";
              const excerpt = tiptapBodyToPlainText(announcement.body).trim();
              const publishedAt = announcement.publishDate ?? announcement.createdAt;

              return (
                <div
                  key={announcement.id}
                  className={`rounded-md border bg-background/40 px-3 py-2.5 transition-colors hover:bg-background/70 ${
                    isUrgent
                      ? "border-l-2 border-destructive/60 border-r-border/40 border-t-border/40 border-b-border/40 pl-2.5"
                      : "border-border/40"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isUrgent && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0">
                          Urgent
                        </Badge>
                      )}
                      <p className="text-sm font-medium truncate leading-tight">
                        {announcement.title}
                      </p>
                    </div>
                    {excerpt && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {excerpt}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="text-[11px] text-muted-foreground/60">
                        {announcement.authorName}
                      </p>
                      <span className="text-[11px] text-muted-foreground/30">·</span>
                      <p className="text-[11px] text-muted-foreground/50">
                        {formatDistanceToNow(new Date(publishedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Pinned footer */}
      <div className="shrink-0 px-4 py-3 border-t border-border/50 flex justify-end">
        <Link
          href="/dashboard/announcements"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Manage announcements
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}
