"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { ArrowRight, CalendarDays } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type ShiftDTO } from "@/types/shift";
import { type StaffDTO } from "@/types/staff";

interface TodayScheduleWidgetProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
}

type ShiftPeriod = "Morning" | "Afternoon" | "Evening";

function getShiftPeriod(startDate: Date): ShiftPeriod {
  const hour = startDate.getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

const PERIOD_STYLES: Record<ShiftPeriod, { border: string; label: string; dot: string }> = {
  Morning: {
    border: "border-l-amber-400",
    label: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-400",
  },
  Afternoon: {
    border: "border-l-primary",
    label: "text-primary",
    dot: "bg-primary",
  },
  Evening: {
    border: "border-l-stone-400",
    label: "text-stone-500 dark:text-stone-400",
    dot: "bg-stone-400",
  },
};

export function TodayScheduleWidget({ shifts, staff }: TodayScheduleWidgetProps) {
  const todayShifts = useMemo(() => {
    const today = new Date();
    return shifts
      .filter((shift) => isSameDay(new Date(shift.start), today))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [shifts]);

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffDTO>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  const activeStaff = staff.filter((s) => s.isActive).length;
  const uniqueOnShift = new Set(todayShifts.map((s) => s.staffId)).size;
  const coveragePercent = activeStaff > 0 ? (uniqueOnShift / activeStaff) * 100 : 0;

  // Group shifts by time-of-day period
  const grouped = useMemo(() => {
    const groups: Partial<Record<ShiftPeriod, ShiftDTO[]>> = {};
    for (const shift of todayShifts) {
      const period = getShiftPeriod(new Date(shift.start));
      if (!groups[period]) groups[period] = [];
      groups[period]!.push(shift);
    }
    return groups;
  }, [todayShifts]);

  const periods: ShiftPeriod[] = ["Morning", "Afternoon", "Evening"];

  return (
    <Card className="flex flex-col h-full border-stone-300 dark:border-white/10 bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">
              Today&apos;s Shifts
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-sm font-semibold tabular-nums">
              {uniqueOnShift}
              <span className="text-muted-foreground font-normal"> / {activeStaff}</span>
            </span>
            {/* Coverage fill bar */}
            <div className="w-20 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">staff on shift</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-0 px-4 pb-4 min-h-0">
        {todayShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No shifts today</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {format(new Date(), "EEEE")} is open
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {periods.map((period) => {
              const periodShifts = grouped[period];
              if (!periodShifts?.length) return null;
              const styles = PERIOD_STYLES[period];

              return (
                <div key={period}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${styles.label}`}>
                      {period}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {periodShifts.map((shift) => {
                      const staffMember = staffMap.get(shift.staffId);
                      const initials = staffMember
                        ? staffMember.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()
                        : "?";

                      return (
                        <div
                          key={shift.id}
                          className={`flex items-center gap-2 rounded-r-md border-l-2 bg-muted/30 px-2.5 py-1.5 ${styles.border}`}
                        >
                          <Avatar className="h-6 w-6 shrink-0 border border-border/50">
                            {staffMember?.imageUrl ? (
                              <AvatarImage src={staffMember.imageUrl} alt={staffMember.name} />
                            ) : null}
                            <AvatarFallback className="bg-primary/8 text-primary text-[9px] font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate leading-tight">
                              {staffMember?.name ?? "Unknown"}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-px">
                              {format(new Date(shift.start), "h:mm")}–{format(new Date(shift.end), "h:mma")}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[9px] uppercase font-semibold text-muted-foreground bg-background/60 px-1"
                          >
                            {shift.station}
                          </Badge>
                        </div>
                      );
                    })}
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
          href="/dashboard/schedule"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View full schedule
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}
