"use client";

import { useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  Cpu,
  User,
  UserMinus,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  XCircle,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStationClasses } from "@/lib/utils/station-colors";
import { formatTimeString } from "@/lib/utils/date";
import type {
  GeneratedSchedule,
  GeneratedDaySchedule,
  GeneratedShiftAssignment,
  UnfilledSlot,
  ValidationWarning,
  ValidationWarningType,
} from "@/types/ai-scheduling";

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface GeneratedShiftPreviewProps {
  generatedSchedule: GeneratedSchedule;
  isAccepting: boolean;
  onAcceptAll: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

// ────────────────────────────────────────────────────────────
// Warning type display configuration
// ────────────────────────────────────────────────────────────

const WARNING_CONFIG: Record<
  ValidationWarningType,
  { label: string; icon: typeof AlertTriangle }
> = {
  overtime_risk: { label: "Overtime Risk", icon: Clock },
  clopening_risk: { label: "Clopening Risk", icon: AlertTriangle },
  under_scheduled: { label: "Under-Scheduled", icon: UserMinus },
};

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

/**
 * GeneratedShiftPreview - Displays a generated schedule for review.
 *
 * Shows day-by-day shift assignments with reasoning, warnings,
 * unfilled slots, and summary statistics. Provides "Regenerate"
 * and "Accept All" actions.
 *
 * UI Layer only: no database imports, no business logic.
 */
export function GeneratedShiftPreview({
  generatedSchedule,
  isAccepting,
  onAcceptAll,
  onRegenerate,
  onCancel,
}: GeneratedShiftPreviewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    new Set(generatedSchedule.days.map((d) => d.date))
  );

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const { metadata, warnings, days } = generatedSchedule;

  const warningsByType = groupWarningsByType(warnings);
  const totalHours = calculateTotalHours(days);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryStatCard
          label="Total Shifts"
          value={metadata.totalShiftsCreated}
        />
        <SummaryStatCard
          label="Total Hours"
          value={`${totalHours.toFixed(1)}h`}
        />
        <SummaryStatCard
          label="Unfilled Slots"
          value={metadata.totalUnfilledSlots}
          variant={metadata.totalUnfilledSlots > 0 ? "warning" : "default"}
        />
        <SummaryStatCard
          label="Week Score"
          value={metadata.weekScore}
        />
      </div>

      {/* Generation metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span>
          Generated in {(metadata.generationTimeMs / 1000).toFixed(1)}s
        </span>
        <Badge variant="secondary">
          <Cpu className="mr-1 h-3 w-3" />
          CP Solver
        </Badge>
      </div>

      {/* Preferred station matches (positive stat) */}
      {metadata.totalAssignmentsWithPreference > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Star className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm text-emerald-700 dark:text-emerald-300">
            <span className="font-medium">
              {metadata.preferredStationMatches}/{metadata.totalAssignmentsWithPreference}
            </span>
            {" "}shifts matched staff preferred stations
          </span>
        </div>
      )}

      {/* Warnings section */}
      {warnings.length > 0 && (
        <WarningsSection warningsByType={warningsByType} />
      )}

      {/* Day-by-day schedule */}
      <div className="space-y-2">
        {days.map((day) => (
          <DaySection
            key={day.date}
            day={day}
            isExpanded={expandedDays.has(day.date)}
            onToggle={() => toggleDay(day.date)}
          />
        ))}
      </div>

      {/* Summary */}
      {generatedSchedule.summary && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Summary
              </p>
              <p className="text-sm">{generatedSchedule.summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isAccepting}>
          Cancel
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={isAccepting}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
        <Button
          onClick={onAcceptAll}
          disabled={isAccepting || metadata.totalShiftsCreated === 0}
        >
          {isAccepting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Accept All ({metadata.totalShiftsCreated} shifts)
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Day Section
// ────────────────────────────────────────────────────────────

interface DaySectionProps {
  day: GeneratedDaySchedule;
  isExpanded: boolean;
  onToggle: () => void;
}

function DaySection({ day, isExpanded, onToggle }: DaySectionProps) {
  return (
    <div className="rounded-lg border">
      {/* Day header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{day.dayOfWeek}</span>
          <span className="text-xs text-muted-foreground">{day.date}</span>
          <Badge variant="secondary" className="text-xs">
            {day.assignments.length} shifts
          </Badge>
          {day.unfilledSlots.length > 0 && (
            <Badge variant="warning" className="text-xs">
              {day.unfilledSlots.length} unfilled
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Day content */}
      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {/* Shift assignments */}
          {day.assignments.length > 0 ? (
            <div className="space-y-1.5">
              {day.assignments.map((assignment, idx) => (
                <ShiftAssignmentRow
                  key={`${assignment.staffId}-${idx}`}
                  assignment={assignment}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No shifts generated for this day.
            </p>
          )}

          {/* Unfilled slots */}
          {day.unfilledSlots.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Unfilled Slots
              </p>
              {day.unfilledSlots.map((slot, idx) => (
                <UnfilledSlotRow key={idx} slot={slot} />
              ))}
            </div>
          )}

          {/* Day notes */}
          {day.notes && (
            <p className="text-xs text-muted-foreground italic mt-2">
              {day.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shift Assignment Row
// ────────────────────────────────────────────────────────────

function ShiftAssignmentRow({
  assignment,
}: {
  assignment: GeneratedShiftAssignment;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center justify-between rounded p-2 ${getStationClasses(
              assignment.station
            )}`}
          >
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm font-medium">
                {assignment.staffName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {assignment.station}
              </Badge>
              <span className="text-xs font-mono">
                {formatTimeString(assignment.startTime)} -{" "}
                {formatTimeString(assignment.endTime)}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">
            <span className="font-medium">Reasoning:</span>{" "}
            {assignment.reasoning}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ────────────────────────────────────────────────────────────
// Unfilled Slot Row
// ────────────────────────────────────────────────────────────

function UnfilledSlotRow({ slot }: { slot: UnfilledSlot }) {
  return (
    <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {slot.station} {formatTimeString(slot.startTime)} -{" "}
            {formatTimeString(slot.endTime)}
          </span>
          <span className="text-muted-foreground">
            (needed {slot.needed}, assigned {slot.assigned})
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5">{slot.reason}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Warnings Section
// ────────────────────────────────────────────────────────────

function WarningsSection({
  warningsByType,
}: {
  warningsByType: Map<ValidationWarningType, ValidationWarning[]>;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <h4 className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Warnings ({[...warningsByType.values()].reduce(
          (sum, arr) => sum + arr.length,
          0
        )})
      </h4>
      {[...warningsByType.entries()].map(([type, warnings]) => {
        const config = WARNING_CONFIG[type];
        const IconComponent = config.icon;
        return (
          <div key={type} className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <IconComponent className="h-3.5 w-3.5" />
              {config.label} ({warnings.length})
            </div>
            {warnings.map((warning, idx) => (
              <p
                key={idx}
                className="text-xs text-amber-600 dark:text-amber-400 pl-5"
              >
                {warning.message}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Summary Stat Card
// ────────────────────────────────────────────────────────────

function SummaryStatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        variant === "warning" && Number(value) > 0
          ? "border-amber-500/30 bg-amber-500/5"
          : "bg-muted/30"
      }`}
    >
      <p
        className={`text-lg font-semibold ${
          variant === "warning" && Number(value) > 0
            ? "text-amber-600 dark:text-amber-400"
            : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────

/**
 * Group validation warnings by their type.
 */
function groupWarningsByType(
  warnings: ValidationWarning[]
): Map<ValidationWarningType, ValidationWarning[]> {
  const grouped = new Map<ValidationWarningType, ValidationWarning[]>();

  for (const warning of warnings) {
    const existing = grouped.get(warning.type) ?? [];
    existing.push(warning);
    grouped.set(warning.type, existing);
  }

  return grouped;
}

/**
 * Calculate total scheduled hours across all days.
 */
function calculateTotalHours(days: GeneratedDaySchedule[]): number {
  let totalMinutes = 0;

  for (const day of days) {
    for (const assignment of day.assignments) {
      const [startH, startM] = assignment.startTime.split(":").map(Number);
      const [endH, endM] = assignment.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      totalMinutes += endMinutes - startMinutes;
    }
  }

  return totalMinutes / 60;
}
