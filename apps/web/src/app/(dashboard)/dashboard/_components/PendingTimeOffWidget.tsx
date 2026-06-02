"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CalendarOff, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function PendingTimeOffWidget({ requests, staff }: PendingTimeOffWidgetProps) {
  const staffMap = useMemo(() => {
    const map = new Map<string, StaffDTO>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  const hasPending = requests.length > 0;
  const displayed = useMemo(
    () =>
      [...requests]
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 10),
    [requests],
  );

  return (
    <Card
      className={`flex flex-col h-full border transition-colors ${
        hasPending
          ? "border-rose-500/25 bg-rose-500/[0.04] dark:bg-rose-500/[0.06]"
          : "border-stone-300 dark:border-white/10 bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarOff className={`h-4 w-4 ${hasPending ? "text-rose-500" : "text-muted-foreground"}`} />
          <span className="text-sm font-semibold">Time Off</span>
        </div>
        {hasPending && (
          <Badge
            variant="outline"
            className="text-[10px] font-semibold border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10"
          >
            {requests.length} pending
          </Badge>
        )}
      </div>

      {/* Scrollable list */}
      <CardContent className="flex-1 overflow-y-auto min-h-0 px-4 pt-0 pb-4">
        {hasPending ? (
          <div className="space-y-1.5">
            {displayed.map((request) => {
              const staffMember = staffMap.get(request.staffId);
              return (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-background/60 border border-rose-500/15 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {staffMember?.name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRange(request.startDate, request.endDate)}
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
        ) : (
          <div className="flex items-center gap-3 py-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground/60">No pending requests</p>
            </div>
            <Link
              href="/dashboard/time-off"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              View →
            </Link>
          </div>
        )}
      </CardContent>

      {/* Pinned footer — only when there are pending items */}
      {hasPending && (
        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-rose-500/15">
          <Button asChild variant="outline" size="sm" className="w-full border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/8 hover:border-rose-500/50">
            <Link href="/dashboard/time-off">
              Review {requests.length} request{requests.length !== 1 ? "s" : ""}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
