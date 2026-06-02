"use client";

import { CalendarDays, Clock, Users, TrendingUp } from "lucide-react";
import { type ShiftDTO } from "@/types/shift";
import { type StaffDTO } from "@/types/staff";

interface DashboardMetricsProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
}

export function DashboardMetrics({ shifts, staff }: DashboardMetricsProps) {
  const totalShifts = shifts.length;

  const totalHours = shifts.reduce((acc, shift) => {
    const start = new Date(shift.start);
    const end = new Date(shift.end);
    return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }, 0);

  const uniqueStaffIds = new Set(shifts.map((s) => s.staffId));
  const staffScheduled = uniqueStaffIds.size;
  const activeStaff = staff.filter((s) => s.isActive).length;

  const avgShiftHours =
    totalShifts > 0 ? (totalHours / totalShifts).toFixed(1) : null;

  const coveragePercent =
    activeStaff > 0 ? Math.round((staffScheduled / activeStaff) * 100) : 0;

  return (
    <div className="flex items-stretch rounded-lg border border-stone-300 dark:border-white/10 bg-card divide-x divide-stone-300 dark:divide-white/10 overflow-hidden">

      {/* Shifts scheduled */}
      <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
        <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
            Shifts this week
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground leading-none">
            {totalShifts > 0 ? totalShifts : "—"}
          </p>
        </div>
      </div>

      {/* Labor hours */}
      <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
        <Clock className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
            Total labor hours
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground leading-none">
            {totalHours > 0 ? `${totalHours.toFixed(0)}h` : "—"}
          </p>
        </div>
      </div>

      {/* Staff coverage */}
      <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
        <Users className="h-4 w-4 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
            Staff scheduled
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xl font-bold tabular-nums text-foreground leading-none">
              {activeStaff > 0 ? (
                <>
                  {staffScheduled}
                  <span className="text-sm font-normal text-muted-foreground"> / {activeStaff}</span>
                </>
              ) : "—"}
            </p>
            {activeStaff > 0 && (
              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden max-w-[60px]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Average shift length */}
      <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
        <TrendingUp className="h-4 w-4 text-violet-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
            Avg shift length
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground leading-none">
            {avgShiftHours ? `${avgShiftHours}h` : "—"}
          </p>
        </div>
      </div>

    </div>
  );
}
