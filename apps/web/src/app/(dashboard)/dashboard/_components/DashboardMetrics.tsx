"use client";

import { Users, Clock, CalendarDays, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Average shift length
  const avgShiftHours =
    totalShifts > 0 ? (totalHours / totalShifts).toFixed(1) : "—";

  const metrics = [
    {
      title: "Shifts Scheduled",
      value: totalShifts.toString(),
      description: "This week",
      icon: CalendarDays,
      accent: "text-blue-500",
      hoverBg: "hover:bg-blue-500/5",
    },
    {
      title: "Labor Hours",
      value: totalHours > 0 ? totalHours.toFixed(1) : "—",
      description: "Total this week",
      icon: Clock,
      accent: "text-primary",
      hoverBg: "hover:bg-primary/5",
    },
    {
      title: "Staff Scheduled",
      value: `${staffScheduled} / ${activeStaff}`,
      description: "Of active employees",
      icon: Users,
      accent: "text-emerald-500",
      hoverBg: "hover:bg-emerald-500/5",
    },
    {
      title: "Avg Shift Length",
      value: avgShiftHours !== "—" ? `${avgShiftHours}h` : "—",
      description: "Per scheduled shift",
      icon: TrendingUp,
      accent: "text-violet-500",
      hoverBg: "hover:bg-violet-500/5",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card
            key={metric.title}
            className={`relative overflow-hidden border-border/50 bg-background/60 backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${metric.hoverBg}`}
          >
            {/* Ghost icon watermark */}
            <div className={`pointer-events-none absolute right-0 top-0 p-3 opacity-[0.06] ${metric.accent}`}>
              <Icon className="h-20 w-20 translate-x-3 -translate-y-3" />
            </div>

            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${metric.accent}`} />
            </CardHeader>

            <CardContent className="relative">
              <div className="text-2xl font-bold tracking-tight">{metric.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
