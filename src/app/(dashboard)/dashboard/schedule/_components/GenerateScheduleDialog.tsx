"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Users,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  checkGenerationReadiness,
  generateSchedule,
  acceptGeneratedSchedule,
} from "@/server/actions/schedule-generation.actions";
import { formatWeekLabel } from "@/lib/utils/date";
import type { ScheduleDTO } from "@/types/schedule";
import type {
  GeneratedSchedule,
  ReadinessCheckResult,
  ReadinessIssue,
  AcceptedShift,
} from "@/types/ai-scheduling";
import { GeneratedShiftPreview } from "./GeneratedShiftPreview";

// ────────────────────────────────────────────────────────────
// Dialog step type
// ────────────────────────────────────────────────────────────

type DialogStep = "readiness" | "generating" | "preview" | "failure";

// ────────────────────────────────────────────────────────────
// Query keys
// ────────────────────────────────────────────────────────────

const shiftKeys = {
  all: ["shifts"] as const,
  bySchedule: (scheduleId: string) =>
    [...shiftKeys.all, "schedule", scheduleId] as const,
};

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface GenerateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleDTO;
  weekStart: Date;
  onAccept: () => void;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

/**
 * GenerateScheduleDialog - Multi-step dialog for AI schedule generation.
 *
 * Steps:
 * 1. Readiness Check - verifies data completeness before generation
 * 2. Generating - shows progress while AI generates the schedule
 * 3. Preview - displays generated shifts for review (uses GeneratedShiftPreview)
 * 4. Failure - graceful failure with partial results and recovery options
 *
 * Follows UI Layer rules: no DB imports, calls server actions only via
 * TanStack Query mutations. All data passed as DTOs.
 */
