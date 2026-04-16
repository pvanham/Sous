"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { ArrowRight, Sun } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type ShiftDTO } from "@/types/shift";
import { type StaffDTO } from "@/types/staff";

interface TodayScheduleWidgetProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
}

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

  return (
    <Card className="flex flex-col h-full border-border/50 bg-background/60 backdrop-blur-xl transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Today&apos;s Shifts</CardTitle>
          <Badge variant="secondary" className="font-normal tabular-nums">
            {todayShifts.length} / {staff.length}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-2 min-h-0">
        {todayShifts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Sun className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No shifts today</p>
            <p className="text-xs text-muted-foreground/60">
              {format(new Date(), "EEEE")} looks open
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayShifts.map((shift) => {
              const staffMember = staffMap.get(shift.staffId);
              const initials = staffMember
                ? staffMember.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase()
                : "?";

              const startHour = new Date(shift.start).getHours();
              const shiftLabel =
                startHour < 12 ? "AM" : startHour < 17 ? "PM" : "Eve";

              return (
                <div key={shift.id} className="flex items-center gap-3 group">
                  <Avatar className="h-8 w-8 shrink-0 border border-border/50">
                    <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {staffMember?.name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(shift.start), "h:mm")}–{format(new Date(shift.end), "h:mm a")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] uppercase font-semibold text-muted-foreground bg-muted/30 px-1.5">
                      {shift.station}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/50">{shiftLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Link
          href="/dashboard/schedule"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View full schedule
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
