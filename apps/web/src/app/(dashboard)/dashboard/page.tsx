import { format } from "date-fns";
import { currentUser } from "@clerk/nextjs/server";
import { getWeekStart } from "@/lib/utils/date";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getScheduleByWeek } from "@/server/actions/schedule.actions";
import { listShiftsForLocationWeek } from "@/server/actions/shift.actions";
import { listStaff } from "@/server/actions/staff.actions";
import type { ShiftDTO } from "@/types/shift";
import type { ScheduleDTO } from "@/types/schedule";

import { DashboardMetrics } from "./_components/DashboardMetrics";
import { TodayScheduleWidget } from "./_components/TodayScheduleWidget";
import { WeeklyScheduleOverview } from "./_components/WeeklyScheduleOverview";
import { QuickActionsWidget } from "./_components/QuickActionsWidget";

export default async function DashboardPage() {
  // Resolve the location's configured week start before computing the
  // weekStart anchor — the schedule service rejects a misaligned date,
  // and the rest of the page (overview chart, metric labels) needs to
  // render against the same anchor for consistency.
  const configResult = await getKitchenConfig();
  const weekStartsOn =
    configResult.success && configResult.data
      ? configResult.data.weekStartsOn
      : "monday";
  const weekStart = getWeekStart(new Date(), weekStartsOn);

  // Read-only fetches. The dashboard is a pure read — visiting it
  // should never side-effect-create a Schedule doc, so we use
  // `getScheduleByWeek` (returns null when nothing exists yet) and
  // pull shifts by date range so legacy schedules' shifts still feed
  // the widgets after a `weekStartsOn` flip.
  const [scheduleResult, shiftsResult, staffResult, user] = await Promise.all([
    getScheduleByWeek({ weekStartDate: weekStart }),
    listShiftsForLocationWeek({ weekStartDate: weekStart }),
    listStaff(),
    currentUser(),
  ]);

  const schedule: ScheduleDTO | null = scheduleResult.success
    ? scheduleResult.data
    : null;
  const staff = staffResult.success ? staffResult.data : [];
  const shifts: ShiftDTO[] = shiftsResult.success ? shiftsResult.data : [];

  const firstName = user?.firstName ?? "there";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Good{getGreeting()},{" "}
            <span className="bg-gradient-to-br from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
              {firstName}
            </span>
          </h1>
          <p className="text-muted-foreground text-sm font-medium">
            {format(new Date(), "EEEE, MMMM do, yyyy")}
          </p>
        </div>
        {schedule && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">This week&apos;s schedule:</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                schedule.status === "PUBLISHED"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${schedule.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500"}`} />
              {schedule.status === "PUBLISHED" ? "Published" : "Draft"}
            </span>
          </div>
        )}
      </div>

      {/* Metrics row */}
      <div className="relative">
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/5 via-background to-secondary/5 blur-3xl -z-10 rounded-full opacity-60" />
        <DashboardMetrics shifts={shifts} staff={staff} />
      </div>

      {/* Main grid — fixed-height row so both cards are equal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: weekly overview (spans 2 cols) */}
        <div className="lg:col-span-2 h-[360px]">
          <WeeklyScheduleOverview
            shifts={shifts}
            weekStart={weekStart}
            weekStartsOn={weekStartsOn}
          />
        </div>
        {/* Right: today's shifts — scrollable within same height */}
        <div className="lg:col-span-1 h-[360px]">
          <TodayScheduleWidget shifts={shifts} staff={staff} />
        </div>
        {/* Bottom: quick actions full-width */}
        <div className="lg:col-span-3">
          <QuickActionsWidget scheduleStatus={schedule?.status} />
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return " morning";
  if (hour < 17) return " afternoon";
  return " evening";
}
