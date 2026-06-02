import { format } from "date-fns";
import { CalendarDays, Clock, Users, TrendingUp } from "lucide-react";
import { computeAnnouncementLifecycle } from "@/types/announcement";
import { currentUser } from "@clerk/nextjs/server";
import { getWeekStart } from "@/lib/utils/date";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getScheduleByWeek } from "@/server/actions/schedule.actions";
import { listShiftsForLocationWeek } from "@/server/actions/shift.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { listAnnouncements } from "@/server/actions/announcement.actions";
import { listExchangeShiftsForManager } from "@/server/actions/exchange-shift.actions";
import { listTimeOffRequests } from "@/server/actions/time-off-request.actions";
import type { ShiftDTO } from "@/types/shift";
import type { ScheduleDTO } from "@/types/schedule";
import type { AnnouncementDTO } from "@/types/announcement";
import type { ExchangeShiftDTO } from "@/types/exchange-shift";
import type { TimeOffRequestDTO } from "@/types/time-off-request";

import { OnboardingCompleteBanner } from "./_components/OnboardingCompleteBanner";
import { TodayScheduleWidget } from "./_components/TodayScheduleWidget";
import { WeeklyScheduleOverview } from "./_components/WeeklyScheduleOverview";
import { AnnouncementsWidget } from "./_components/AnnouncementsWidget";
import { PendingExchangesWidget } from "./_components/PendingExchangesWidget";
import { PendingTimeOffWidget } from "./_components/PendingTimeOffWidget";

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
  // the widgets after a `weekStartsOn` flip. The action-item widgets
  // (time-off, exchange) surface the buckets that need a manager's
  // attention; announcements show the location's active feed.
  const [
    scheduleResult,
    shiftsResult,
    staffResult,
    announcementsResult,
    exchangesResult,
    timeOffResult,
    user,
  ] = await Promise.all([
    getScheduleByWeek({ weekStartDate: weekStart }),
    listShiftsForLocationWeek({ weekStartDate: weekStart }),
    listStaff(),
    listAnnouncements({ limit: 50 }),
    listExchangeShiftsForManager({ status: "pending_coverage" }),
    listTimeOffRequests(),
    currentUser(),
  ]);

  const schedule: ScheduleDTO | null = scheduleResult.success
    ? scheduleResult.data
    : null;
  const staff = staffResult.success ? staffResult.data : [];
  const shifts: ShiftDTO[] = shiftsResult.success ? shiftsResult.data : [];
  const now = new Date();
  const announcements: AnnouncementDTO[] = (
    announcementsResult.success ? announcementsResult.data : []
  )
    .filter((a) => computeAnnouncementLifecycle(a, now) === "active")
    .sort((a, b) => {
      const aDate = a.publishDate ?? a.createdAt;
      const bDate = b.publishDate ?? b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, 10);
  const pendingExchanges: ExchangeShiftDTO[] = exchangesResult.success
    ? exchangesResult.data
    : [];
  // The manager dashboard only cares about requests awaiting a decision;
  // approved/denied rows live on the dedicated time-off page.
  const pendingTimeOff: TimeOffRequestDTO[] = (
    timeOffResult.success ? timeOffResult.data : []
  )
    .filter((request) => request.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

  const firstName = user?.firstName ?? "there";

  // Weekly metrics (previously in DashboardMetrics client component)
  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((acc, shift) => {
    return acc + (new Date(shift.end).getTime() - new Date(shift.start).getTime()) / 3_600_000;
  }, 0);
  const uniqueStaffIds = new Set(shifts.map((s) => s.staffId));
  const staffScheduled = uniqueStaffIds.size;
  const activeStaff = staff.filter((s) => s.isActive).length;
  const avgShiftHours = totalShifts > 0 ? (totalHours / totalShifts).toFixed(1) : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <OnboardingCompleteBanner />

      {/* Header — greeting + inline weekly metrics + schedule badge */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Good{getGreeting()},{" "}
            <span className="text-primary">{firstName}</span>
          </h1>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {/* Context label */}
          <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest leading-none">
            This week · {format(weekStart, "MMM d")}–{format(new Date(weekStart.getTime() + 6 * 86_400_000), "MMM d")}
          </p>

          <div className="flex items-stretch gap-2 flex-wrap justify-end">
            {/* Compact metrics strip */}
            <div className="flex items-stretch divide-x divide-stone-300 dark:divide-white/10 rounded-lg border border-stone-300 dark:border-white/10 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2">
                <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold tabular-nums text-foreground leading-none">
                    {totalShifts > 0 ? totalShifts : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">shifts</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-bold tabular-nums text-foreground leading-none">
                    {totalHours > 0 ? `${Math.round(totalHours)}h` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">labor</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2">
                <Users className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold tabular-nums text-foreground leading-none">
                    {activeStaff > 0 ? `${staffScheduled}/${activeStaff}` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">scheduled</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2">
                <TrendingUp className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold tabular-nums text-foreground leading-none">
                    {avgShiftHours ? `${avgShiftHours}h` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">avg shift</p>
                </div>
              </div>
            </div>

            {/* Schedule status badge */}
            {schedule && (
              <span
                className={`inline-flex items-center gap-1.5 self-stretch rounded-lg px-3 text-xs font-semibold border ${
                  schedule.status === "PUBLISHED"
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-400 dark:border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400 dark:border-amber-500/30"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${schedule.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>
                  Schedule
                  <span className="font-normal opacity-60 mx-1">·</span>
                  {schedule.status === "PUBLISHED" ? "Published" : "Draft"}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zone 1 — Today's shifts + staffing curve */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:h-[400px]">
          <TodayScheduleWidget shifts={shifts} staff={staff} />
        </div>
        <div className="lg:col-span-2 lg:h-[400px]">
          <WeeklyScheduleOverview
            shifts={shifts}
            weekStart={weekStart}
            weekStartsOn={weekStartsOn}
          />
        </div>
      </div>

      {/* Zone 2 — Action items + announcements */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:h-[360px]">
          <PendingTimeOffWidget requests={pendingTimeOff} staff={staff} />
        </div>
        <div className="lg:h-[360px]">
          <PendingExchangesWidget exchanges={pendingExchanges} />
        </div>
        <div className="lg:h-[360px]">
          <AnnouncementsWidget announcements={announcements} />
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