export function GenerateScheduleDialog({
  open,
  onOpenChange,
  schedule,
  weekStart,
  onAccept,
}: GenerateScheduleDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<DialogStep>("readiness");
  const [generatedSchedule, setGeneratedSchedule] =
    useState<GeneratedSchedule | null>(null);

  // Reset state when dialog opens/closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // Reset on close
        setStep("readiness");
        setGeneratedSchedule(null);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  // ── Step 1: Readiness check query ──
  const {
    data: readiness,
    isLoading: isCheckingReadiness,
    error: readinessError,
    refetch: refetchReadiness,
  } = useQuery({
    queryKey: ["schedule-generation", "readiness", schedule.id],
    queryFn: async () => {
      const result = await checkGenerationReadiness({
        scheduleId: schedule.id,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open && step === "readiness",
    staleTime: 30_000, // Cache for 30 seconds
  });

  // ── Step 2: Generate mutation ──
  const generateMutation = useMutation({
    mutationFn: async () => {
      const result = await generateSchedule({ scheduleId: schedule.id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      setGeneratedSchedule(data);

      // Check if generation was mostly successful
      const totalRequired =
        data.days.reduce(
          (sum, day) =>
            sum +
            day.assignments.length +
            day.unfilledSlots.reduce((s, slot) => s + slot.needed, 0),
          0
        ) || 1;
      const totalFilled = data.metadata.totalShiftsCreated;
      const fillRate = totalFilled / totalRequired;

      if (totalFilled === 0) {
        setStep("failure");
      } else if (fillRate < 0.5) {
        // Less than 50% filled -- show as failure with partial results
        setStep("failure");
      } else {
        setStep("preview");
      }
    },
    onError: () => {
      setStep("failure");
    },
  });

  // ── Step 3: Accept mutation ──
  const acceptMutation = useMutation({
    mutationFn: async (shifts: AcceptedShift[]) => {
      const result = await acceptGeneratedSchedule({
        scheduleId: schedule.id,
        shifts,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.failed > 0) {
        toast.success(
          `Created ${data.created} shifts (${data.failed} skipped due to conflicts)`
        );
      } else {
        toast.success(`Created ${data.created} shifts`);
      }

      // Invalidate shift cache to refresh the schedule grid
      queryClient.invalidateQueries({
        queryKey: shiftKeys.bySchedule(schedule.id),
      });

      onAccept();
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // ── Handlers ──

  const handleGenerate = () => {
    setStep("generating");
    generateMutation.mutate();
  };

  const handleAcceptAll = () => {
    if (!generatedSchedule) return;

    // Flatten all day assignments into AcceptedShift format
    const shifts: AcceptedShift[] = generatedSchedule.days.flatMap((day) =>
      day.assignments.map((assignment) => ({
        staffId: assignment.staffId,
        station: assignment.station,
        date: day.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      }))
    );

    if (shifts.length === 0) {
      toast.error("No shifts to accept");
      return;
    }

    acceptMutation.mutate(shifts);
  };

  const handleRegenerate = () => {
    setGeneratedSchedule(null);
    setStep("generating");
    generateMutation.mutate();
  };

  const handleSavePartial = () => {
    // Same as accept all -- save whatever was generated
    handleAcceptAll();
  };

  // ── Render ──

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {step === "readiness" && (
          <ReadinessStep
            readiness={readiness ?? null}
            isLoading={isCheckingReadiness}
            error={readinessError}
            weekLabel={formatWeekLabel(weekStart)}
            onGenerate={handleGenerate}
            onRefresh={() => refetchReadiness()}
            onCancel={() => handleOpenChange(false)}
          />
        )}

        {step === "generating" && (
          <GeneratingStep weekLabel={formatWeekLabel(weekStart)} />
        )}

        {step === "preview" && generatedSchedule && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Generated Schedule
              </DialogTitle>
              <DialogDescription>
                Review the AI-generated schedule for{" "}
                {formatWeekLabel(weekStart)}. Accept all shifts to save them.
              </DialogDescription>
            </DialogHeader>

            <GeneratedShiftPreview
              generatedSchedule={generatedSchedule}
              isAccepting={acceptMutation.isPending}
              onAcceptAll={handleAcceptAll}
              onRegenerate={handleRegenerate}
              onCancel={() => handleOpenChange(false)}
            />
          </>
        )}

        {step === "failure" && (
          <FailureStep
            generatedSchedule={generatedSchedule}
            error={generateMutation.error}
            weekLabel={formatWeekLabel(weekStart)}
            isAccepting={acceptMutation.isPending}
            onSavePartial={handleSavePartial}
            onRegenerate={handleRegenerate}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────
// Step 1: Readiness Check
// ────────────────────────────────────────────────────────────

interface ReadinessStepProps {
  readiness: ReadinessCheckResult | null;
  isLoading: boolean;
  error: Error | null;
  weekLabel: string;
  onGenerate: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}

function ReadinessStep({
  readiness,
  isLoading,
  error,
  weekLabel,
  onGenerate,
  onRefresh,
  onCancel,
}: ReadinessStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Generate Schedule
        </DialogTitle>
        <DialogDescription>
          Pre-generation checklist for {weekLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Running readiness checks...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onRefresh}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {readiness && (
          <>
            {/* Usage summary */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">AI Generations</span>
                <Badge
                  variant={readiness.usageRemaining > 0 ? "info" : "destructive"}
                >
                  {readiness.usageRemaining} of {readiness.usageLimit} remaining
                </Badge>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Active Staff"
                value={readiness.activeStaffCount}
              />
              <StatCard
                label="Availability"
                value={`${readiness.availabilityCompleteness}%`}
              />
              <StatCard
                label="Shift Slots"
                value={readiness.totalRequirements}
              />
            </div>

            {/* Issues list */}
            {readiness.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Issues Found
                </h4>
                {readiness.issues.map((issue, idx) => (
                  <ReadinessIssueRow key={idx} issue={issue} />
                ))}
              </div>
            )}

            {readiness.issues.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  All checks passed. Ready to generate!
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={onGenerate}
          disabled={isLoading || !readiness?.canProceed}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generate Schedule
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogFooter>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Step 2: Generating
// ────────────────────────────────────────────────────────────

interface GeneratingStepProps {
  weekLabel: string;
}

function GeneratingStep({ weekLabel }: GeneratingStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Generating Schedule
        </DialogTitle>
        <DialogDescription>
          Creating an optimized schedule for {weekLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">
            Analyzing staff, shift slots, and availability...
          </p>
          <p className="text-xs text-muted-foreground">
            This typically takes 30-90 seconds depending on schedule complexity.
          </p>
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Step 4: Failure with partial results
// ────────────────────────────────────────────────────────────

interface FailureStepProps {
  generatedSchedule: GeneratedSchedule | null;
  error: Error | null;
  weekLabel: string;
  isAccepting: boolean;
  onSavePartial: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

function FailureStep({
  generatedSchedule,
  error,
  weekLabel,
  isAccepting,
  onSavePartial,
  onRegenerate,
  onCancel,
}: FailureStepProps) {
  const totalShifts = generatedSchedule?.metadata.totalShiftsCreated ?? 0;
  const totalUnfilled = generatedSchedule?.metadata.totalUnfilledSlots ?? 0;
  const totalRequired = totalShifts + totalUnfilled;
  const fillRate = totalRequired > 0 ? totalShifts / totalRequired : 0;
  const canSavePartial = fillRate >= 0.8 && totalShifts > 0;

  // Collect all unfilled slots across all days
  const allUnfilledSlots =
    generatedSchedule?.days.flatMap((day) =>
      day.unfilledSlots.map((slot) => ({
        ...slot,
        day: day.dayOfWeek,
        date: day.date,
      }))
    ) ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Generation Incomplete
        </DialogTitle>
        <DialogDescription>
          Schedule generation for {weekLabel} had issues
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Error message if complete failure */}
        {error && !generatedSchedule && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        )}

        {/* Partial results summary */}
        {generatedSchedule && (
          <>
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium">
                Filled {totalShifts} of {totalRequired} required shifts
                <span className="ml-2 text-muted-foreground">
                  ({Math.round(fillRate * 100)}%)
                </span>
              </p>
              {totalUnfilled > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalUnfilled} slots couldn&apos;t be filled due to
                  availability or skill constraints
                </p>
              )}
            </div>

            {/* Unfilled slots list */}
            {allUnfilledSlots.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Unfilled Slots</h4>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {allUnfilledSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded border bg-amber-500/5 p-2 text-xs"
                    >
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <div>
                        <span className="font-medium">
                          {slot.day} {slot.startTime}-{slot.endTime}{" "}
                          {slot.station}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {slot.reason} (needed {slot.needed}, assigned{" "}
                          {slot.assigned})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Recovery options */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">What you can do</h4>
          <div className="grid gap-2">
            <Link
              href="/dashboard/labor"
              className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>Adjust Shift Slots</span>
            </Link>
            <Link
              href="/dashboard/staff"
              className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Review Staff Availability</span>
            </Link>
          </div>
        </div>
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" onClick={onRegenerate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
        {canSavePartial && (
          <Button onClick={onSavePartial} disabled={isAccepting}>
            {isAccepting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Save as Draft ({totalShifts} shifts)
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Shared sub-components
// ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ReadinessIssueRow({ issue }: { issue: ReadinessIssue }) {
  const isBlocker = issue.severity === "blocker";
  const [expanded, setExpanded] = useState(false);
  const hasDetails = issue.details && issue.details.length > 0;

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        isBlocker
          ? "border-destructive/50 bg-destructive/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-2">
        {isBlocker ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
        <div className="flex-1">
          <span className={isBlocker ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
            {issue.message}
          </span>
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-2 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? "Hide names" : "Show names"}
            </button>
          )}
        </div>
        <Badge variant={isBlocker ? "destructive" : "warning"} className="shrink-0">
          {isBlocker ? "Required" : "Warning"}
        </Badge>
      </div>
      {hasDetails && expanded && (
        <ul className="mt-2 ml-6 space-y-0.5">
          {issue.details!.map((detail, i) => (
            <li
              key={i}
              className={`text-xs ${isBlocker ? "text-destructive/80" : "text-amber-600 dark:text-amber-400"}`}
            >
              {detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
