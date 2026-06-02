"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format, isSameDay, addDays } from "date-fns";
import { ArrowRight, BarChart2, LayoutGrid } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type ShiftDTO } from "@/types/shift";
import { getWeekStart } from "@/lib/utils/date";
import type { DayOfWeek } from "@sous/types";

interface WeeklyScheduleOverviewProps {
  shifts: ShiftDTO[];
  weekStart: Date;
  weekStartsOn: DayOfWeek;
}

// Fixed time window: 5am → midnight
const MIN_HOUR = 5;
const MAX_HOUR = 24;
const HOUR_RANGE = MAX_HOUR - MIN_HOUR;

function formatHour(h: number): string {
  if (h === 12) return "12p";
  if (h === 0 || h === 24) return "12a";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function getShiftHours(shift: ShiftDTO): { startH: number; endH: number } {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const startH = start.getHours() + start.getMinutes() / 60;
  let endH = end.getHours() + end.getMinutes() / 60;
  if (endH <= startH) endH = 24; // handle overnight
  return { startH, endH };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function WeeklyScheduleOverview({
  shifts,
  weekStart,
  weekStartsOn,
}: WeeklyScheduleOverviewProps) {
  const weekDays = useMemo(() => {
    const start = getWeekStart(weekStart || new Date(), weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart, weekStartsOn]);

  const todayIndex = useMemo(() => {
    const idx = weekDays.findIndex((d) => isSameDay(d, new Date()));
    return idx >= 0 ? idx : 0;
  }, [weekDays]);

  const [view, setView] = useState<"curve" | "week">("curve");
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIndex);

  const selectedDate = weekDays[selectedDayIdx];
  const weekRange = `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d")}`;

  const shiftsPerDay = useMemo(
    () => weekDays.map((d) => shifts.filter((s) => isSameDay(new Date(s.start), d)).length),
    [shifts, weekDays],
  );

  return (
    <Card className="flex flex-col h-full border-stone-300 dark:border-white/10 bg-card overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 shrink-0">
        <div>
          <h3 className="text-base font-semibold leading-none">
            {view === "curve" ? "Staffing Curve" : "Week Overview"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {view === "curve"
              ? format(selectedDate, "EEEE, MMMM d")
              : `${weekRange} · ${shifts.length} shifts`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Day selector — curve mode only */}
          {view === "curve" && (
            <div className="flex items-center gap-px">
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date());
                const isSelected = i === selectedDayIdx;
                const hasShifts = shiftsPerDay[i] > 0;
                return (
                  <button
                    key={i}
                    onClick={() => hasShifts ? setSelectedDayIdx(i) : undefined}
                    className={`flex flex-col items-center w-7 py-0.5 rounded leading-tight transition-colors ${
                      isSelected
                        ? "bg-primary/15 text-primary"
                        : hasShifts
                        ? isToday
                          ? "text-primary hover:bg-primary/8 cursor-pointer"
                          : "text-muted-foreground hover:bg-muted cursor-pointer"
                        : "text-muted-foreground/25 cursor-default"
                    }`}
                  >
                    <span className="text-[10px] font-semibold">{format(day, "EEEEE")}</span>
                    <span className="text-[9px]">{format(day, "d")}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center rounded border border-stone-300 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => setView("curve")}
              title="Staffing curve"
              className={`p-1.5 transition-colors ${
                view === "curve" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("week")}
              title="Week gantt"
              className={`p-1.5 border-l border-stone-300 dark:border-white/10 transition-colors ${
                view === "week" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          <Link
            href="/dashboard/schedule"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Full schedule"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Chart area ── */}
      <CardContent className="flex-1 min-h-0 px-4 pb-4">
        {view === "curve" ? (
          <StaffingCurve
            shifts={shifts}
            selectedDate={selectedDate}
            isToday={isSameDay(selectedDate, new Date())}
          />
        ) : (
          <WeekGantt shifts={shifts} weekDays={weekDays} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Staffing Curve ───────────────────────────────────────────────────────────

function StaffingCurve({
  shifts,
  selectedDate,
  isToday,
}: {
  shifts: ShiftDTO[];
  selectedDate: Date;
  isToday: boolean;
}) {
  const now = new Date();
  const currentHourDecimal = now.getHours() + now.getMinutes() / 60;

  const dayShifts = useMemo(
    () => shifts.filter((s) => isSameDay(new Date(s.start), selectedDate)),
    [shifts, selectedDate],
  );

  // One data point per hour bucket
  const points = useMemo(
    () =>
      Array.from({ length: HOUR_RANGE }, (_, i) => {
        const hour = MIN_HOUR + i;
        const count = dayShifts.filter((shift) => {
          const { startH, endH } = getShiftHours(shift);
          return startH < hour + 1 && endH > hour;
        }).length;
        return { hour, count };
      }),
    [dayShifts],
  );

  const maxCount = Math.max(...points.map((p) => p.count), 1);
  const peakPoint = points.reduce((best, p) => (p.count > best.count ? p : best), points[0]);
  const currentCount = isToday
    ? (points.find((p) => p.hour === Math.floor(currentHourDecimal))?.count ?? 0)
    : null;

  const currentTimePct =
    isToday && currentHourDecimal >= MIN_HOUR && currentHourDecimal <= MAX_HOUR
      ? ((currentHourDecimal - MIN_HOUR) / HOUR_RANGE) * 100
      : null;

  const AXIS_LABELS = [6, 9, 12, 15, 18, 21];

  if (dayShifts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-muted-foreground">No shifts scheduled</p>
        <p className="text-xs text-muted-foreground/60">
          {format(selectedDate, "EEEE")} is open
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context row */}
      <div className="flex items-center gap-4 mb-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          Peak{" "}
          <span className="font-semibold text-foreground">
            {peakPoint.count} staff
          </span>{" "}
          at {formatHour(peakPoint.hour)}
        </span>
        {currentCount !== null && (
          <span className="text-xs text-muted-foreground">
            Now{" "}
            <span className="font-semibold text-primary">{currentCount} on shift</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums">
          max {maxCount}
        </span>
      </div>

      {/* Chart */}
      <div className="relative flex-1 min-h-0">
        {/* Current time indicator */}
        {currentTimePct !== null && (
          <div className="absolute top-0 bottom-5 pointer-events-none z-10" style={{ left: `${currentTimePct}%` }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
            <div className="absolute top-1.5 bottom-0 left-1/2 -translate-x-1/2 w-px bg-primary/50" />
          </div>
        )}

        {/* Bars */}
        <div className="absolute top-0 left-0 right-0 bottom-5 flex items-end gap-px">
          {points.map(({ hour, count }) => {
            const heightPct = count > 0 ? Math.max((count / maxCount) * 100, 5) : 0;
            const isPast = isToday && hour + 1 <= currentHourDecimal;
            const isCurrent = isToday && hour <= currentHourDecimal && currentHourDecimal < hour + 1;
            const isPeak = count > 0 && hour === peakPoint.hour;

            return (
              <div
                key={hour}
                className="flex-1 h-full relative group"
              >
                {count > 0 && (
                  <>
                    {/* Count label — always visible for peak/current, hover for others */}
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 text-[9px] tabular-nums font-semibold leading-none pointer-events-none z-10 transition-opacity ${
                        isPeak || isCurrent
                          ? "opacity-100 text-foreground"
                          : "opacity-0 group-hover:opacity-100 text-muted-foreground"
                      }`}
                      style={{ bottom: `calc(${heightPct}% + 3px)` }}
                    >
                      {count}
                    </span>
                    {/* Bar */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 rounded-t-[2px] transition-all duration-300 ${
                        isCurrent ? "bg-primary" : isPast ? "bg-primary/20" : "bg-primary/45 group-hover:bg-primary/65"
                      }`}
                      style={{ height: `${heightPct}%` }}
                      title={`${formatHour(hour)}: ${count} staff on shift`}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-0 h-5">
          {AXIS_LABELS.map((h) => (
            <span
              key={h}
              className="absolute text-[10px] text-muted-foreground/50 -translate-x-1/2 bottom-0"
              style={{ left: `${((h - MIN_HOUR) / HOUR_RANGE) * 100}%` }}
            >
              {formatHour(h)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Week Gantt ───────────────────────────────────────────────────────────────

function WeekGantt({
  shifts,
  weekDays,
}: {
  shifts: ShiftDTO[];
  weekDays: Date[];
}) {
  const today = new Date();
  const currentHourDecimal = today.getHours() + today.getMinutes() / 60;
  const TIME_MARKERS = [6, 9, 12, 15, 18, 21];

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0 gap-1">
      {/* Time axis labels */}
      <div className="relative w-5 shrink-0">
        <div className="h-8 shrink-0" />
        <div className="relative flex-1 h-[calc(100%-32px)]">
          {TIME_MARKERS.map((h) => (
            <span
              key={h}
              className="absolute right-0 text-[9px] text-muted-foreground/40 leading-none -translate-y-1/2"
              style={{ top: `${((h - MIN_HOUR) / HOUR_RANGE) * 100}%` }}
            >
              {formatHour(h)}
            </span>
          ))}
        </div>
      </div>

      {/* Day columns */}
      {weekDays.map((day, i) => {
        const isToday = isSameDay(day, today);
        const dayShifts = shifts.filter((s) => isSameDay(new Date(s.start), day));
        const currentPct =
          isToday && currentHourDecimal >= MIN_HOUR && currentHourDecimal <= MAX_HOUR
            ? ((currentHourDecimal - MIN_HOUR) / HOUR_RANGE) * 100
            : null;

        return (
          <div key={i} className="flex-1 flex flex-col min-w-0">
            {/* Day header */}
            <div className="h-8 flex flex-col items-center justify-center shrink-0 gap-px">
              <p className={`text-[10px] font-semibold leading-none ${isToday ? "text-primary" : "text-muted-foreground/60"}`}>
                {format(day, "EEEEE")}
              </p>
              <p className={`text-[9px] leading-none ${isToday ? "text-primary" : "text-muted-foreground/40"}`}>
                {format(day, "d")}
              </p>
              <p className={`text-[9px] leading-none tabular-nums font-medium ${isToday ? "text-primary/70" : "text-muted-foreground/35"}`}>
                {dayShifts.length > 0 ? dayShifts.length : "·"}
              </p>
            </div>

            {/* Column body */}
            <div
              className={`relative flex-1 rounded-sm overflow-hidden ${
                isToday
                  ? "bg-primary/5 ring-1 ring-inset ring-primary/25"
                  : "bg-muted/20 dark:bg-white/[0.03]"
              }`}
            >
              {/* Grid lines */}
              {TIME_MARKERS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-stone-300/20 dark:border-white/5"
                  style={{ top: `${((h - MIN_HOUR) / HOUR_RANGE) * 100}%` }}
                />
              ))}

              {/* Shift bars */}
              {dayShifts.map((shift) => {
                const { startH, endH } = getShiftHours(shift);
                const clampedStart = Math.max(startH, MIN_HOUR);
                const clampedEnd = Math.min(endH, MAX_HOUR);
                const topPct = ((clampedStart - MIN_HOUR) / HOUR_RANGE) * 100;
                const heightPct = ((clampedEnd - clampedStart) / HOUR_RANGE) * 100;
                const colorClass =
                  startH < 12
                    ? "bg-amber-400/60"
                    : startH < 15
                    ? "bg-primary/60"
                    : "bg-stone-400/50 dark:bg-stone-400/35";

                return (
                  <div
                    key={shift.id}
                    className={`absolute inset-x-[14%] rounded-[2px] ${colorClass}`}
                    style={{
                      top: `${topPct}%`,
                      height: `${Math.max(heightPct, 1.5)}%`,
                    }}
                    title={`${format(new Date(shift.start), "h:mma")}–${format(new Date(shift.end), "h:mma")} · ${shift.station}`}
                  />
                );
              })}

              {/* Current time line */}
              {currentPct !== null && (
                <div
                  className="absolute left-0 right-0 h-px bg-primary z-10"
                  style={{ top: `${currentPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
      </div>{/* end flex gap-1 */}

      {/* Legend */}
      <div className="flex items-center gap-3 pt-2 shrink-0">
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-[1px] bg-amber-400/60 shrink-0" />
          <span className="text-[10px] text-muted-foreground/60">Morning</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-[1px] bg-primary/60 shrink-0" />
          <span className="text-[10px] text-muted-foreground/60">Afternoon</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-[1px] bg-stone-400/50 shrink-0" />
          <span className="text-[10px] text-muted-foreground/60">Evening</span>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground/40">hover a bar for details</span>
      </div>
    </div>
  );
}
