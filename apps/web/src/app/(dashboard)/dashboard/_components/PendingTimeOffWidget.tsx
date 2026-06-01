"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, CalendarOff, Check } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TimeOffRequestDTO, TimeOffRequestType } from "@/types/time-off-request";
import type { StaffDTO } from "@/types/staff";

interface PendingTimeOffWidgetProps {
  requests: TimeOffRequestDTO[];
  staff: StaffDTO[];
}

const TYPE_LABEL: Record<TimeOffRequestType, string> = {
  pto: "PTO",
  sick: "Sick",
  unpaid: "Unpaid",
};

function formatRange(start: Date, end: Date): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
    return format(startDate, "MMM d");
  }
  if (format(startDate, "MMM yyyy") === format(endDate, "MMM yyyy")) {
    return `${format(startDate, "MMM d")}–${format(endDate, "d")}`;
  }
  return `${format(startDate, "MMM d")} – ${format(endDate, "MMM d")}`;
}

export function PendingTimeOffWidget({
  requests,
  staff,
}: PendingTimeOffWidgetProps) {
  const staffMap = useMemo(() => {
    const map = new Map<string, StaffDTO>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  return (
    <Card className="flex flex-col h-full border-border/50 bg-background/60 backdrop-blur-xl transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <CalendarOff className="h-4 w-4 text-rose-500" />
            Time Off
          </CardTitle>
          {requests.length > 0 && (
            <Badge variant="warning" className="font-medium tabular-nums">
              {requests.length} pending
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-2 min-h-0">
        {requests.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="rounded-full bg-emerald-500/10 p-2.5">
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              All caught up
            </p>
            <p className="text-xs text-muted-foreground/60">
              No pending time-off requests
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map((request) => {
              const staffMember = staffMap.get(request.staffId);
              return (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2 transition-colors hover:border-rose-500/30 hover:bg-rose-500/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {staffMember?.name ?? "Unknown staff"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRange(request.startDate, request.endDate)}
                      {" · "}
                      <span className="text-muted-foreground/70">
                        {formatDistanceToNow(new Date(request.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    {TYPE_LABEL[request.type]}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Link
          href="/dashboard/time-off"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {requests.length > 0 ? "Review requests" : "View time off"}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
