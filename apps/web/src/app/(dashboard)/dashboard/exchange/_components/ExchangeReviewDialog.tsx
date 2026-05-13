"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Check,
  X,
  Info,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  approveExchangeShift,
  denyExchangeShift,
  getExchangeShiftViability,
} from "@/server/actions/exchange-shift.actions";
import type {
  ExchangeShiftDTO,
  ExchangeShiftViabilityDTO,
} from "@/types/exchange-shift";

import { exchangeQueryKeys } from "./ExchangeBoard";

interface ExchangeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ExchangeShiftDTO | null;
}

export function ExchangeReviewDialog({
  open,
  onOpenChange,
  row,
}: ExchangeReviewDialogProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (row) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotes(row.managerNotes ?? "");
    } else {
      setNotes("");
    }
  }, [row]);

  const viabilityQuery = useQuery({
    queryKey: ["exchangeShifts", "viability", row?.id],
    queryFn: async () => {
      if (!row) return null;
      const result = await getExchangeShiftViability(row.id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open && !!row,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const result = await approveExchangeShift({ exchangeId: row.id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Exchange approved");
      queryClient.invalidateQueries({ queryKey: exchangeQueryKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const denyMutation = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const result = await denyExchangeShift({
        exchangeId: row.id,
        notes: notes || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Exchange denied");
      queryClient.invalidateQueries({ queryKey: exchangeQueryKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!row) return null;

  const isPending = row.status === "pending_coverage";
  const acting = approveMutation.isPending || denyMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review shift exchange</DialogTitle>
          <DialogDescription>
            {format(new Date(row.start), "EEEE, MMMM d")} ·{" "}
            {format(new Date(row.start), "p")} –{" "}
            {format(new Date(row.end), "p")} · {row.station}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ParticipantsCard
            droppedByName={row.droppedByName}
            pickedUpByName={row.pickedUpByName ?? null}
            status={row.status}
            reason={row.reason}
            managerNotes={row.managerNotes ?? null}
          />

          <ViabilitySection
            row={row}
            viability={viabilityQuery.data ?? null}
            loading={viabilityQuery.isLoading}
            error={
              viabilityQuery.error instanceof Error
                ? viabilityQuery.error.message
                : null
            }
          />

          {isPending && (
            <div className="space-y-2">
              <Label htmlFor="manager-notes">Notes (optional)</Label>
              <Textarea
                id="manager-notes"
                placeholder="Add a note for the dropper / picker (shown if you deny)…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={acting}
          >
            Close
          </Button>
          {isPending && (
            <>
              <Button
                variant="destructive"
                onClick={() => denyMutation.mutate()}
                disabled={acting}
              >
                {denyMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Deny
              </Button>
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={acting}
              >
                {approveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantsCard({
  droppedByName,
  pickedUpByName,
  status,
  reason,
  managerNotes,
}: {
  droppedByName: string;
  pickedUpByName: string | null;
  status: string;
  reason: string;
  managerNotes: string | null;
}) {
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Dropper
          </div>
          <div className="text-sm font-medium mt-1">{droppedByName}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Picker
          </div>
          <div className="text-sm font-medium mt-1">
            {pickedUpByName ?? (
              <span className="text-muted-foreground">— (no pickup yet)</span>
            )}
          </div>
        </div>
      </div>

      {reason ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Reason from dropper
          </div>
          <div className="text-sm mt-1">{reason}</div>
        </div>
      ) : null}

      {managerNotes && status !== "pending_coverage" ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Manager notes
          </div>
          <div className="text-sm mt-1">{managerNotes}</div>
        </div>
      ) : null}
    </div>
  );
}

function ViabilitySection({
  row,
  viability,
  loading,
  error,
}: {
  row: ExchangeShiftDTO;
  viability: ExchangeShiftViabilityDTO | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-md border p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Computing impact…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to compute viability: {error}
      </div>
    );
  }

  if (!viability) {
    return null;
  }

  const showPickerSide = row.status !== "available";

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        Switch viability
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <HoursCard
          title="Dropper this week"
          name={viability.dropperName}
          hoursBefore={viability.dropperHoursBefore}
          hoursAfter={viability.dropperHoursAfter}
          maxHours={viability.dropperMaxHoursPerWeek}
          warnOvertime={false}
          inactive={!viability.dropperIsActive}
        />
        {showPickerSide && viability.pickerName ? (
          <HoursCard
            title="Picker this week"
            name={viability.pickerName}
            hoursBefore={viability.pickerHoursBefore}
            hoursAfter={viability.pickerHoursAfter}
            maxHours={viability.pickerMaxHoursPerWeek}
            warnOvertime={viability.pickerOvertime}
            inactive={!viability.pickerIsActive}
          />
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground flex items-center justify-center">
            No picker yet
          </div>
        )}
      </div>

      {showPickerSide && viability.pickerName ? (
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Picker eligibility checks
          </div>
          <ul className="space-y-1.5 text-sm">
            <CheckRow
              ok={viability.pickerHasSkill}
              okLabel={`Has ${row.station} skill${
                viability.pickerStationProficiency
                  ? ` (proficiency ${viability.pickerStationProficiency}/5)`
                  : ""
              }`}
              warnLabel={`No ${row.station} skill on file`}
            />
            <CheckRow
              ok={viability.pickerHasMatchingRole}
              okLabel={`Shares a role with dropper (${matchingRoles(viability)})`}
              warnLabel={`No shared role (picker: ${viability.pickerRoles.join(", ") || "none"}; dropper: ${viability.dropperRoles.join(", ") || "none"})`}
            />
            <CheckRow
              ok={!viability.pickerHasOverlap}
              okLabel="No overlapping shift this week"
              warnLabel="Already scheduled during this window"
              severity="error"
            />
            <CheckRow
              ok={!viability.pickerOvertime}
              okLabel={`Stays under ${viability.pickerMaxHoursPerWeek}h cap`}
              warnLabel={`Pushes past ${viability.pickerMaxHoursPerWeek}h cap (${viability.pickerHoursAfter}h)`}
            />
            <CheckRow
              ok={!viability.pickerClopenRisk}
              okLabel={
                viability.pickerMinTurnaroundHours === null
                  ? `No adjacent shift this week`
                  : `Turnaround ${viability.pickerMinTurnaroundHours}h (≥ ${viability.clopenThresholdHours}h)`
              }
              warnLabel={
                viability.pickerMinTurnaroundHours === null
                  ? "Clopen check not applicable"
                  : `Clopen risk: only ${viability.pickerMinTurnaroundHours}h gap (threshold ${viability.clopenThresholdHours}h)`
              }
            />
            <CheckRow
              ok={viability.pickerIsActive}
              okLabel="Picker is active"
              warnLabel="Picker account is INACTIVE"
              severity="error"
            />
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function matchingRoles(v: ExchangeShiftViabilityDTO): string {
  const shared = v.pickerRoles.filter((r) => v.dropperRoles.includes(r));
  return shared.join(", ") || "—";
}

function HoursCard({
  title,
  name,
  hoursBefore,
  hoursAfter,
  maxHours,
  warnOvertime,
  inactive,
}: {
  title: string;
  name: string;
  hoursBefore: number;
  hoursAfter: number;
  maxHours: number;
  warnOvertime: boolean;
  inactive: boolean;
}) {
  const delta = hoursAfter - hoursBefore;
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm font-medium">{name}</span>
        {inactive && (
          <Badge variant="outline" className="text-[10px]">
            INACTIVE
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {hoursAfter}h
        </span>
        <span
          className={`text-xs tabular-nums ${
            delta > 0
              ? "text-emerald-700 dark:text-emerald-400"
              : delta < 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta}h vs {hoursBefore}h
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        cap {maxHours}h/week
      </div>
      {warnOvertime && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Exceeds weekly cap
        </div>
      )}
    </div>
  );
}

function CheckRow({
  ok,
  okLabel,
  warnLabel,
  severity = "warning",
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
  severity?: "warning" | "error";
}) {
  if (ok) {
    return (
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>{okLabel}</span>
      </li>
    );
  }
  return (
    <li
      className={`flex items-center gap-2 ${
        severity === "error"
          ? "text-destructive"
          : "text-amber-700 dark:text-amber-400"
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{warnLabel}</span>
    </li>
  );
}
