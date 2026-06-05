"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Users,
  ArrowRight,
  Cpu,
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
  generateBaseSchedule,
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

type DialogStep =
  | "readiness"
  | "generating"
  | "preview"
  | "failure"
  | "fully-scheduled";

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
 * GenerateScheduleDialog - Multi-step dialog for schedule generation.
 *
 * Flow: Readiness Check -> Generate (CP Solver) -> Preview -> Accept
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
  const [generationSettled, setGenerationSettled] = useState<
    "idle" | "success" | "error"
  >("idle");

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setStep("readiness");
        setGeneratedSchedule(null);
        setGenerationSettled("idle");
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  // Called by GeneratingStep after the bar animates to 100%.
  const handleGenerationComplete = useCallback(() => {
    if (generationSettled === "error") {
      setStep("failure");
      return;
    }
    if (!generatedSchedule) {
      setStep("failure");
      return;
    }
    const trueTotalRequired = generatedSchedule.days.reduce(
      (sum, day) =>
        sum +
        day.assignments.length +
        day.unfilledSlots.reduce((s, slot) => s + slot.needed, 0),
      0
    );
    if (trueTotalRequired === 0) {
      setStep("fully-scheduled");
    } else {
      const totalFilled = generatedSchedule.metadata.totalShiftsCreated;
      const fillRate = totalFilled / trueTotalRequired;
      if (totalFilled === 0 || fillRate < 0.5) {
        setStep("failure");
      } else {
        setStep("preview");
      }
    }
  }, [generationSettled, generatedSchedule]);

  // ── Readiness check query ──
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
    staleTime: 30_000,
  });

  // ── Base generation mutation ──
  const generateMutation = useMutation({
    mutationFn: async () => {
      const result = await generateBaseSchedule({
        scheduleId: schedule.id,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      // Store the result but do NOT call setStep here.
      // GeneratingStep will animate the bar to 100% and then call
      // handleGenerationComplete, which performs the step transition.
      setGeneratedSchedule(data);
      setGenerationSettled("success");
    },
    onError: () => {
      setGenerationSettled("error");
    },
  });

  // ── Accept mutation ──
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
    setGenerationSettled("idle");
    setStep("generating");
    generateMutation.mutate();
  };

  const handleRegenerate = () => {
    setGeneratedSchedule(null);
    setGenerationSettled("idle");
    setStep("generating");
    generateMutation.mutate();
  };

  const handleAcceptAll = () => {
    if (!generatedSchedule) return;

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

  const handleSavePartial = () => {
    handleAcceptAll();
  };

  // ── Render ──

  const weekLabel = formatWeekLabel(weekStart);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Universal gradient for AI icons */}
        <svg width="0" height="0" className="absolute">
          <linearGradient id="ai-icon-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59f0b" offset="0%" />
            <stop stopColor="#e11d48" offset="100%" />
          </linearGradient>
        </svg>

        {step === "readiness" && (
          <ReadinessStep
            readiness={readiness ?? null}
            isLoading={isCheckingReadiness}
            error={readinessError}
            weekLabel={weekLabel}
            onGenerate={handleGenerate}
            onRefresh={() => refetchReadiness()}
            onCancel={() => handleOpenChange(false)}
          />
        )}

        {step === "generating" && (
          <GeneratingStep
            weekLabel={weekLabel}
            settled={generationSettled !== "idle"}
            onComplete={handleGenerationComplete}
          />
        )}

        {step === "preview" && generatedSchedule && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" style={{ stroke: "url(#ai-icon-gradient)" }} />
                Generated Schedule
              </DialogTitle>
              <DialogDescription>
                Review the generated schedule for {weekLabel}. Accept all shifts to save them.
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
            error={generateMutation.error ?? null}
            weekLabel={weekLabel}
            isAccepting={acceptMutation.isPending}
            onSavePartial={handleSavePartial}
            onRegenerate={handleGenerate}
            onCancel={() => handleOpenChange(false)}
          />
        )}

        {step === "fully-scheduled" && (
          <FullyScheduledStep
            weekLabel={weekLabel}
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
          <Cpu className="h-5 w-5" style={{ stroke: "url(#ai-icon-gradient)" }} />
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
              <div className="space-y-2 mt-4">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Issues Found
                </h4>
                {readiness.issues.map((issue, idx) => (
                  <ReadinessIssueRow key={idx} issue={issue} />
                ))}
              </div>
            )}

            {readiness.issues.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mt-4">
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
          <Cpu className="mr-2 h-4 w-4" />
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

// Threshold-based step messages (elapsed ms when each message activates).
// Thresholds are spread across the realistic 0–30s solve window.
const GENERATION_STEPS = [
  { message: "Analyzing labor requirements...", threshold: 0 },
  { message: "Checking staff availability...", threshold: 3_000 },
  { message: "Loading kitchen configuration...", threshold: 7_000 },
  { message: "Running constraints solver...", threshold: 12_000 },
  { message: "Balancing schedule constraints...", threshold: 20_000 },
  { message: "Optimizing shift assignments...", threshold: 28_000 },
];

// Exponential approach: progress = CEILING * (1 - e^(-elapsed / TAU))
// TAU = 11 000 ms → ~34% at 5 s, ~69% at 15 s, ~86% at 30 s.
// The bar is always increasing — no hardcoded ceiling that causes flatline.
const PROGRESS_CEILING = 92;
const PROGRESS_TAU = 11_000;

interface GeneratingStepProps {
  weekLabel: string;
  /** True once the mutation has resolved (success or error). */
  settled: boolean;
  /** Called after the bar finishes animating to 100%. */
  onComplete: () => void;
}

function GeneratingStep({ weekLabel, settled, onComplete }: GeneratingStepProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Keep a stable ref so the settle timeout always calls the latest onComplete
  // without needing it in the effect dep array (avoids teardown/restart).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Asymptotic progress animation while the solver is running.
  // Cleans up (stops the interval) as soon as settled becomes true.
  useEffect(() => {
    if (settled) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      setProgress(PROGRESS_CEILING * (1 - Math.exp(-elapsed / PROGRESS_TAU)));

      // Advance the step label based on elapsed time thresholds.
      let activeStep = 0;
      for (let i = 0; i < GENERATION_STEPS.length; i++) {
        if (elapsed >= GENERATION_STEPS[i].threshold) activeStep = i;
      }
      setStepIndex(activeStep);
    }, 100);

    return () => clearInterval(interval);
  }, [settled]);

  // When settled, fill the bar to 100% then transition to the next dialog step.
  // setProgress is called inside rAF (not the effect body) to satisfy the linter.
  useEffect(() => {
    if (!settled) return;

    const frame = requestAnimationFrame(() => setProgress(100));
    const timeout = setTimeout(() => onCompleteRef.current(), 450);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [settled]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Cpu className="h-5 w-5 animate-pulse" style={{ stroke: "url(#ai-icon-gradient)" }} />
          Generating Schedule
        </DialogTitle>
        <DialogDescription>
          Building schedule for {weekLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-12 space-y-10">
        <div className="relative flex items-center justify-center">
          {/* Subtle pinging outer ring */}
          <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-amber-500 duration-1000" />
          <div className="absolute inset-2 rounded-full animate-ping opacity-20 bg-rose-500 delay-300 duration-1000" />
          {/* Center icon container */}
          <div className="h-24 w-24 rounded-full bg-amber-500/5 flex items-center justify-center relative shadow-inner overflow-hidden border border-amber-500/20">
             <div className="absolute inset-0 bg-amber-500/10 blur-xl animate-pulse" />
             <Cpu className="h-12 w-12 animate-[bounce_2s_infinite]" style={{ stroke: "url(#ai-icon-gradient)" }} />
          </div>
        </div>
        
        <div className="w-full max-w-sm space-y-3">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-muted-foreground animate-pulse">
              {GENERATION_STEPS[stepIndex]?.message ?? "Optimizing shift assignments..."}
            </span>
            <span className="text-amber-600 dark:text-amber-500 font-mono">
              {Math.round(progress)}%
            </span>
          </div>
          
          <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden border shadow-inner">
            <div
              className={`h-full ai-gradient relative ${
                settled
                  ? "transition-all duration-500 ease-out"
                  : "transition-all duration-200 ease-out"
              }`}
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite] -translate-x-full" 
                   style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground opacity-80">
            Balancing constraints, availability, and labor requirements...
          </p>
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Failure Step
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
        {error && !generatedSchedule && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        )}

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

// ────────────────────────────────────────────────────────────
// Fully Scheduled Step
// ────────────────────────────────────────────────────────────

interface FullyScheduledStepProps {
  weekLabel: string;
  onCancel: () => void;
}

function FullyScheduledStep({ weekLabel, onCancel }: FullyScheduledStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Schedule Complete
        </DialogTitle>
        <DialogDescription>
          No new shifts needed for {weekLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="font-medium">All Requirements Met</p>
          <p className="text-sm text-muted-foreground">
            All the shift slots for this week have already been filled by existing shifts. 
            If you wanted to regenerate the schedule from scratch, you should clear the week schedule first.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onCancel}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

