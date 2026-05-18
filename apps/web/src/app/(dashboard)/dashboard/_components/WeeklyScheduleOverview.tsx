"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, eachDayOfInterval, addDays } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { type ShiftDTO } from "@/types/shift";
import { getWeekStart } from "@/lib/utils/date";
import type { DayOfWeek } from "@sous/types";

interface WeeklyScheduleOverviewProps {
  shifts: ShiftDTO[];
  weekStart: Date;
  weekStartsOn: DayOfWeek;
}

export function WeeklyScheduleOverview({
  shifts,
  weekStart,
  weekStartsOn,
}: WeeklyScheduleOverviewProps) {
  const weekDays = useMemo(() => {
    const start = getWeekStart(weekStart || new Date(), weekStartsOn);
    const end = addDays(start, 6);
    return eachDayOfInterval({ start, end });
  }, [weekStart, weekStartsOn]);

  const shiftsPerDay = useMemo(() => {
    const counts = new Array(7).fill(0);

    shifts.forEach((shift) => {
      const shiftDate = new Date(shift.start);
      const index = weekDays.findIndex(
        (wd) => format(wd, "yyyy-MM-dd") === format(shiftDate, "yyyy-MM-dd")
      );
      if (index !== -1) counts[index]++;
    });

    const maxShifts = Math.max(...counts, 1);

    return weekDays.map((date, i) => ({
      date,
      dayLabel: format(date, "EEE"),
      dateLabel: format(date, "d"),
      count: counts[i],
      percentage: (counts[i] / maxShifts) * 100,
      isToday: format(new Date(), "yyyy-MM-dd") === format(date, "yyyy-MM-dd"),
    }));
  }, [shifts, weekDays]);

  const totalShifts = shifts.length;

  return (
    <Card className="flex flex-col h-full border-border/50 bg-background/60 backdrop-blur-xl transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Week at a Glance</CardTitle>
          <span className="text-xs text-muted-foreground">
            {totalShifts} shift{totalShifts !== 1 ? "s" : ""} total
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 py-4 px-6">
        {/* Bar chart area — grows to fill remaining card height, with a slight size cap */}
        <div className="flex items-end justify-between gap-1.5 flex-1 min-h-0 max-h-[220px]">
          {shiftsPerDay.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 flex-1 group h-full">
              {/* Bar container */}
              <div className="relative w-full flex justify-center items-end flex-1">
                {/* Shift count label — appears on hover */}
                {day.count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {day.count}
                  </span>
                )}
                {/* The bar itself */}
                <div
                  className={`w-full max-w-[36px] rounded-t transition-all duration-500 ease-out ${
                    day.isToday
                      ? "bg-primary shadow-sm"
                      : day.count === 0
                      ? "bg-border/60"
                      : "bg-primary/25 group-hover:bg-primary/40"
                  }`}
                  style={{ height: `${Math.max(day.percentage, 6)}%` }}
                />
              </div>
              {/* Day labels */}
              <div className="text-center shrink-0">
                <p
                  className={`text-xs font-medium ${
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {day.dayLabel}
                </p>
                <p
                  className={`text-[10px] leading-none mt-0.5 ${
                    day.isToday
                      ? "text-primary font-bold"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {day.dateLabel}
                </p>
              </div>
            </div>
          ))}
        </div>
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
