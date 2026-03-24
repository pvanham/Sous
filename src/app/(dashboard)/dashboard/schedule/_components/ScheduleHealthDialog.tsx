"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Star,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { checkManagerCoverage } from "@/server/actions/schedule.actions";
import { listLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { listStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { getWeekDays, formatTimeString } from "@/lib/utils/date";
import { getStationDotColor } from "@/lib/utils/station-colors";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";
import type { ScheduleDTO } from "@/types/schedule";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { KitchenConfigDTO } from "@/types/kitchen-config";
import type { ManagerCoverageGap } from "@/server/services/schedule.service";

// ─── Types ──────────────────────────────────────────────────
interface ScheduleHealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleDTO;
  shifts: ShiftDTO[];
  weekStart: Date;
}

interface OvertimeAlert {
  staffName: string;
  totalHours: number;
  maxHours: number;
}

interface ClopeningAlert {
  staffName: string;
  day: string;
  gapHours: number;
}

interface StationFulfillment {
  station: string;
  required: number;
  filled: number;
  percentage: number;
}

// ─── Query Keys ─────────────────────────────────────────────
const staffKeys = { all: ["staff"] as const, list: () => [...staffKeys.all, "list"] as const };
const kitchenConfigKeys = { all: ["kitchenConfig"] as const };
const laborReqKeys = { all: ["laborRequirements"] as const, list: () => [...laborReqKeys.all, "list"] as const };

// ─── Helpers ────────────────────────────────────────────────

function getShiftDurationHours(shift: ShiftDTO): number {
  const ms = new Date(shift.end).getTime() - new Date(shift.start).getTime();
  return ms / (1000 * 60 * 60);
}

function calculateStaffWeeklyHours(staffId: string, shifts: ShiftDTO[]): number {
  return shifts
    .filter((s) => s.staffId === staffId)
    .reduce((sum, s) => sum + getShiftDurationHours(s), 0);
}

/** Check if a staff member has a manager role. */
function isManager(staff: StaffDTO, managerRoles: string[]): boolean {
  if (managerRoles.length > 0) {
    return staff.roles.some((role) => managerRoles.includes(role));
  }
  return staff.roles.some(
    (role) =>
      role.toLowerCase().includes("manager") ||
      role.toLowerCase() === "gm" ||
      role.toLowerCase() === "km" ||
      role.toLowerCase() === "agm" ||
      role.toLowerCase() === "shift leader" ||
      role.toLowerCase() === "sous chef",
  );
}

// ─── Score Badge ────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const bgClass =
    score >= 85
      ? "from-emerald-500 to-emerald-600 text-white"
      : score >= 60
        ? "from-amber-500 to-amber-600 text-white"
        : "from-red-500 to-red-600 text-white";

  const label = score >= 85 ? "Excellent" : score >= 60 ? "Needs Work" : "Critical";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ${bgClass}`}
      >
        <span className="text-2xl font-bold font-mono tabular-nums">{score}</span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ─── Section Card ───────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: React.ElementType;
  title: string;
  status: "good" | "warning" | "error";
  children: React.ReactNode;
}) {
  const iconColor = {
    good: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  }[status];

  const borderColor = {
    good: "border-emerald-200 dark:border-emerald-800/40",
    warning: "border-amber-200 dark:border-amber-800/40",
    error: "border-red-200 dark:border-red-800/40",
  }[status];

  return (
    <div className={`rounded-xl border ${borderColor} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm font-semibold">{title}</span>
        {status === "good" && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />}
        {status === "warning" && <AlertTriangle className="ml-auto h-4 w-4 text-amber-500" />}
        {status === "error" && <XCircle className="ml-auto h-4 w-4 text-red-500" />}
      </div>
      {children}
    </div>
  );
}

