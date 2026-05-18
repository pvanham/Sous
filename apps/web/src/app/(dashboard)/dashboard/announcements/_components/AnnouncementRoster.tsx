"use client";

import { formatDistanceToNowStrict } from "date-fns";
import type { AnnouncementAnalyticsRosterEntryDTO } from "@/types/announcement-analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AnnouncementRosterProps = {
  roster: AnnouncementAnalyticsRosterEntryDTO[];
  requiresAcknowledgment: boolean;
};

type RosterColumnProps = {
  title: string;
  description: string;
  entries: AnnouncementAnalyticsRosterEntryDTO[];
  mode: "read" | "acknowledgment";
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTimeLabel(timestamp: Date | null): string {
  if (!timestamp) return "No activity yet";
  return `${formatDistanceToNowStrict(timestamp)} ago`;
}

function RosterColumn({ title, description, entries, mode }: RosterColumnProps) {
  return (
    <Card className="border-border/50 bg-background/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members in this column.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const timeSource =
                mode === "acknowledgment" ? entry.acknowledgedAt : entry.readAt;

              return (
                <div
                  key={entry.staffId}
                  className="flex items-start gap-3 rounded border border-border/60 p-3"
                >
                  <Avatar className="h-9 w-9">
                    {entry.imageUrl ? <AvatarImage src={entry.imageUrl} alt={entry.name} /> : null}
                    <AvatarFallback>{getInitials(entry.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entry.roles.map((role) => (
                        <Badge key={`${entry.staffId}-${role}`} variant="outline">
                          {role}
                        </Badge>
                      ))}
                      {!entry.hasClerkLink ? (
                        <Badge variant="secondary">No linked account</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeLabel(timeSource)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnnouncementRoster({
  roster,
  requiresAcknowledgment,
}: AnnouncementRosterProps) {
  if (roster.length === 0) {
    return (
      <Card className="border border-dashed border-border/80 bg-background/60">
        <CardContent className="py-8 text-sm text-muted-foreground">
          No active audience members are currently targeted by this announcement.
        </CardContent>
      </Card>
    );
  }

  if (requiresAcknowledgment) {
    const acknowledged = roster.filter((entry) => entry.acknowledgedAt !== null);
    const pending = roster.filter((entry) => entry.acknowledgedAt === null);

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RosterColumn
          title="Acknowledged"
          description="Team members who explicitly acknowledged this post."
          entries={acknowledged}
          mode="acknowledgment"
        />
        <RosterColumn
          title="Pending acknowledgment"
          description="Team members who still need to acknowledge this post."
          entries={pending}
          mode="acknowledgment"
        />
      </div>
    );
  }

  const read = roster.filter((entry) => entry.readAt !== null);
  const unread = roster.filter((entry) => entry.readAt === null);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <RosterColumn
        title="Read"
        description="Team members who opened this announcement."
        entries={read}
        mode="read"
      />
      <RosterColumn
        title="Not yet seen"
        description="Team members who have not opened this announcement yet."
        entries={unread}
        mode="read"
      />
    </div>
  );
}
