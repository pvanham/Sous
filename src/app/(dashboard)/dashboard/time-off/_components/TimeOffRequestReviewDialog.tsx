"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import { updateTimeOffRequestStatus } from "@/server/actions/time-off-request.actions";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import { timeOffRequestKeys } from "./TimeOffRequestTable";

// Badge variant mapping for statuses
function getStatusBadgeVariant(
  status: string
): "outline" | "default" | "destructive" {
  switch (status) {
    case "pending":
      return "outline";
    case "approved":
      return "default";
    case "denied":
      return "destructive";
    default:
      return "outline";
  }
}

interface TimeOffRequestReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TimeOffRequestDTO | null;
  staffName: string;
}

export function TimeOffRequestReviewDialog({
  open,
  onOpenChange,
  request,
  staffName,
}: TimeOffRequestReviewDialogProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  // Reset/pre-populate notes when request changes
  // For reviewed requests, show existing notes; for pending, start empty
  useEffect(() => {
    if (request) {
      setNotes(request.status !== "pending" ? (request.notes ?? "") : "");
    } else {
      setNotes("");
    }
  }, [request]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!request) return;
      const result = await updateTimeOffRequestStatus({
        requestId: request.id,
        status: "approved",
        notes: notes || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Time-off request approved");
      queryClient.invalidateQueries({ queryKey: timeOffRequestKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Deny mutation
  const denyMutation = useMutation({
    mutationFn: async () => {
      if (!request) return;
      const result = await updateTimeOffRequestStatus({
        requestId: request.id,
        status: "denied",
        notes: notes || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Time-off request denied");
      queryClient.invalidateQueries({ queryKey: timeOffRequestKeys.list() });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isPending = approveMutation.isPending || denyMutation.isPending;

  if (!request) return null;

  const statusLabel =
    request.status.charAt(0).toUpperCase() + request.status.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review Time-Off Request</DialogTitle>
          <DialogDescription>
            {request.status === "pending"
              ? "Approve or deny this time-off request."
              : "View or update this time-off request."}
          </DialogDescription>
        </DialogHeader>

        {/* Request Details */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Staff Member</span>
              <p className="font-medium">{staffName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <div>
                <Badge variant={getStatusBadgeVariant(request.status)}>
                  {statusLabel}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Start Date</span>
              <p className="font-medium">
                {format(new Date(request.startDate), "MMM d, yyyy")}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">End Date</span>
              <p className="font-medium">
                {format(new Date(request.endDate), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {request.reason && (
            <div className="text-sm">
              <span className="text-muted-foreground">Reason</span>
              <p className="font-medium">{request.reason}</p>
            </div>
          )}

          <div className="text-sm">
            <span className="text-muted-foreground">Submitted</span>
            <p className="font-medium">
              {format(new Date(request.createdAt), "MMM d, yyyy")}
            </p>
          </div>

          {/* Show review info for already-reviewed requests */}
          {request.status !== "pending" && request.reviewedAt && (
            <div className="text-sm">
              <span className="text-muted-foreground">Reviewed On</span>
              <p className="font-medium">
                {format(new Date(request.reviewedAt), "MMM d, yyyy")}
              </p>
            </div>
          )}

          {/* Manager Notes */}
          <div className="pt-2">
            <Label htmlFor="review-notes">Notes (optional)</Label>
            <Textarea
              id="review-notes"
              placeholder="Add a note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              className="mt-1.5 min-h-[80px] resize-y"
            />
          </div>
        </div>

        <DialogFooter className="pt-4 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="destructive"
            onClick={() => denyMutation.mutate()}
            disabled={isPending || request.status === "denied"}
            className="mr-auto"
          >
            {denyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Deny
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => approveMutation.mutate()}
            disabled={isPending || request.status === "approved"}
          >
            {approveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
