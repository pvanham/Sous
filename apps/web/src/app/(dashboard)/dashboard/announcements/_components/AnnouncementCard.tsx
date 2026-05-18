"use client";

import { format } from "date-fns";
import { CalendarClock, CalendarOff, Paperclip, Users } from "lucide-react";

import { describeAudience } from "@/lib/announcement/audience";
import { tiptapBodyToPlainText } from "@/lib/announcement/composer-defaults";
import { cn } from "@/lib/utils";
import type { AnnouncementDTO } from "@/types/announcement";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementActionsMenu } from "./AnnouncementActionsMenu";
import { LIFECYCLE_STYLE, type AnnouncementLifecycle } from "./lifecycle-style";

type AnnouncementCardProps = {
  announcement: AnnouncementDTO;
  lifecycle: AnnouncementLifecycle;
  isExpanded: boolean;
  onToggle: () => void;
  stackIndex: number;
  stackSize: number;
};

export function AnnouncementCard({
  announcement,
  lifecycle,
  isExpanded,
  onToggle,
  stackIndex,
  stackSize,
}: AnnouncementCardProps) {
  const style = LIFECYCLE_STYLE[lifecycle];
  const isUrgent = announcement.priority === "Urgent";
  const baseZ = stackSize - stackIndex;
  const zIndex = isExpanded ? stackSize + 100 : baseZ;

  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <Card
      style={{ zIndex }}
      className={cn(
        "relative transition-colors hover:border-primary/40",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l before:content-['']",
        style.spineClass,
        isExpanded && "border-primary/40",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={isExpanded}
        className={cn(
          "flex w-full cursor-pointer justify-between gap-1.5 pl-4 pr-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isExpanded ? "min-h-11 items-start py-3" : "h-11 items-center",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isUrgent && (
            <span
              aria-label="Urgent"
              className="h-2 w-2 shrink-0 rounded-full bg-destructive ring-2 ring-destructive/25"
            />
          )}
          <CardTitle
            className={cn(
              "text-sm font-semibold tracking-tight",
              isExpanded ? "whitespace-normal" : "line-clamp-1",
            )}
          >
            {announcement.title}
          </CardTitle>
          {announcement.attachments.length > 0 && (
            <Badge variant="outline" className="shrink-0 gap-1 px-1.5">
              <Paperclip className="h-3 w-3" />
              {announcement.attachments.length}
            </Badge>
          )}
        </div>

        <span
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <AnnouncementActionsMenu
            announcementId={announcement.id}
            announcementTitle={announcement.title}
            lifecycle={lifecycle}
          />
        </span>
      </div>

      {isExpanded ? (
        <>
          {(isUrgent || announcement.tags.length > 0) && (
            <CardHeader className="pb-3 pl-5 pr-6 pt-0">
              <div className="flex flex-wrap items-center gap-2">
                {isUrgent && <Badge variant="destructive">Urgent</Badge>}
                {announcement.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardHeader>
          )}
          <CardContent className="space-y-3 pl-5 pr-6 text-sm text-muted-foreground">
            <p className="line-clamp-2 border-t border-primary/20 pt-3">
              {tiptapBodyToPlainText(announcement.body)}
            </p>
            <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-1.5">
              <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Audience</span>
              <span className="font-medium text-foreground">
                {describeAudience(announcement.targetAudience)}
              </span>

              <CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Publish</span>
              <span className="font-medium text-foreground">
                {announcement.publishDate
                  ? format(announcement.publishDate, "MMM d, yyyy p")
                  : "Not scheduled"}
              </span>

              <CalendarOff className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Expires</span>
              <span className="font-medium text-foreground">
                {announcement.expirationDate
                  ? format(announcement.expirationDate, "MMM d, yyyy p")
                  : "No expiration"}
              </span>
            </div>
          </CardContent>
        </>
      ) : null}
    </Card>
  );
}
