"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  listExchangeShiftsForManager,
  cancelExchangeShiftAsManager,
} from "@/server/actions/exchange-shift.actions";
import type {
  ExchangeShiftDTO,
  ExchangeShiftStatus,
} from "@/types/exchange-shift";

import { ExchangeReviewDialog } from "./ExchangeReviewDialog";

type StatusFilter = "all" | ExchangeShiftStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_coverage", label: "Pending" },
  { value: "available", label: "Available" },
  { value: "manager_approved", label: "Approved" },
  { value: "covered", label: "Covered" },
  { value: "denied", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
];

export const exchangeQueryKeys = {
  all: ["exchangeShifts"] as const,
  list: () => [...exchangeQueryKeys.all, "list"] as const,
};

const STATUS_LABELS: Record<ExchangeShiftStatus, string> = {
  available: "Available",
  pending_coverage: "Pending",
  covered: "Covered",
  manager_approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

function statusBadgeVariant(
  status: ExchangeShiftStatus
):
  | "outline"
  | "default"
  | "destructive"
  | "secondary"
  | "warning"
  | "success"
  | "info" {
  switch (status) {
    case "pending_coverage":
      return "warning";
    case "available":
      return "info";
    case "covered":
    case "manager_approved":
      return "success";
    case "denied":
      return "destructive";
    case "cancelled":
    default:
      return "outline";
  }
}

interface ExchangeBoardProps {
  initialRows: ExchangeShiftDTO[];
}

export function ExchangeBoard({ initialRows }: ExchangeBoardProps) {
  const queryClient = useQueryClient();

  // Default to "Pending" because that is the action-required bucket;
  // managers visit this page to approve / deny.
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("pending_coverage");
  const [reviewRow, setReviewRow] = useState<ExchangeShiftDTO | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: exchangeQueryKeys.list(),
    queryFn: async () => {
      const result = await listExchangeShiftsForManager({});
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialRows,
  });

  const cancelMutation = useMutation({
    mutationFn: async (exchangeId: string) => {
      const result = await cancelExchangeShiftAsManager({ exchangeId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Drop cancelled");
      queryClient.invalidateQueries({ queryKey: exchangeQueryKeys.list() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredRows = useMemo(() => {
    const base =
      statusFilter === "all"
        ? (rows ?? [])
        : (rows ?? []).filter((r) => r.status === statusFilter);

    // Pending is the action-required bucket — sort by shift start
    // ascending so the soonest shift bubbles to the top. All other
    // tabs keep the server's "most recent activity first" ordering.
    if (statusFilter === "pending_coverage") {
      return [...base].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    }

    return base;
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const map = new Map<StatusFilter, number>();
    map.set("all", rows?.length ?? 0);
    for (const r of rows ?? []) {
      map.set(r.status, (map.get(r.status) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {counts.get(tab.value) ? (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {counts.get(tab.value)}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="text-lg font-medium">No exchange requests</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {statusFilter === "all"
              ? "Nobody has dropped a shift onto the exchange board yet."
              : statusFilter === "pending_coverage"
                ? "No pickups awaiting approval — staff pickups land here once submitted."
                : `No exchanges in the "${STATUS_LABELS[statusFilter as ExchangeShiftStatus] ?? statusFilter}" bucket.`}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift</TableHead>
                <TableHead>Station</TableHead>
                <TableHead>Dropped by</TableHead>
                <TableHead>Picked up by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {format(new Date(row.start), "EEE MMM d")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(row.start), "p")} –{" "}
                      {format(new Date(row.end), "p")}
                    </div>
                  </TableCell>
                  <TableCell>{row.station}</TableCell>
                  <TableCell>{row.droppedByName}</TableCell>
                  <TableCell>
                    {row.pickedUpByName ? (
                      row.pickedUpByName
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status)}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(row.updatedAt), "MMM d, p")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setReviewRow(row)}
                        title="Review"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(row.status === "available" ||
                        row.status === "pending_coverage") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate(row.id)}
                          disabled={cancelMutation.isPending}
                          className="text-destructive hover:text-destructive"
                          title={
                            row.status === "available"
                              ? "Cancel this drop"
                              : "Cancel this drop (picker loses the pickup)"
                          }
                        >
                          {cancelMutation.isPending && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ExchangeReviewDialog
        open={!!reviewRow}
        onOpenChange={(open) => {
          if (!open) setReviewRow(null);
        }}
        row={reviewRow}
      />
    </div>
  );
}
