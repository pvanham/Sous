"use client";

import { format } from "date-fns";
import { Paperclip } from "lucide-react";

import { describeAudience } from "@/lib/announcement/audience";
import type { AnnouncementDTO } from "@/types/announcement";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementActionsMenu } from "./AnnouncementActionsMenu";

type AnnouncementCardProps = {
  announcement: AnnouncementDTO;
  lifecycle: "draft" | "scheduled" | "active" | "expired";
};

const lifecycleBadgeLabel: Record<
  "draft" | "scheduled" | "active" | "expired",
  string
> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
};

export function AnnouncementCard({ announcement, lifecycle }: AnnouncementCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{announcement.title}</CardTitle>
          <AnnouncementActionsMenu
            announcementId={announcement.id}
            announcementTitle={announcement.title}
            lifecycle={lifecycle}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={announcement.priority === "Urgent" ? "destructive" : "outline"}>
            {announcement.priority}
          </Badge>
          <Badge variant="outline">{lifecycleBadgeLabel[lifecycle]}</Badge>
          {announcement.attachments.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Paperclip className="h-3 w-3" />
              {announcement.attachments.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p className="line-clamp-2">{announcement.body}</p>
        <p>
          Audience:
          {" "}
          <span className="font-medium text-foreground">
            {describeAudience(announcement.targetAudience)}
          </span>
        </p>
        <p>
          Publish:
          {" "}
          <span className="font-medium text-foreground">
            {announcement.publishDate
              ? format(announcement.publishDate, "MMM d, yyyy p")
              : "Not scheduled"}
          </span>
        </p>
        <p>
          Expires:
          {" "}
          <span className="font-medium text-foreground">
            {announcement.expirationDate
              ? format(announcement.expirationDate, "MMM d, yyyy p")
              : "No expiration"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
