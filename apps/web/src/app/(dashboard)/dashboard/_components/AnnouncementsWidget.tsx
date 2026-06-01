"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Megaphone } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tiptapBodyToPlainText } from "@/lib/announcement/composer-defaults";
import type { AnnouncementDTO } from "@/types/announcement";

interface AnnouncementsWidgetProps {
  announcements: AnnouncementDTO[];
}

export function AnnouncementsWidget({
  announcements,
}: AnnouncementsWidgetProps) {
  return (
    <Card className="flex flex-col h-full border-border/50 bg-background/60 backdrop-blur-xl transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="h-4 w-4 text-primary" />
            Announcements
          </CardTitle>
          {announcements.length > 0 && (
            <Badge variant="secondary" className="font-normal tabular-nums">
              {announcements.length} active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-2 min-h-0">
        {announcements.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              No active announcements
            </p>
            <p className="text-xs text-muted-foreground/60">
              Posts you publish will show up here
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {announcements.map((announcement) => {
              const isUrgent = announcement.priority === "Urgent";
              const excerpt = tiptapBodyToPlainText(announcement.body).trim();
              const publishedAt = announcement.publishDate ?? announcement.createdAt;

              return (
                <div
                  key={announcement.id}
                  className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-2">
                    {isUrgent && (
                      <span
                        aria-label="Urgent"
                        className="h-2 w-2 shrink-0 rounded-full bg-destructive ring-2 ring-destructive/25"
                      />
                    )}
                    <p className="flex-1 truncate text-sm font-medium leading-tight">
                      {announcement.title}
                    </p>
                    {isUrgent && (
                      <Badge variant="destructive" className="shrink-0 text-[10px]">
                        Urgent
                      </Badge>
                    )}
                  </div>
                  {excerpt && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {excerpt}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {announcement.authorName}
                    {" · "}
                    {formatDistanceToNow(new Date(publishedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Link
          href="/dashboard/announcements"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Manage announcements
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