// ─── Progress Bar ───────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-stone-200 dark:bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function ScheduleHealthDialog({
  open,
  onOpenChange,
  schedule,
  shifts,
  weekStart,
}: ScheduleHealthDialogProps) {
  // Fetch all staff
  const { data: allStaff = [] } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: async () => {
      const result = await listStaff();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
  });

  // Fetch kitchen config
  const { data: config = null } = useQuery({
    queryKey: kitchenConfigKeys.all,
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
  });

  // Fetch labor requirements
  const { data: laborReqs = [] } = useQuery({
    queryKey: laborReqKeys.list(),
    queryFn: async () => {
      const result = await listLaborRequirements();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
  });

  // Fetch manager coverage warnings
  const { data: managerWarnings = [], isLoading: isLoadingManager } = useQuery({
    queryKey: ["scheduleHealth", "managerCoverage", schedule.id],
    queryFn: async () => {
      const result = await checkManagerCoverage(schedule.id);
      if (!result.success) return [];
      return result.data.warnings;
    },
    enabled: open && !!schedule.id,
  });

  // ── Computed metrics ──────────────────────────────────────

  const metrics = useMemo(() => {
    if (!config || allStaff.length === 0) return null;

    const weekDays = getWeekDays(weekStart);

    // 1. Labor Fulfillment by station
    const stationFulfillment: StationFulfillment[] = [];
    const stationGroups = new Map<string, { required: number; filled: number }>();

    for (const day of weekDays) {
      const dayOfWeek = day.getDay(); // 0=Sun, 6=Sat
      const dayReqs = laborReqs.filter((r) => r.dayOfWeek === dayOfWeek);
      const dayShifts = shifts.filter((s) => {
        const sDay = new Date(s.start);
        return (
          sDay.getFullYear() === day.getFullYear() &&
          sDay.getMonth() === day.getMonth() &&
          sDay.getDate() === day.getDate()
        );
      });

      for (const req of dayReqs) {
        const existing = stationGroups.get(req.station) ?? { required: 0, filled: 0 };
        existing.required += req.preferredStaff;

        // Count shifts that cover this slot
        const matchingShifts = dayShifts.filter((s) => {
          if (s.station !== req.station) return false;
          const shiftStart = new Date(s.start);
          const shiftEnd = new Date(s.end);
          const shiftStartTime = `${String(shiftStart.getHours()).padStart(2, "0")}:${String(shiftStart.getMinutes()).padStart(2, "0")}`;
          const shiftEndTime = `${String(shiftEnd.getHours()).padStart(2, "0")}:${String(shiftEnd.getMinutes()).padStart(2, "0")}`;
          // Shift covers the requirement if it starts at or before and ends at or after
          return shiftStartTime <= req.startTime && shiftEndTime >= req.endTime;
        });
        existing.filled += Math.min(matchingShifts.length, req.preferredStaff);

        stationGroups.set(req.station, existing);
      }
    }

    for (const [station, data] of stationGroups) {
      stationFulfillment.push({
        station,
        required: data.required,
        filled: data.filled,
        percentage: data.required > 0 ? Math.round((data.filled / data.required) * 100) : 100,
      });
    }

    // 2. Overtime alerts
    const overtimeAlerts: OvertimeAlert[] = [];
    const uniqueStaff = new Set(shifts.map((s) => s.staffId));
    for (const staffId of uniqueStaff) {
      const staff = allStaff.find((s) => s.id === staffId);
      if (!staff) continue;
      const totalHours = Math.round(calculateStaffWeeklyHours(staffId, shifts) * 10) / 10;
      const maxHours = staff.maxHoursPerWeek || 40;
      if (totalHours > maxHours) {
        overtimeAlerts.push({ staffName: staff.name, totalHours, maxHours });
      }
    }

    // 3. Clopening risk
    const clopeningAlerts: ClopeningAlert[] = [];
    const clopeningThreshold =
      config.scheduleGenerationSettings?.clopeningWarningThresholdHours ?? 10;
    const sortedShifts = [...shifts].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    for (const staffId of uniqueStaff) {
      const staffShifts = sortedShifts.filter((s) => s.staffId === staffId);
      const staff = allStaff.find((s) => s.id === staffId);
      if (!staff || staffShifts.length < 2) continue;

      for (let i = 0; i < staffShifts.length - 1; i++) {
        const endTime = new Date(staffShifts[i].end).getTime();
        const nextStart = new Date(staffShifts[i + 1].start).getTime();
        const gapHours = (nextStart - endTime) / (1000 * 60 * 60);
        if (gapHours < clopeningThreshold && gapHours > 0) {
          const nextDay = new Date(staffShifts[i + 1].start);
          clopeningAlerts.push({
            staffName: staff.name,
            day: nextDay.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
            gapHours: Math.round(gapHours * 10) / 10,
          });
        }
      }
    }

    // 4. Staff preference match
    let totalShiftsWithPreference = 0;
    let matchedPreferences = 0;
    for (const shift of shifts) {
      const staff = allStaff.find((s) => s.id === shift.staffId);
      if (!staff || staff.preferredStations.length === 0) continue;
      totalShiftsWithPreference++;
      if (staff.preferredStations.includes(shift.station)) {
        matchedPreferences++;
      }
    }
    const preferenceRate =
      totalShiftsWithPreference > 0
        ? Math.round((matchedPreferences / totalShiftsWithPreference) * 100)
        : 100;

    // 5. Overall score
    // Use weighted labor fulfillment (total filled / total required)
    const totalRequired = stationFulfillment.reduce((sum, f) => sum + f.required, 0);
    const totalFilled = stationFulfillment.reduce((sum, f) => sum + f.filled, 0);
    const overallFulfillment =
      totalRequired > 0 ? (totalFilled / totalRequired) * 100 : 100;

    // Calculate penalties with scaling and caps
    // Cap manager penalty at 40 points
    const managerPenalty = Math.min(40, managerWarnings.length * 10);
    
    // 2 points per hour of overtime, capped at 30 points
    const totalOvertimeHours = overtimeAlerts.reduce((sum, a) => sum + (a.totalHours - a.maxHours), 0);
    const overtimePenalty = Math.min(30, totalOvertimeHours * 2);
    
    // Scale clopening penalty by how short the gap is (3 points per hour short), capped at 30 points
    const totalClopeningShortHours = clopeningAlerts.reduce((sum, a) => sum + Math.max(0, clopeningThreshold - a.gapHours), 0);
    const clopeningPenalty = Math.min(30, totalClopeningShortHours * 3);

    const prefBonus = (preferenceRate / 100) * 15;

    let overallScore = Math.round(
      overallFulfillment * 0.5 + prefBonus + 35 - managerPenalty - overtimePenalty - clopeningPenalty,
    );
    overallScore = Math.max(0, Math.min(100, overallScore));

    // 6. Hour distribution
    const staffHours = Array.from(uniqueStaff).map((staffId) => {
      const staff = allStaff.find((s) => s.id === staffId);
      return {
        name: staff?.name ?? "Unknown",
        hours: Math.round(calculateStaffWeeklyHours(staffId, shifts) * 10) / 10,
        maxHours: staff?.maxHoursPerWeek ?? 40,
        minHours: staff?.minHoursPerWeek ?? 0,
      };
    });

    return {
      stationFulfillment,
      overtimeAlerts,
      clopeningAlerts,
      preferenceRate,
      matchedPreferences,
      totalShiftsWithPreference,
      overallScore,
      staffHours,
    };
  }, [shifts, allStaff, config, laborReqs, weekStart, managerWarnings]);

  const isLoading = isLoadingManager || !config || allStaff.length === 0;
  const hasShifts = shifts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <Activity className="h-4 w-4 text-white" />
            </div>
            Schedule Health Report
          </DialogTitle>
          <DialogDescription>
            Health analysis for the week of{" "}
            {weekStart.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !hasShifts && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="rounded-full bg-muted p-3">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No shifts scheduled this week. Add shifts to see health metrics.
            </p>
          </div>
        )}

        {/* Metrics */}
        {!isLoading && hasShifts && metrics && (
          <div className="space-y-6">
            {/* Overall Score - Full Width */}
            <div className="flex items-center gap-6 py-2">
              <ScoreBadge score={metrics.overallScore} />
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-semibold">Overall Health Score</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Based on labor fulfillment, staff preferences, manager coverage, overtime, and
                  clopening risks.
                </p>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Two Column Grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Left Column: Lists/Fulfillment */}
              <div className="space-y-6">
                {/* Labor Fulfillment */}
            {metrics.stationFulfillment.length > 0 && (
              <SectionCard
                icon={TrendingUp}
                title="Labor Fulfillment"
                status={
                  metrics.stationFulfillment.every((f) => f.percentage >= 80)
                    ? "good"
                    : metrics.stationFulfillment.some((f) => f.percentage < 50)
                      ? "error"
                      : "warning"
                }
              >
                <div className="space-y-3">
                  {metrics.stationFulfillment.map((sf) => {
                    const stationColor = getStationDotColor(sf.station);
                    return (
                      <div key={sf.station} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: stationColor }}
                              />
                            <span className="font-medium capitalize">{sf.station}</span>
                          </div>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {sf.filled}/{sf.required} slots ({sf.percentage}%)
                          </span>
                        </div>
                        <ProgressBar
                          value={sf.percentage}
                          color={
                            sf.percentage >= 80
                              ? "bg-emerald-500"
                              : sf.percentage >= 50
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Staff Hours Overview */}
            {metrics.staffHours.length > 0 && (
              <SectionCard icon={Users} title="Staff Hours Summary" status="good">
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {metrics.staffHours
                    .sort((a, b) => b.hours - a.hours)
                    .map((sh, i) => {
                      const pct = sh.maxHours > 0 ? (sh.hours / sh.maxHours) * 100 : 0;
                      const isOver = sh.hours > sh.maxHours;
                      const isNear = pct >= 90 && !isOver;
                      const isUnder = sh.minHours > 0 && sh.hours < sh.minHours;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium truncate max-w-[140px]">{sh.name}</span>
                            <span
                              className={`font-mono tabular-nums ${
                                isOver
                                  ? "text-red-600 dark:text-red-400 font-semibold"
                                  : isNear
                                    ? "text-amber-600 dark:text-amber-400"
                                    : isUnder
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-muted-foreground"
                              }`}
                            >
                              {sh.hours}h / {sh.maxHours}h
                              {isUnder && ` (min ${sh.minHours}h)`}
                            </span>
                          </div>
                          <ProgressBar
                            value={pct}
                            color={
                              isOver
                                ? "bg-red-500"
                                : isNear
                                  ? "bg-amber-500"
                                  : isUnder
                                    ? "bg-blue-400"
                                    : "bg-emerald-500"
                            }
                          />
                        </div>
                      );
                    })}
                </div>
              </SectionCard>
            )}
            </div> {/* End Left Column */}

            {/* Right Column: Warnings and Preferences */}
            <div className="space-y-6">
            {/* Manager Coverage */}
            <SectionCard
              icon={ShieldAlert}
              title="Manager Coverage"
              status={managerWarnings.length === 0 ? "good" : "warning"}
            >
              {managerWarnings.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All operating hours have manager coverage.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {managerWarnings.length} day{managerWarnings.length > 1 ? "s" : ""} with manager
                    coverage gaps:
                  </p>
                  {managerWarnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2 text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />
                      <div>
                        <span className="font-medium">{w.day}</span>
                        <span className="text-muted-foreground">
                          {" — "}
                          {w.gaps
                            .map(
                              (g) => `${formatTimeString(g.start)} – ${formatTimeString(g.end)}`,
                            )
                            .join(", ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Overtime Alerts */}
            <SectionCard
              icon={Clock}
              title="Overtime"
              status={
                metrics.overtimeAlerts.length === 0
                  ? "good"
                  : "error"
              }
            >
              {metrics.overtimeAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No staff members are scheduled over their maximum hours.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {metrics.overtimeAlerts.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs"
                    >
                      <span className="font-medium">{a.staffName}</span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        {a.totalHours}h / {a.maxHours}h max
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Clopening Alerts */}
            <SectionCard
              icon={AlertTriangle}
              title="Clopening Risk"
              status={
                metrics.clopeningAlerts.length === 0
                  ? "good"
                  : "warning"
              }
            >
              {metrics.clopeningAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No close-to-open turnarounds below threshold.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {metrics.clopeningAlerts.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs"
                    >
                      <span>
                        <span className="font-medium">{a.staffName}</span>{" "}
                        <span className="text-muted-foreground">on {a.day}</span>
                      </span>
                      <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {a.gapHours}h gap
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Staff Preferences */}
            <SectionCard
              icon={Star}
              title="Staff Preference Match"
              status={metrics.preferenceRate >= 70 ? "good" : metrics.preferenceRate >= 40 ? "warning" : "error"}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {metrics.matchedPreferences} of {metrics.totalShiftsWithPreference} shifts match
                    preferred stations
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {metrics.preferenceRate}%
                  </span>
                </div>
                <ProgressBar
                  value={metrics.preferenceRate}
                  color={
                    metrics.preferenceRate >= 70
                      ? "bg-emerald-500"
                      : metrics.preferenceRate >= 40
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }
                />
              </div>
            </SectionCard>

            </div> {/* End Right Column */}
            </div> {/* End Grid */}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
