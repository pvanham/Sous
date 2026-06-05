"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Loader2, Plus, MinusCircle } from "lucide-react";

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

import {
  reviewSkillChangeRequest,
  reviewSkillChangeRequestsBatch,
} from "@/server/actions/skill-change-request.actions";
import type { SkillChangeRequestDTO } from "@/types/skill-change-request";

function ProficiencyStars({ level }: { level: number }) {
  return (
    <span className="text-yellow-500">
      {"★".repeat(level)}
      {"☆".repeat(5 - level)}
    </span>
  );
}

interface SkillChangeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName: string;
  staffId: string;
  /** Pending requests for this staff member. */
  requests: SkillChangeRequestDTO[];
}

export function SkillChangeReviewDialog({
  open,
  onOpenChange,
  staffName,
  staffId,
  requests,
}: SkillChangeReviewDialogProps) {
  const queryClient = useQueryClient();
  // Track which single request row is mid-flight so only its buttons spin.
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["skillChangeRequests"] });
    // Approvals mutate Staff.skills, so refresh the staff list too.
    queryClient.invalidateQueries({ queryKey: ["staff"] });
  }

  const reviewOne = useMutation({
    mutationFn: async (input: {
      requestId: string;
      decision: "approve" | "deny";
    }) => {
      setActiveRequestId(input.requestId);
      const result = await reviewSkillChangeRequest(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.type === "add" ? "Addition" : "Removal"} ${data.status}`,
      );
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setActiveRequestId(null);
    },
  });

  const reviewAll = useMutation({
    mutationFn: async (decision: "approve" | "deny") => {
      const result = await reviewSkillChangeRequestsBatch({
        staffId,
        decision,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data, decision) => {
      toast.success(
        `${decision === "approve" ? "Approved" : "Denied"} ${data.resolved} skill change${data.resolved === 1 ? "" : "s"}`,
      );
      invalidate();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isBusy = reviewOne.isPending || reviewAll.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review skill changes</DialogTitle>
          <DialogDescription>
            {staffName} has {requests.length} pending skill change
            {requests.length === 1 ? "" : "s"}. Additions only take effect once
            approved; removals stay active until you approve them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending skill changes.
            </p>
          ) : (
            requests.map((request) => {
              const rowBusy = activeRequestId === request.id;
              return (
                <div
                  key={request.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {request.type === "add" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-400 text-emerald-600"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-amber-600"
                        >
                          <MinusCircle className="mr-1 h-3 w-3" />
                          Remove
                        </Badge>
                      )}
                      <span className="font-medium">{request.station}</span>
                      {request.type === "add" && (
                        <ProficiencyStars level={request.proficiency} />
                      )}
                    </div>
                    {request.type === "remove" && request.reason && (
                      <p className="text-sm text-muted-foreground">
                        Reason: {request.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      title="Deny"
                      disabled={isBusy}
                      onClick={() =>
                        reviewOne.mutate({
                          requestId: request.id,
                          decision: "deny",
                        })
                      }
                    >
                      {rowBusy && reviewOne.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-emerald-600 hover:text-emerald-600"
                      title="Approve"
                      disabled={isBusy}
                      onClick={() =>
                        reviewOne.mutate({
                          requestId: request.id,
                          decision: "approve",
                        })
                      }
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {requests.length > 1 && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={isBusy}
              onClick={() => reviewAll.mutate("deny")}
            >
              {reviewAll.isPending && reviewAll.variables === "deny" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Deny all
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => reviewAll.mutate("approve")}
            >
              {reviewAll.isPending && reviewAll.variables === "approve" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve all
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
